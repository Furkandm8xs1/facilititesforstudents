import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { parseCreateProductInput, parseStockInput } from './canteen.input';

describe('canteen input', () => {
  it('normalizes the product name and converts whole TL', () => {
    expect(
      parseCreateProductInput({
        name: '  Kaşarlı   Tost ',
        priceTl: '35',
        stock: '20',
      }),
    ).toEqual({
      name: 'Kaşarlı Tost',
      nameKey: 'kaşarlı tost',
      priceMinor: 3_500n,
      stockOnHand: 20n,
    });
  });

  it('rejects fractional product prices', () => {
    expect(() =>
      parseCreateProductInput({
        name: 'Tost',
        priceTl: '35,50',
        stock: '20',
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts zero stock but rejects fractional stock', () => {
    expect(parseStockInput({ stock: '0' })).toBe(0n);
    expect(() => parseStockInput({ stock: '1,5' })).toThrow(
      BadRequestException,
    );
  });
});
