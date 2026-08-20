export type CanteenRuleErrorCode =
  | 'ACTOR_PROFILE_NOT_FOUND'
  | 'MAIN_CANTEEN_NOT_FOUND'
  | 'PRODUCT_NOT_FOUND'
  | 'PRODUCT_NAME_CONFLICT'
  | 'STOCK_BELOW_RESERVED'
  | 'PRODUCT_ARCHIVED'
  | 'PRODUCT_HAS_RESERVATIONS'
  | 'CUSTOMER_PROFILE_NOT_FOUND'
  | 'CANTEEN_CLOSED'
  | 'PRODUCT_UNAVAILABLE'
  | 'INSUFFICIENT_STOCK'
  | 'WALLET_NOT_FOUND'
  | 'INSUFFICIENT_BALANCE'
  | 'ORDER_TOTAL_TOO_LARGE'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_STATE_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT';

export class CanteenRuleError extends Error {
  constructor(readonly code: CanteenRuleErrorCode) {
    super(code);
    this.name = 'CanteenRuleError';
  }
}
