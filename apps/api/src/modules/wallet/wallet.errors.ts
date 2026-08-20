export type WalletRuleErrorCode =
  | 'ACTOR_PROFILE_NOT_FOUND'
  | 'TARGET_NOT_FOUND'
  | 'TARGET_NOT_ACTIVE'
  | 'SELF_DEPOSIT'
  | 'ENTRY_NOT_FOUND'
  | 'NOT_CASH_DEPOSIT'
  | 'ALREADY_REVERSED'
  | 'INSUFFICIENT_AVAILABLE'
  | 'IDEMPOTENCY_CONFLICT';

export class WalletRuleError extends Error {
  constructor(readonly code: WalletRuleErrorCode) {
    super(code);
    this.name = 'WalletRuleError';
  }
}
