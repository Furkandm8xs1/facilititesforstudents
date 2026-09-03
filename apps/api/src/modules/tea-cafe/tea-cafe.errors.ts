export type TeaCafeRuleErrorCode =
  'ACTOR_PROFILE_NOT_FOUND' | 'SERVICE_UNIT_NOT_FOUND' | 'BREW_NOT_FOUND';

export class TeaCafeRuleError extends Error {
  constructor(public readonly code: TeaCafeRuleErrorCode) {
    super(code);
    this.name = 'TeaCafeRuleError';
  }
}
