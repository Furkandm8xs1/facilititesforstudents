export function formatTryMinor(value: string, signed = false): string {
  const amount = BigInt(value);
  const zero = BigInt(0);
  const oneHundred = BigInt(100);
  const negative = amount < zero;
  const absolute = negative ? -amount : amount;
  const whole = absolute / oneHundred;
  const fraction = absolute % oneHundred;
  const sign = negative ? '−' : signed && amount > zero ? '+' : '';
  const fractionText =
    fraction === zero ? '' : `,${fraction.toString().padStart(2, '0')}`;

  return `${sign}${whole.toLocaleString('tr-TR')}${fractionText} TL`;
}
