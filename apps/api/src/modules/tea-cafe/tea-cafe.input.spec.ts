import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { parseBrewId, parseCreateBrewInput } from './tea-cafe.input';

describe('tea & cafe input', () => {
  it('always assigns 21 minutes to tea', () => {
    expect(
      parseCreateBrewInput({
        beverageType: 'TEA',
        durationMinutes: '90',
        note: '  Üst kat   demliği ',
      }),
    ).toEqual({
      beverageType: 'TEA',
      durationMinutes: 21,
      note: 'Üst kat demliği',
    });
  });

  it('accepts the attendant duration for coffee', () => {
    expect(
      parseCreateBrewInput({
        beverageType: 'coffee',
        durationMinutes: '12',
        note: '',
      }),
    ).toEqual({
      beverageType: 'COFFEE',
      durationMinutes: 12,
      note: null,
    });
  });

  it('rejects fractional and out-of-range coffee durations', () => {
    expect(() =>
      parseCreateBrewInput({
        beverageType: 'COFFEE',
        durationMinutes: '2.5',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseCreateBrewInput({
        beverageType: 'COFFEE',
        durationMinutes: '181',
      }),
    ).toThrow(BadRequestException);
  });

  it('validates brew identifiers', () => {
    expect(parseBrewId('0d5af6b8-1e22-4a50-ad85-53db06315217')).toBe(
      '0d5af6b8-1e22-4a50-ad85-53db06315217',
    );
    expect(() => parseBrewId('not-an-id')).toThrow(BadRequestException);
  });
});
