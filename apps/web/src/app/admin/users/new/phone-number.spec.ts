import { describe, expect, it } from 'vitest';

import {
  digitsOnly,
  isPossibleNationalNumber,
  parseInternationalNumber,
  parseNationalNumber,
} from './phone-number';

describe('phone number helpers', () => {
  it('adds the Turkish calling code to a national mobile number', () => {
    const phoneNumber = parseNationalNumber('5551112233', 'TR');

    expect(phoneNumber?.number).toBe('+905551112233');
    expect(isPossibleNationalNumber('5551112233', 'TR')).toBe(true);
  });

  it('removes the Turkish trunk prefix from the E.164 number', () => {
    expect(parseNationalNumber('05551112233', 'TR')?.number).toBe(
      '+905551112233',
    );
  });

  it('uses the selected country when parsing a national number', () => {
    expect(parseNationalNumber('15123456789', 'DE')?.number).toBe(
      '+4915123456789',
    );
  });

  it('detects the country when a complete international number is pasted', () => {
    expect(parseInternationalNumber('+49 151 23456789')).toEqual({
      country: 'DE',
      nationalNumber: '15123456789',
    });
  });

  it('rejects an incomplete number and strips non-digit input', () => {
    expect(isPossibleNationalNumber('555', 'TR')).toBe(false);
    expect(digitsOnly('(555) 111-22-33')).toBe('5551112233');
  });
});
