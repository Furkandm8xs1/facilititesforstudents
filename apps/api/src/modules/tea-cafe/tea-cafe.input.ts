import { BadRequestException } from '@nestjs/common';

export type BeverageType = 'TEA' | 'COFFEE';

export interface CreateBrewInput {
  beverageType: BeverageType;
  durationMinutes: number;
  note: string | null;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizedText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function parseCreateBrewInput(value: unknown): CreateBrewInput {
  if (!isRecord(value)) {
    throw new BadRequestException('Demleme bilgileri gönderilmelidir.');
  }

  const beverageType = normalizedText(value.beverageType).toUpperCase();
  const note = normalizedText(value.note);
  const errors: Record<string, string> = {};

  if (beverageType !== 'TEA' && beverageType !== 'COFFEE') {
    errors.beverageType = 'İçecek olarak çay veya kahve seçilmelidir.';
  }

  if (note.length > 80) {
    errors.note = 'Not en fazla 80 karakter olabilir.';
  }

  let durationMinutes = 21;

  if (beverageType === 'COFFEE') {
    const rawDuration = normalizedText(value.durationMinutes);
    const parsedDuration = Number(rawDuration);

    if (
      !/^\d+$/.test(rawDuration) ||
      !Number.isSafeInteger(parsedDuration) ||
      parsedDuration < 1 ||
      parsedDuration > 180
    ) {
      errors.durationMinutes =
        'Kahve süresi 1-180 arasında tam dakika olmalıdır.';
    } else {
      durationMinutes = parsedDuration;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw new BadRequestException({
      message: 'Demleme bilgileri geçerli değil.',
      errors,
    });
  }

  return {
    beverageType: beverageType as BeverageType,
    durationMinutes,
    note: note || null,
  };
}

export function parseBrewId(value: unknown): string {
  const brewId = normalizedText(value);

  if (!uuidPattern.test(brewId)) {
    throw new BadRequestException('Demleme kaydı geçerli değil.');
  }

  return brewId;
}
