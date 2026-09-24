export const LAUNDRY_SERVICE_CODE = 'laundry-main';
export const LAUNDRY_RUN_DURATION_SECONDS = 9_000;

export const LAUNDRY_MACHINES = Object.freeze([
  ...Array.from({ length: 7 }, (_, index) => ({
    type: 'WASH' as const,
    number: index + 1,
    code: `Y${String(index + 1).padStart(2, '0')}`,
  })),
  ...Array.from({ length: 8 }, (_, index) => ({
    type: 'DRY' as const,
    number: index + 1,
    code: `K${String(index + 1).padStart(2, '0')}`,
  })),
]);

export type LaundryMachineType = 'WASH' | 'DRY';

export function machineCode(type: LaundryMachineType, number: number) {
  return `${type === 'WASH' ? 'Y' : 'K'}${String(number).padStart(2, '0')}`;
}
