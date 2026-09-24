import { Injectable } from '@nestjs/common';
import type { PoolClient, QueryResultRow } from 'pg';

import { PostgresService } from '../../database/postgres.service';
import { WalletRuleError } from '../wallet/wallet.errors';
import { WalletRepository } from '../wallet/wallet.repository';
import {
  LAUNDRY_MACHINES,
  LAUNDRY_SERVICE_CODE,
  machineCode,
  type LaundryMachineType,
} from './laundry.constants';
import { LaundryRuleError } from './laundry.errors';

interface ActorRow extends QueryResultRow {
  id: string;
}

interface ServiceRow extends QueryResultRow {
  id: string;
  wash_price_minor: string;
  dry_price_minor: string;
  updated_at: Date;
}

interface CustomerRow extends QueryResultRow {
  user_profile_id: string;
  phone_e164: string;
  first_name: string;
  last_name: string;
  status: string;
  account_id: string;
  available_minor: string;
}

interface RunRow extends QueryResultRow {
  id: string;
  load_id: string;
  machine_type: LaundryMachineType;
  machine_number: number;
  status: 'IN_MACHINE' | 'REMOVED';
  price_minor: string;
  idempotency_key: string;
  started_at: Date;
  removed_at: Date | null;
}

interface LoadRow extends QueryResultRow {
  id: string;
  owner_user_profile_id: string;
  phone_e164: string;
  first_name: string;
  last_name: string;
  status: 'ACTIVE' | 'COMPLETED' | 'REFUNDED';
  created_at: Date;
  completed_at: Date | null;
  refunded_at: Date | null;
  refund_reason: string | null;
  refund_idempotency_key: string | null;
  runs: RunView[];
  events: EventView[];
}

export interface EventView {
  id: string;
  runId: string | null;
  eventType: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface RunView {
  id: string;
  machineType: LaundryMachineType;
  machineNumber: number;
  machineCode: string;
  status: 'IN_MACHINE' | 'REMOVED';
  priceMinor: string;
  startedAt: string;
  removedAt: string | null;
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  );
}

@Injectable()
export class LaundryRepository {
  constructor(
    private readonly postgres: PostgresService,
    private readonly wallet: WalletRepository,
  ) {}

  async getConfig() {
    const service = await this.findService();
    if (!service) {
      throw new LaundryRuleError('SERVICE_NOT_FOUND');
    }
    return this.configView(service, await this.activeMachineMap());
  }

  async getMyLoads(subject: string) {
    const profile = await this.postgres.query<{ id: string }>(
      `SELECT id FROM core.user_profile WHERE keycloak_subject = $1`,
      [subject],
    );
    if (!profile.rows[0]) {
      throw new LaundryRuleError('CUSTOMER_NOT_FOUND');
    }

    const loads = await this.listLoads(
      `load.owner_user_profile_id = $1`,
      [profile.rows[0].id],
      100,
    );
    return {
      activeLoads: loads.filter((load) => load.status === 'ACTIVE'),
      history: loads.filter((load) => load.status !== 'ACTIVE'),
    };
  }

  async getManagementView() {
    const service = await this.findService();
    if (!service) {
      throw new LaundryRuleError('SERVICE_NOT_FOUND');
    }
    const [machineMap, activeLoads, recentLoads] = await Promise.all([
      this.activeMachineMap(),
      this.listLoads(`load.status = 'ACTIVE'`, [], 100),
      this.listLoads(`load.status <> 'ACTIVE'`, [], 100),
    ]);
    const config = this.configView(service, machineMap);
    return {
      tariffs: config.tariffs,
      machines: config.machines,
      activeLoads,
      recentLoads,
    };
  }

  async searchCustomers(phonePrefix: string) {
    const result = await this.postgres.query<CustomerRow>(
      `${this.customerSelect()}
      WHERE profile.phone_e164 LIKE $1 || '%'
        AND profile.status = 'ACTIVE'
      ORDER BY profile.phone_e164
      LIMIT 20`,
      [phonePrefix],
    );
    return result.rows.map(this.customerView);
  }

