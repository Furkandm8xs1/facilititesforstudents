import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { WalletRuleError } from './wallet.errors';
import {
  parseCashDepositInput,
  parseCashDepositReversalInput,
  parsePhoneSearch,
  parseWalletAccountId,
} from './wallet.input';
import { WalletRepository } from './wallet.repository';

@Injectable()
export class WalletService {
  constructor(private readonly wallets: WalletRepository) {}

  async getMine(subject: string) {
    const account = await this.wallets.findAccountBySubject(subject);

    if (!account) {
      throw new NotFoundException('Kullanıcı cüzdanı bulunamadı.');
    }

    return {
      account,
      entries: await this.wallets.listEntries(account.accountId),
    };
  }

  searchAccounts(phoneValue: unknown) {
    return this.wallets.searchAccounts(parsePhoneSearch(phoneValue));
  }

  async getCashierAccount(accountIdValue: unknown) {
    const account = await this.wallets.findAccountById(
      parseWalletAccountId(accountIdValue),
    );

    if (!account) {
      throw new NotFoundException('Cüzdan hesabı bulunamadı.');
    }

    return {
      account,
      entries: await this.wallets.listEntries(account.accountId),
    };
  }

  async createCashDeposit(subject: string, rawInput: unknown) {
    const input = parseCashDepositInput(rawInput);

    try {
      return await this.wallets.createCashDeposit({
        actorSubject: subject,
        targetPhoneE164: input.phoneE164,
        amountMinor: input.amountMinor,
        idempotencyKey: input.idempotencyKey,
      });
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  async reverseCashDeposit(
    subject: string,
    entryId: unknown,
    rawInput: unknown,
  ) {
    const input = parseCashDepositReversalInput(entryId, rawInput);

    try {
      return await this.wallets.reverseCashDeposit({
        actorSubject: subject,
        entryId: input.entryId,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
      });
    } catch (error) {
      this.rethrowRuleError(error);
    }
  }

  private rethrowRuleError(error: unknown): never {
    if (!(error instanceof WalletRuleError)) {
      throw error;
    }

    switch (error.code) {
      case 'ACTOR_PROFILE_NOT_FOUND':
        throw new ForbiddenException(
          'Aktif bir kasiyer profiliyle işlem yapılmalıdır.',
        );
      case 'TARGET_NOT_FOUND':
        throw new NotFoundException('Bu telefon numarasıyla kullanıcı yok.');
      case 'TARGET_NOT_ACTIVE':
        throw new BadRequestException(
          'Yalnızca aktif kullanıcılara bakiye yüklenebilir.',
        );
      case 'SELF_DEPOSIT':
        throw new BadRequestException(
          'Kasiyer kendi cüzdanına bakiye yükleyemez.',
        );
      case 'ENTRY_NOT_FOUND':
        throw new NotFoundException('Ters çevrilecek işlem bulunamadı.');
      case 'NOT_CASH_DEPOSIT':
        throw new BadRequestException(
          'Yalnızca nakit bakiye yüklemeleri ters çevrilebilir.',
        );
      case 'ALREADY_REVERSED':
        throw new ConflictException('Bu yükleme daha önce ters çevrildi.');
      case 'INSUFFICIENT_AVAILABLE':
        throw new ConflictException(
          'Kullanılabilir bakiye tam ters kayıt için yeterli değil.',
        );
      case 'IDEMPOTENCY_CONFLICT':
        throw new ConflictException(
          'Bu işlem anahtarı daha önce farklı bir işlemde kullanıldı.',
        );
    }
  }
}
