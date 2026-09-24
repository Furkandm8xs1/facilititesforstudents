export type LaundryRuleErrorCode =
  | 'SERVICE_NOT_FOUND'
  | 'ACTOR_PROFILE_NOT_FOUND'
  | 'CUSTOMER_NOT_FOUND'
  | 'CUSTOMER_NOT_ACTIVE'
  | 'LOAD_NOT_FOUND'
  | 'LOAD_STATE_CONFLICT'
  | 'RUN_NOT_READY'
  | 'MACHINE_OCCUPIED'
  | 'SAME_MACHINE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INSUFFICIENT_BALANCE';

export class LaundryRuleError extends Error {
  constructor(readonly code: LaundryRuleErrorCode) {
    super(code);
    this.name = 'LaundryRuleError';
  }
}