  async createLoad(input: {
    actorSubject: string;
    phoneE164: string;
    machineType: LaundryMachineType;
    machineNumber: number;
    idempotencyKey: string;
  }) {
    try {
      return await this.postgres.withTransaction(async (client) => {
        const actor = await this.findActor(client, input.actorSubject);
        const service = await this.findService(client);
        if (!service) throw new LaundryRuleError('SERVICE_NOT_FOUND');

        const existing = await client.query<{ id: string }>(
          `SELECT id FROM laundry.load WHERE create_idempotency_key = $1`,
          [input.idempotencyKey],
        );
        if (existing.rows[0]) {
          const load = await this.getLoad(client, existing.rows[0].id);
          const run = load?.runs[0];
          if (
            !load ||
            load.phoneE164 !== input.phoneE164 ||
            run?.machineType !== input.machineType ||
            run.machineNumber !== input.machineNumber
          ) {
            throw new LaundryRuleError('IDEMPOTENCY_CONFLICT');
          }
          return load;
        }

        const customer = await this.lockCustomerByPhone(
          client,
          input.phoneE164,
        );
        if (!customer) throw new LaundryRuleError('CUSTOMER_NOT_FOUND');
        if (customer.status !== 'ACTIVE') {
          throw new LaundryRuleError('CUSTOMER_NOT_ACTIVE');
        }

        const load = await client.query<{ id: string }>(
          `INSERT INTO laundry.load (
            service_unit_id, owner_user_profile_id, create_idempotency_key,
            created_by_user_profile_id
          ) VALUES ($1, $2, $3, $4)
          RETURNING id`,
          [
            service.id,
            customer.user_profile_id,
            input.idempotencyKey,
            actor.id,
          ],
        );
        const priceMinor =
          input.machineType === 'WASH'
            ? service.wash_price_minor
            : service.dry_price_minor;
        const run = await this.insertRun(client, {
          loadId: load.rows[0].id,
          actorId: actor.id,
          machineType: input.machineType,
          machineNumber: input.machineNumber,
          priceMinor,
          idempotencyKey: input.idempotencyKey,
        });

        await this.wallet.chargeServiceInTransaction(client, {
          actorSubject: input.actorSubject,
          userProfileId: customer.user_profile_id,
          amountMinor: BigInt(priceMinor),
          serviceCode: LAUNDRY_SERVICE_CODE,
          referenceId: run.id,
          idempotencyKey: input.idempotencyKey,
        });
        await this.recordEvent(
          client,
          load.rows[0].id,
          null,
          'LOAD_CREATED',
          actor.id,
        );
        await this.recordEvent(
          client,
          load.rows[0].id,
          run.id,
          'RUN_STARTED',
          actor.id,
          {
            machineCode: machineCode(input.machineType, input.machineNumber),
            priceMinor,
          },
        );
        return this.getLoad(client, load.rows[0].id);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.postgres.query<{ id: string }>(
          `SELECT id FROM laundry.load WHERE create_idempotency_key = $1`,
          [input.idempotencyKey],
        );
        if (existing.rows[0]) {
          const load = (
            await this.listLoads(`load.id = $1`, [existing.rows[0].id], 1)
          )[0];
          const run = load?.runs[0];
          if (
            load?.phoneE164 === input.phoneE164 &&
            run?.machineType === input.machineType &&
            run.machineNumber === input.machineNumber
          ) {
            return load;
          }
          throw new LaundryRuleError('IDEMPOTENCY_CONFLICT');
        }
      }
      this.rethrowDatabaseError(error);
    }
  }

  async transferLoad(input: {
    actorSubject: string;
    loadId: string;
    machineType: LaundryMachineType;
    machineNumber: number;
    idempotencyKey: string;
  }) {
    try {
      return await this.postgres.withTransaction(async (client) => {
        const actor = await this.findActor(client, input.actorSubject);
        const service = await this.findService(client);
        if (!service) throw new LaundryRuleError('SERVICE_NOT_FOUND');
        const load = await this.lockLoad(client, input.loadId);
        if (!load) throw new LaundryRuleError('LOAD_NOT_FOUND');

        const duplicate = await client.query<RunRow>(
          `SELECT *, price_minor::text
          FROM laundry.machine_run WHERE idempotency_key = $1`,
          [input.idempotencyKey],
        );
        if (duplicate.rows[0]) {
          const run = duplicate.rows[0];
          if (
            run.load_id !== input.loadId ||
            run.machine_type !== input.machineType ||
            run.machine_number !== input.machineNumber
          ) {
            throw new LaundryRuleError('IDEMPOTENCY_CONFLICT');
          }
          return this.getLoad(client, input.loadId);
        }
        if (load.status !== 'ACTIVE') {
          throw new LaundryRuleError('LOAD_STATE_CONFLICT');
        }

        const activeRun = await this.lockActiveRun(client, input.loadId);
        if (!activeRun) throw new LaundryRuleError('LOAD_STATE_CONFLICT');
        if (
          activeRun.machine_type === input.machineType &&
          activeRun.machine_number === input.machineNumber
        ) {
          throw new LaundryRuleError('SAME_MACHINE');
        }

        await this.removeRun(client, activeRun.id, actor.id);
        await this.recordEvent(
          client,
          input.loadId,
          activeRun.id,
          'RUN_REMOVED',
          actor.id,
        );
        const priceMinor =
          input.machineType === 'WASH'
            ? service.wash_price_minor
            : service.dry_price_minor;
        const run = await this.insertRun(client, {
          loadId: input.loadId,
          actorId: actor.id,
          machineType: input.machineType,
          machineNumber: input.machineNumber,
          priceMinor,
          idempotencyKey: input.idempotencyKey,
        });
        await this.wallet.chargeServiceInTransaction(client, {
          actorSubject: input.actorSubject,
          userProfileId: load.owner_user_profile_id,
          amountMinor: BigInt(priceMinor),
          serviceCode: LAUNDRY_SERVICE_CODE,
          referenceId: run.id,
          idempotencyKey: input.idempotencyKey,
        });
        await this.recordEvent(
          client,
          input.loadId,
          run.id,
          'RUN_STARTED',
          actor.id,
          {
            machineCode: machineCode(input.machineType, input.machineNumber),
            priceMinor,
          },
        );
        return this.getLoad(client, input.loadId);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const duplicate = await this.postgres.query<RunRow>(
          `SELECT *, price_minor::text
          FROM laundry.machine_run WHERE idempotency_key = $1`,
          [input.idempotencyKey],
        );
        const run = duplicate.rows[0];
        if (run) {
          if (
            run.load_id === input.loadId &&
            run.machine_type === input.machineType &&
            run.machine_number === input.machineNumber
          ) {
            return (await this.listLoads(`load.id = $1`, [input.loadId], 1))[0];
          }
          throw new LaundryRuleError('IDEMPOTENCY_CONFLICT');
        }
      }
      this.rethrowDatabaseError(error);
    }
  }

  async completeLoad(input: { actorSubject: string; loadId: string }) {
    return this.postgres.withTransaction(async (client) => {
      const actor = await this.findActor(client, input.actorSubject);
      const load = await this.lockLoad(client, input.loadId);
      if (!load) throw new LaundryRuleError('LOAD_NOT_FOUND');
      if (load.status === 'COMPLETED')
        return this.getLoad(client, input.loadId);
      if (load.status !== 'ACTIVE') {
        throw new LaundryRuleError('LOAD_STATE_CONFLICT');
      }
      const run = await this.lockActiveRun(client, input.loadId);
      if (!run) throw new LaundryRuleError('LOAD_STATE_CONFLICT');
      await this.removeRun(client, run.id, actor.id);
      await this.recordEvent(
        client,
        input.loadId,
        run.id,
        'RUN_REMOVED',
        actor.id,
      );
      await client.query(
        `UPDATE laundry.load
        SET status = 'COMPLETED', completed_at = now()
        WHERE id = $1`,
        [input.loadId],
      );
      await this.recordEvent(
        client,
        input.loadId,
        null,
        'LOAD_COMPLETED',
        actor.id,
      );
      return this.getLoad(client, input.loadId);
    });
  }

  async refundLoad(input: {
    actorSubject: string;
    loadId: string;
    reason: string;
    idempotencyKey: string;
  }) {
    return this.postgres.withTransaction(async (client) => {
      const actor = await this.findActor(client, input.actorSubject);
      const load = await this.lockLoad(client, input.loadId);
      if (!load) throw new LaundryRuleError('LOAD_NOT_FOUND');
      if (load.status === 'REFUNDED') {
        if (
          load.refund_idempotency_key !== input.idempotencyKey ||
          load.refund_reason !== input.reason
        ) {
          throw new LaundryRuleError('IDEMPOTENCY_CONFLICT');
        }
        return this.getLoad(client, input.loadId);
      }

      const total = await client.query<{ total: string }>(
        `SELECT COALESCE(sum(price_minor), 0)::text AS total
        FROM laundry.machine_run WHERE load_id = $1`,
        [input.loadId],
      );
      const activeRun = await this.lockActiveRun(client, input.loadId);
      if (activeRun) {
        await this.removeRun(client, activeRun.id, actor.id);
        await this.recordEvent(
          client,
          input.loadId,
          activeRun.id,
          'RUN_REMOVED',
          actor.id,
        );
      }

      await this.wallet.refundServiceInTransaction(client, {
        actorSubject: input.actorSubject,
        userProfileId: load.owner_user_profile_id,
        amountMinor: BigInt(total.rows[0].total),
        serviceCode: LAUNDRY_SERVICE_CODE,
        referenceId: input.loadId,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
      });
      await client.query(
        `UPDATE laundry.load
        SET status = 'REFUNDED', completed_at = NULL, refunded_at = now(),
            refund_reason = $2, refund_idempotency_key = $3
        WHERE id = $1`,
        [input.loadId, input.reason, input.idempotencyKey],
      );
      await this.recordEvent(
        client,
        input.loadId,
        null,
        'LOAD_REFUNDED',
        actor.id,
        {
          reason: input.reason,
          amountMinor: total.rows[0].total,
        },
      );
      return this.getLoad(client, input.loadId);
    });
  }

  async updateTariffs(input: {
    actorSubject: string;
    washPriceMinor: bigint;
    dryPriceMinor: bigint;
  }) {
    return this.postgres.withTransaction(async (client) => {
      const actor = await this.findActor(client, input.actorSubject);
      const service = await this.findService(client);
      if (!service) throw new LaundryRuleError('SERVICE_NOT_FOUND');
      const updated = await client.query<ServiceRow>(
        `UPDATE laundry.tariff
        SET wash_price_minor = $2, dry_price_minor = $3, updated_at = now(),
            updated_by_user_profile_id = $4
        WHERE service_unit_id = $1
        RETURNING service_unit_id AS id, wash_price_minor::text,
          dry_price_minor::text, updated_at`,
        [
          service.id,
          input.washPriceMinor.toString(),
          input.dryPriceMinor.toString(),
          actor.id,
        ],
      );
      return this.tariffView(updated.rows[0]);
    });
  }

  private async findActor(client: PoolClient, subject: string) {
    const result = await client.query<ActorRow>(
      `SELECT id FROM core.user_profile
      WHERE keycloak_subject = $1 AND status = 'ACTIVE'`,
      [subject],
    );
    if (!result.rows[0]) {
      throw new LaundryRuleError('ACTOR_PROFILE_NOT_FOUND');
    }
    return result.rows[0];
  }

  private async findService(client?: PoolClient) {
    const query = `SELECT service.id, tariff.wash_price_minor::text,
      tariff.dry_price_minor::text, tariff.updated_at
      FROM core.service_unit AS service
      JOIN laundry.tariff AS tariff ON tariff.service_unit_id = service.id
      WHERE service.code = $1 AND service.active`;
    const result = client
      ? await client.query<ServiceRow>(query, [LAUNDRY_SERVICE_CODE])
      : await this.postgres.query<ServiceRow>(query, [LAUNDRY_SERVICE_CODE]);
    return result.rows[0] ?? null;
  }

  private customerSelect() {
    return `SELECT profile.id AS user_profile_id, profile.phone_e164,
      profile.first_name, profile.last_name, profile.status,
      account.id AS account_id, account.available_minor::text
      FROM core.user_profile AS profile
      JOIN wallet.account AS account ON account.user_profile_id = profile.id`;
  }

  private async lockCustomerByPhone(client: PoolClient, phone: string) {
    const result = await client.query<CustomerRow>(
      `${this.customerSelect()}
      WHERE profile.phone_e164 = $1
      FOR UPDATE OF profile`,
      [phone],
    );
    return result.rows[0] ?? null;
  }

  private customerView(row: CustomerRow) {
    return {
      userProfileId: row.user_profile_id,
      phoneE164: row.phone_e164,
      firstName: row.first_name,
      lastName: row.last_name,
      status: row.status,
    };
  }

  private async lockLoad(client: PoolClient, loadId: string) {
    const result = await client.query<{
      id: string;
      owner_user_profile_id: string;
      status: LoadRow['status'];
      refund_idempotency_key: string | null;
      refund_reason: string | null;
    }>(
      `SELECT id, owner_user_profile_id, status, refund_idempotency_key,
        refund_reason
      FROM laundry.load WHERE id = $1 FOR UPDATE`,
      [loadId],
    );
    return result.rows[0] ?? null;
  }

  private async lockActiveRun(client: PoolClient, loadId: string) {
    const result = await client.query<RunRow>(
      `SELECT *, price_minor::text FROM laundry.machine_run
      WHERE load_id = $1 AND status = 'IN_MACHINE' FOR UPDATE`,
      [loadId],
    );
    return result.rows[0] ?? null;
  }

  private insertRun(
    client: PoolClient,
    input: {
      loadId: string;
      actorId: string;
      machineType: LaundryMachineType;
      machineNumber: number;
      priceMinor: string;
      idempotencyKey: string;
    },
  ) {
    return client
      .query<{ id: string }>(
        `INSERT INTO laundry.machine_run (
          load_id, machine_type, machine_number, price_minor,
          idempotency_key, started_by_user_profile_id
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id`,
        [
          input.loadId,
          input.machineType,
          input.machineNumber,
          input.priceMinor,
          input.idempotencyKey,
          input.actorId,
        ],
      )
      .then((result) => result.rows[0]);
  }

  private removeRun(client: PoolClient, runId: string, actorId: string) {
    return client.query(
      `UPDATE laundry.machine_run
      SET status = 'REMOVED', removed_at = now(),
          removed_by_user_profile_id = $2
      WHERE id = $1`,
      [runId, actorId],
    );
  }

  private recordEvent(
    client: PoolClient,
    loadId: string,
    runId: string | null,
    eventType: string,
    actorId: string,
    details: Record<string, unknown> = {},
  ) {
    return client.query(
      `INSERT INTO laundry.load_event (
        load_id, run_id, event_type, actor_user_profile_id, details
      ) VALUES ($1, $2, $3, $4, $5)`,
      [loadId, runId, eventType, actorId, details],
    );
  }

  private async getLoad(client: PoolClient, loadId: string) {
    const loads = await this.listLoads(`load.id = $1`, [loadId], 1, client);
    return loads[0] ?? null;
  }

  private async listLoads(
    where: string,
    values: readonly unknown[],
    limit: number,
    client?: PoolClient,
  ) {
    const query = `${this.loadSelect()}
      WHERE ${where}
      ORDER BY load.created_at DESC, load.id DESC
      LIMIT ${limit}`;
    const result = client
      ? await client.query<LoadRow>(query, [...values])
      : await this.postgres.query<LoadRow>(query, values);
    return result.rows.map((row) => ({
      id: row.id,
      ownerUserProfileId: row.owner_user_profile_id,
      phoneE164: row.phone_e164,
      customerName: `${row.first_name} ${row.last_name}`,
      status: row.status,
      location: row.runs.find((run) => run.status === 'IN_MACHINE') ?? {
        status: 'REMOVED' as const,
      },
      runs: row.runs,
      events: row.events,
      totalPriceMinor: row.runs
        .reduce((sum, run) => sum + BigInt(run.priceMinor), 0n)
        .toString(),
      createdAt: row.created_at,
      completedAt: row.completed_at,
      refundedAt: row.refunded_at,
      refundReason: row.refund_reason,
    }));
  }

  private loadSelect() {
    return `SELECT load.id, load.owner_user_profile_id, profile.phone_e164,
      profile.first_name, profile.last_name, load.status, load.created_at,
      load.completed_at, load.refunded_at, load.refund_reason,
      load.refund_idempotency_key,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', run.id, 'machineType', run.machine_type,
          'machineNumber', run.machine_number,
          'machineCode', CASE WHEN run.machine_type = 'WASH' THEN 'Y' ELSE 'K' END
            || lpad(run.machine_number::text, 2, '0'),
          'status', run.status, 'priceMinor', run.price_minor::text,
          'startedAt', run.started_at, 'removedAt', run.removed_at
        ) ORDER BY run.started_at, run.id)
        FROM laundry.machine_run AS run WHERE run.load_id = load.id
      ), '[]'::jsonb) AS runs,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', event.id, 'runId', event.run_id,
          'eventType', event.event_type, 'details', event.details,
          'createdAt', event.created_at
        ) ORDER BY event.created_at, event.id)
        FROM laundry.load_event AS event WHERE event.load_id = load.id
      ), '[]'::jsonb) AS events
      FROM laundry.load AS load
      JOIN core.user_profile AS profile ON profile.id = load.owner_user_profile_id`;
  }

  private async activeMachineMap() {
    const result = await this.postgres.query<{
      machine_type: LaundryMachineType;
      machine_number: number;
      load_id: string;
    }>(
      `SELECT machine_type, machine_number, load_id
      FROM laundry.machine_run WHERE status = 'IN_MACHINE'`,
    );
    return new Map(
      result.rows.map((row) => [
        `${row.machine_type}:${row.machine_number}`,
        row.load_id,
      ]),
    );
  }

  private configView(service: ServiceRow, occupied: Map<string, string>) {
    return {
      tariffs: this.tariffView(service),
      machines: LAUNDRY_MACHINES.map((machine) => ({
        ...machine,
        status: occupied.has(`${machine.type}:${machine.number}`)
          ? ('OCCUPIED' as const)
          : ('AVAILABLE' as const),
        loadId: occupied.get(`${machine.type}:${machine.number}`) ?? null,
      })),
    };
  }

  private tariffView(service: ServiceRow) {
    return {
      washPriceMinor: service.wash_price_minor,
      dryPriceMinor: service.dry_price_minor,
      washPriceTl: Number(service.wash_price_minor) / 100,
      dryPriceTl: Number(service.dry_price_minor) / 100,
      updatedAt: service.updated_at,
    };
  }

  private rethrowDatabaseError(error: unknown): never {
    if (error instanceof WalletRuleError) {
      if (error.code === 'INSUFFICIENT_AVAILABLE') {
        throw new LaundryRuleError('INSUFFICIENT_BALANCE');
      }
      if (error.code === 'IDEMPOTENCY_CONFLICT') {
        throw new LaundryRuleError('IDEMPOTENCY_CONFLICT');
      }
    }
    if (isUniqueViolation(error)) {
      throw new LaundryRuleError('MACHINE_OCCUPIED');
    }
    throw error;
  }
}
