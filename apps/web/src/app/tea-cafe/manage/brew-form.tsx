'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { createBrewAction, type TeaCafeActionState } from '../actions';

const initialState: TeaCafeActionState = { status: 'idle', message: '' };

export function BrewForm() {
  const [state, formAction, pending] = useActionState(
    createBrewAction,
    initialState,
  );
  const [beverageType, setBeverageType] = useState<'TEA' | 'COFFEE'>('TEA');
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
    }
  }, [state.status, state.message]);

  return (
    <form className="brew-create-form" action={formAction} ref={formRef}>
      <label>
        <span>İçecek</span>
        <select
          name="beverageType"
          value={beverageType}
          onChange={(event) =>
            setBeverageType(event.target.value as 'TEA' | 'COFFEE')
          }
        >
          <option value="TEA">Çay</option>
          <option value="COFFEE">Kahve</option>
        </select>
        <small>{state.errors?.beverageType}</small>
      </label>

      <label>
        <span>Demleme süresi</span>
        {beverageType === 'TEA' ? (
          <div className="fixed-duration">
            <strong>21 dakika</strong>
            <small>Çay için otomatik uygulanır.</small>
          </div>
        ) : (
          <div className="duration-input">
            <input
              name="durationMinutes"
              type="number"
              inputMode="numeric"
              min="1"
              max="180"
              step="1"
              defaultValue="10"
              required
            />
            <strong>dakika</strong>
          </div>
        )}
        <small>{state.errors?.durationMinutes}</small>
      </label>

      <label>
        <span>Not veya konum (isteğe bağlı)</span>
        <input name="note" maxLength={80} placeholder="Örn. üst kat demliği" />
        <small>
          {state.errors?.note ?? 'Aynı anda demleyenleri ayırt etmek için.'}
        </small>
      </label>

      <div className="brew-form-footer">
        <p
          className={`form-message form-message-${state.status}`}
          aria-live="polite"
        >
          {state.message}
        </p>
        <button className="primary-action" disabled={pending}>
          {pending
            ? 'Kaydediliyor…'
            : `${beverageType === 'TEA' ? 'Çayı' : 'Kahveyi'} demledim`}
        </button>
      </div>
    </form>
  );
}
