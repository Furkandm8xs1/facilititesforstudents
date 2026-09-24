'use client';

import { useActionState } from 'react';

import { getLaundryPriceMinor, type LaundryTariffs } from '@/lib/api';

import { manageLaundryAction, type LaundryActionState } from '../actions';

const initialState: LaundryActionState = { status: 'idle', message: '' };

function minorToTl(value: string): string {
  const padded = value.padStart(3, '0');
  const whole = padded.slice(0, -2);
  const fraction = padded.slice(-2);
  return fraction === '00' ? whole : `${whole}.${fraction}`;
}

export function TariffForm({ tariffs }: { tariffs: LaundryTariffs }) {
  const [state, formAction, pending] = useActionState(
    manageLaundryAction,
    initialState,
  );

  return (
    <form className="laundry-tariff-form" action={formAction}>
      <input type="hidden" name="intent" value="tariffs" />
      <label>
        <span>Yıkama fiyatı</span>
        <div className="amount-input">
          <input
            name="washPriceTl"
            type="number"
            min="1"
            step="1"
            defaultValue={minorToTl(getLaundryPriceMinor(tariffs, 'WASH'))}
            required
          />
          <strong>TL</strong>
        </div>
      </label>
      <label>
        <span>Kurutma fiyatı</span>
        <div className="amount-input">
          <input
            name="dryPriceTl"
            type="number"
            min="1"
            step="1"
            defaultValue={minorToTl(getLaundryPriceMinor(tariffs, 'DRY'))}
            required
          />
          <strong>TL</strong>
        </div>
      </label>
      <div className="laundry-form-footer">
        <p
          className={`form-message form-message-${state.status}`}
          aria-live="polite"
        >
          {state.message}
        </p>
        <button className="primary-action" disabled={pending}>
          {pending ? 'Kaydediliyor…' : 'Fiyatları kaydet'}
        </button>
      </div>
    </form>
  );
}
