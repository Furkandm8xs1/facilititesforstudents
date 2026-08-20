'use client';

import { useActionState, useEffect, useRef } from 'react';

import { reverseCashDepositAction, type WalletActionState } from './actions';

const initialState: WalletActionState = { status: 'idle', message: '' };

export function ReverseDepositForm({ entryId }: { entryId: string }) {
  const [state, formAction, pending] = useActionState(
    reverseCashDepositAction,
    initialState,
  );
  const idempotencyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (idempotencyRef.current) {
      idempotencyRef.current.value = crypto.randomUUID();
    }
  }, []);

  useEffect(() => {
    if (state.status === 'success') {
      if (idempotencyRef.current) {
        idempotencyRef.current.value = crypto.randomUUID();
      }
    }
  }, [state.status, state.message]);

  return (
    <form className="reverse-form" action={formAction}>
      <input type="hidden" name="entryId" value={entryId} />
      <input ref={idempotencyRef} type="hidden" name="idempotencyKey" />
      <label>
        <span>Düzeltme gerekçesi</span>
        <input
          name="reason"
          minLength={3}
          maxLength={500}
          placeholder="Örneğin: Tutar yanlış girildi"
          required
        />
        <small>{state.errors?.reason}</small>
      </label>
      <p
        className={`form-message form-message-${state.status}`}
        aria-live="polite"
      >
        {state.message}
      </p>
      <button
        className="danger-action"
        disabled={pending || state.status === 'success'}
      >
        {pending ? 'Düzeltiliyor…' : 'Tam tutarı ters çevir'}
      </button>
    </form>
  );
}
