import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

import { PostgresService } from '../../database/postgres.service';
import { WalletRuleError } from './wallet.errors';

export interface WalletAccountView {
  accountId: string;
  userProfileId: string;
  phoneE164: string;
  firstName: string;
  lastName: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEPARTED';
  currency: 'TRY';
  availableMinor: string;
  heldMinor: string;
}

export interface WalletEntryView {
  id: string;
  entryType:
    | 'CASH_DEPOSIT'
    | 'CASH_DEPOSIT_REVERSAL'
    | 'HOLD'
    | 'CAPTURE'
    | 'RELEASE'
    | 'SERVICE_REFUND';
  availableDeltaMinor: string;
  heldDeltaMinor: string;
  actorName: string | null;
  serviceCode: string | null;
  referenceId: string | null;
  reversalOfEntryId: string | null;
  reason: string | null;
  reversed: boolean;
  createdAt: Date;
}

export interface WalletMutationResult {
  account: WalletAccountView;
  entry: WalletEntryView;
  duplicate: boolean;
}

interface AccountRow {
  account_id: string;
  user_profile_id: string;
  phone_e164: string;
  first_name: string;
  last_name: string;
  status: WalletAccountView['status'];
  currency: 'TRY';
  available_minor: string;
  held_minor: string;
}

interface EntryRow {
  id: string;
  entry_type: WalletEntryView['entryType'];
  available_delta_minor: string;
  held_delta_minor: string;
  actor_name: string | null;
  service_code: string | null;
  reference_id: string | null;
  reversal_of_entry_id: string | null;
  reason: string | null;
  reversed: boolean;
  created_at: Date;
}

interface ProfileRow {
  id: string;
}

interface ExistingEntryRow {
  id: string;
  account_id: string;
  entry_type: WalletEntryView['entryType'];
  available_delta_minor: string;
  reversal_of_entry_id: string | null;
}

interface ReversibleDepositRow extends AccountRow {
  entry_id: string;
  entry_type: WalletEntryView['entryType'];
  deposit_amount_minor: string;
  reversed_by_entry_id: string | null;
}

function accountView(row: AccountRow): WalletAccountView {
  return {
    accountId: row.account_id,
    userProfileId: row.user_profile_id,
    phoneE164: row.phone_e164,
    firstName: row.first_name,
    lastName: row.last_name,
    status: row.status,
    currency: row.currency,
    availableMinor: row.available_minor,
    heldMinor: row.held_minor,
  };
}

function entryView(row: EntryRow): WalletEntryView {
  return {
    id: row.id,
    entryType: row.entry_type,
    availableDeltaMinor: row.available_delta_minor,
    heldDeltaMinor: row.held_delta_minor,
    actorName: row.actor_name,
    serviceCode: row.service_code,
    referenceId: row.reference_id,
    reversalOfEntryId: row.reversal_of_entry_id,
    reason: row.reason,
    reversed: row.reversed,
    createdAt: row.created_at,
  };
}

@Injectable()
export class WalletRepository {
  constructor(private readonly postgres: PostgresService) {}

  async findAccountBySubject(
    subject: string,
  ): Promise<WalletAccountView | null> {
    const result = await this.postgres.query<AccountRow>(
      `${this.accountSelect()}
      WHERE profile.keycloak_subject = $1`,
      [subject],
    );

    return result.rows[0] ? accountView(result.rows[0]) : null;
  }

  async findAccountById(accountId: string): Promise<WalletAccountView | null> {
    const result = await this.postgres.query<AccountRow>(
      `${this.accountSelect()}
      WHERE account.id = $1`,
      [accountId],
    );

    return result.rows[0] ? accountView(result.rows[0]) : null;
  }

  async listEntries(accountId: string, limit = 50): Promise<WalletEntryView[]> {
    const result = await this.postgres.query<EntryRow>(
      `${this.entrySelect()}
      WHERE entry.account_id = $1
      ORDER BY entry.created_at DESC, entry.id DESC
      LIMIT $2`,
      [accountId, limit],
    );

    return result.rows.map(entryView);
  }

