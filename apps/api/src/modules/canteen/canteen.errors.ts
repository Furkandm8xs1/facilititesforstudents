export type CanteenRuleErrorCode =
  | 'ACTOR_PROFILE_NOT_FOUND'
  | 'MAIN_CANTEEN_NOT_FOUND'
  | 'PRODUCT_NOT_FOUND'
  | 'PRODUCT_NAME_CONFLICT'
  | 'STOCK_BELOW_RESERVED'
  | 'PRODUCT_ARCHIVED'
  | 'PRODUCT_HAS_RESERVATIONS';

export class CanteenRuleError extends Error {
  constructor(readonly code: CanteenRuleErrorCode) {
    super(code);
    this.name = 'CanteenRuleError';
  }
}
