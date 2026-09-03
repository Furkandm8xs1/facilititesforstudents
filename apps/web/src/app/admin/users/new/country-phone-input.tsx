'use client';

import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/max';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

const DEFAULT_COUNTRY: CountryCode = 'TR';
const MAX_RAW_DIGITS = 16;

const regionNames =
  typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['tr'], { type: 'region' })
    : null;

const countries = [
  DEFAULT_COUNTRY,
  ...getCountries().filter((country) => country !== DEFAULT_COUNTRY),
];

function countryFlag(country: CountryCode): string {
  return String.fromCodePoint(
    ...country.split('').map((letter) => 127397 + letter.charCodeAt(0)),
  );
}

function countryName(country: CountryCode): string {
  return regionNames?.of(country) ?? country;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '').slice(0, MAX_RAW_DIGITS);
}

function parseNationalNumber(nationalNumber: string, country: CountryCode) {
  if (!nationalNumber) {
    return undefined;
  }

  return parsePhoneNumberFromString(nationalNumber, {
    defaultCountry: country,
    extract: false,
  });
}

interface CountryPhoneInputProps {
  error?: string;
}

export function CountryPhoneInput({ error }: CountryPhoneInputProps) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [nationalNumber, setNationalNumber] = useState('');

  const callingCode = getCountryCallingCode(country);
  const parsedNumber = useMemo(
    () => parseNationalNumber(nationalNumber, country),
    [country, nationalNumber],
  );
  const e164Number = parsedNumber?.number ?? '';
  const formattedNationalNumber = useMemo(
    () =>
      nationalNumber
        ? new AsYouType(country).input(nationalNumber)
        : nationalNumber,
    [country, nationalNumber],
  );

  useEffect(() => {
    const form = inputRef.current?.form;

    function resetPhoneInput() {
      setCountry(DEFAULT_COUNTRY);
      setNationalNumber('');
      inputRef.current?.setCustomValidity('');
    }

    form?.addEventListener('reset', resetPhoneInput);
    return () => form?.removeEventListener('reset', resetPhoneInput);
  }, []);

  function setValidity(value: string, selectedCountry: CountryCode) {
    const parsed = parseNationalNumber(value, selectedCountry);
    const isPossibleForCountry =
      parsed?.country === selectedCountry && parsed.isPossible();

    inputRef.current?.setCustomValidity(
      value && !isPossibleForCountry
        ? 'Geçerli bir telefon numarası girin.'
        : '',
    );
  }

  function handleCountryChange(value: string) {
    const nextCountry = value as CountryCode;
    setCountry(nextCountry);
    setNationalNumber('');
    inputRef.current?.setCustomValidity('');
    inputRef.current?.focus();
  }

  function handlePhoneChange(value: string) {
    const trimmedValue = value.trim();

    if (trimmedValue.startsWith('+')) {
      const internationalNumber = parsePhoneNumberFromString(trimmedValue, {
        extract: false,
      });

      if (internationalNumber?.country) {
        const nextCountry = internationalNumber.country;
        const nextNationalNumber = internationalNumber.nationalNumber;
        setCountry(nextCountry);
        setNationalNumber(nextNationalNumber);
        setValidity(nextNationalNumber, nextCountry);
        return;
      }
    }

    const nextNationalNumber = digitsOnly(value);
    setNationalNumber(nextNationalNumber);
    setValidity(nextNationalNumber, country);
  }

  const helperText =
    country === DEFAULT_COUNTRY
      ? 'Türkiye (+90) seçili. 555 ile başlayan kısmı yazın.'
      : `${countryName(country)} (+${callingCode}) seçili. Ülke kodunu yazmadan girin.`;

  return (
    <div className="phone-field">
      <label htmlFor={inputId}>Telefon numarası</label>
      <div className="phone-input-group">
        <select
          className="phone-country-select"
          aria-label="Telefon ülkesini seçin"
          value={country}
          onChange={(event) => handleCountryChange(event.target.value)}
        >
          {countries.map((countryOption) => (
            <option key={countryOption} value={countryOption}>
              {countryFlag(countryOption)} {countryName(countryOption)} (+
              {getCountryCallingCode(countryOption)})
            </option>
          ))}
        </select>

        <div className="phone-number-input">
          <span aria-hidden="true">+{callingCode}</span>
          <input
            id={inputId}
            ref={inputRef}
            name="phoneNational"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder={country === DEFAULT_COUNTRY ? '555 111 22 33' : 'Telefon numarası'}
            aria-describedby={hintId}
            aria-invalid={error ? 'true' : undefined}
            value={formattedNationalNumber}
            onChange={(event) => handlePhoneChange(event.target.value)}
            required
          />
        </div>
      </div>

      <input type="hidden" name="phoneE164" value={e164Number} readOnly />
      <small id={hintId}>{error ?? helperText}</small>
    </div>
  );
}