  async searchAccounts(
    phonePrefix: string | null,
  ): Promise<WalletAccountView[]> {
    if (!phonePrefix) {
      return [];
    }

    const result = await this.postgres.query<AccountRow>(
      `${this.accountSelect()}
      WHERE profile.phone_e164 LIKE $1 || '%'
      ORDER BY profile.phone_e164
      LIMIT 20`,
      [phonePrefix],
    );

    return result.rows.map(accountView);
  }

  async createCashDeposit(input: {
    actorSubject: string;
    targetPhoneE164: string;
    amountMinor: bigint;
    idempotencyKey: string;
  }): Promise<WalletMutationResult> {
    return this.postgres.withTransaction(async (client) => {
      const actor = await this.findActor(client, input.actorSubject);
      const target = await this.lockAccountByPhone(
        client,
        input.targetPhoneE164,
      );

      if (!target) {
        throw new WalletRuleError('TARGET_NOT_FOUND');
      }

      if (target.status !== 'ACTIVE') {
        throw new WalletRuleError('TARGET_NOT_ACTIVE');
      }

      if (actor.id === target.user_profile_id) {
        throw new WalletRuleError('SELF_DEPOSIT');
      }

      const existing = await this.findEntryByIdempotencyKey(
        client,
        input.idempotencyKey,
      );

      if (existing) {
        if (
          existing.account_id !== target.account_id ||
          existing.entry_type !== 'CASH_DEPOSIT' ||
          BigInt(existing.available_delta_minor) !== input.amountMinor
        ) {
          throw new WalletRuleError('IDEMPOTENCY_CONFLICT');
        }

        return this.mutationResult(
          client,
          target.account_id,
          existing.id,
          true,
        );
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO wallet.ledger_entry (
          account_id,
          entry_type,
          available_delta_minor,
          idempotency_key,
          actor_user_profile_id
        ) VALUES ($1, 'CASH_DEPOSIT', $2, $3, $4)
        RETURNING id`,
        [
          target.account_id,
          input.amountMinor.toString(),
          input.idempotencyKey,
          actor.id,
        ],
      );

      await client.query(
        `UPDATE wallet.account
        SET available_minor = available_minor + $2,
            updated_at = now()
        WHERE id = $1`,
        [target.account_id, input.amountMinor.toString()],
      );

      return this.mutationResult(
        client,
        target.account_id,
        inserted.rows[0].id,
        false,
      );
    });
  }

  async reverseCashDeposit(input: {
    actorSubject: string;
    entryId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<WalletMutationResult> {
    return this.postgres.withTransaction(async (client) => {
      const actor = await this.findActor(client, input.actorSubject);
      const deposit = await this.lockDeposit(client, input.entryId);

      if (!deposit) {
        throw new WalletRuleError('ENTRY_NOT_FOUND');
      }

      const existing = await this.findEntryByIdempotencyKey(
        client,
        input.idempotencyKey,
      );

      if (existing) {
        if (
          existing.entry_type !== 'CASH_DEPOSIT_REVERSAL' ||
          existing.reversal_of_entry_id !== deposit.entry_id
        ) {
          throw new WalletRuleError('IDEMPOTENCY_CONFLICT');
        }

        return this.mutationResult(
          client,
          deposit.account_id,
          existing.id,
          true,
        );
      }

      if (deposit.entry_type !== 'CASH_DEPOSIT') {
        throw new WalletRuleError('NOT_CASH_DEPOSIT');
      }

      if (deposit.reversed_by_entry_id) {
        throw new WalletRuleError('ALREADY_REVERSED');
      }

      const amountMinor = BigInt(deposit.deposit_amount_minor);

      if (BigInt(deposit.available_minor) < amountMinor) {
        throw new WalletRuleError('INSUFFICIENT_AVAILABLE');
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO wallet.ledger_entry (
          account_id,
          entry_type,
          available_delta_minor,
          idempotency_key,
          actor_user_profile_id,
          reversal_of_entry_id,
          reason
        ) VALUES ($1, 'CASH_DEPOSIT_REVERSAL', $2, $3, $4, $5, $6)
        RETURNING id`,
        [
          deposit.account_id,
          (-amountMinor).toString(),
          input.idempotencyKey,
          actor.id,
          deposit.entry_id,
          input.reason,
        ],
      );

      await client.query(
        `UPDATE wallet.account
        SET available_minor = available_minor - $2,
            updated_at = now()
        WHERE id = $1`,
        [deposit.account_id, amountMinor.toString()],
      );

      return this.mutationResult(
        client,
        deposit.account_id,
        inserted.rows[0].id,
        false,
      );
    });
  }

