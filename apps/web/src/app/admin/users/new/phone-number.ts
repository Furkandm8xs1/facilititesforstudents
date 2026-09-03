import {
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/max';

export const DEFAULT_COUNTRY: CountryCode = 'TR';

const MAX_RAW_DIGITS = 16;

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '').slice(0, MAX_RAW_DIGITS);
}

export function parseNationalNumber(
  nationalNumber: string,
  country: CountryCode,
) {
  if (!nationalNumber) {
    return undefined;
  }

  return parsePhoneNumberFromString(nationalNumber, {
    defaultCountry: country,
    extract: false,
  });
}

export function isPossibleNationalNumber(
  nationalNumber: string,
  country: CountryCode,
): boolean {
  const parsedNumber = parseNationalNumber(nationalNumber, country);
  return parsedNumber?.country === country && parsedNumber.isPossible();
}

export function parseInternationalNumber(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue.startsWith('+')) {
    return undefined;
  }

  const parsedNumber = parsePhoneNumberFromString(trimmedValue, {
    extract: false,
  });

  if (!parsedNumber?.country) {
    return undefined;
  }

  return {
    country: parsedNumber.country,
    nationalNumber: parsedNumber.nationalNumber,
  };
}