  private async findActor(client: PoolClient, subject: string) {
    const result = await client.query<ProfileRow>(
      `SELECT id
      FROM core.user_profile
      WHERE keycloak_subject = $1 AND status = 'ACTIVE'`,
      [subject],
    );

    if (!result.rows[0]) {
      throw new WalletRuleError('ACTOR_PROFILE_NOT_FOUND');
    }

    return result.rows[0];
  }

  private async lockAccountByPhone(
    client: PoolClient,
    phoneE164: string,
  ): Promise<AccountRow | null> {
    const result = await client.query<AccountRow>(
      `${this.accountSelect()}
      WHERE profile.phone_e164 = $1
      FOR UPDATE OF account`,
      [phoneE164],
    );

    return result.rows[0] ?? null;
  }

  private async lockDeposit(
    client: PoolClient,
    entryId: string,
  ): Promise<ReversibleDepositRow | null> {
    const result = await client.query<ReversibleDepositRow>(
      `SELECT
        account.id AS account_id,
        profile.id AS user_profile_id,
        profile.phone_e164,
        profile.first_name,
        profile.last_name,
        profile.status,
        account.currency,
        account.available_minor::text,
        account.held_minor::text,
        original.id AS entry_id,
        original.entry_type,
        original.available_delta_minor::text AS deposit_amount_minor,
        reversal.id AS reversed_by_entry_id
      FROM wallet.ledger_entry AS original
      JOIN wallet.account AS account ON account.id = original.account_id
      JOIN core.user_profile AS profile ON profile.id = account.user_profile_id
      LEFT JOIN wallet.ledger_entry AS reversal
        ON reversal.reversal_of_entry_id = original.id
      WHERE original.id = $1
      FOR UPDATE OF account, original`,
      [entryId],
    );

    return result.rows[0] ?? null;
  }

  private async findEntryByIdempotencyKey(
    client: PoolClient,
    idempotencyKey: string,
  ): Promise<ExistingEntryRow | null> {
    const result = await client.query<ExistingEntryRow>(
      `SELECT
        id,
        account_id,
        entry_type,
        available_delta_minor::text,
        reversal_of_entry_id
      FROM wallet.ledger_entry
      WHERE idempotency_key = $1`,
      [idempotencyKey],
    );

    return result.rows[0] ?? null;
  }

  private async mutationResult(
    client: PoolClient,
    accountId: string,
    entryId: string,
    duplicate: boolean,
  ): Promise<WalletMutationResult> {
    const [accountResult, entryResult] = await Promise.all([
      client.query<AccountRow>(
        `${this.accountSelect()}
        WHERE account.id = $1`,
        [accountId],
      ),
      client.query<EntryRow>(
        `${this.entrySelect()}
        WHERE entry.id = $1`,
        [entryId],
      ),
    ]);

    return {
      account: accountView(accountResult.rows[0]),
      entry: entryView(entryResult.rows[0]),
      duplicate,
    };
  }

  private accountSelect() {
    return `SELECT
      account.id AS account_id,
      profile.id AS user_profile_id,
      profile.phone_e164,
      profile.first_name,
      profile.last_name,
      profile.status,
      account.currency,
      account.available_minor::text,
      account.held_minor::text
    FROM core.user_profile AS profile
    JOIN wallet.account AS account ON account.user_profile_id = profile.id`;
  }

  private entrySelect() {
    return `SELECT
      entry.id,
      entry.entry_type,
      entry.available_delta_minor::text,
      entry.held_delta_minor::text,
      CASE
        WHEN actor.id IS NULL THEN NULL
        ELSE concat_ws(' ', actor.first_name, actor.last_name)
      END AS actor_name,
      entry.service_code,
      entry.reference_id,
      entry.reversal_of_entry_id,
      entry.reason,
      (reversal.id IS NOT NULL) AS reversed,
      entry.created_at
    FROM wallet.ledger_entry AS entry
    LEFT JOIN core.user_profile AS actor
      ON actor.id = entry.actor_user_profile_id
    LEFT JOIN wallet.ledger_entry AS reversal
      ON reversal.reversal_of_entry_id = entry.id`;
  }
}
