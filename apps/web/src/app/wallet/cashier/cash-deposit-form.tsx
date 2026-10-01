'use client';

import { useActionState, useEffect, useRef } from 'react';

import { createCashDepositAction, type WalletActionState } from './actions';

const initialState: WalletActionState = { status: 'idle', message: '' };

export function CashDepositForm({ phoneE164 }: { phoneE164: string }) {
  const [state, formAction, pending] = useActionState(
    createCashDepositAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const idempotencyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (idempotencyRef.current) {
      idempotencyRef.current.value = crypto.randomUUID();
    }
  }, []);

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      if (idempotencyRef.current) {
        idempotencyRef.current.value = crypto.randomUUID();
      }
    }
  }, [state.status, state.message]);

  return (
    <form className="cash-form" action={formAction} ref={formRef}>
      <input type="hidden" name="phoneE164" value={phoneE164} />
      <input ref={idempotencyRef} type="hidden" name="idempotencyKey" />
      <label>
        <span>Yüklenecek tutar</span>
        <div className="amount-input">
          <input
            name="amountTl"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            placeholder="100"
            required
          />
          <strong>TL</strong>
        </div>
        <small>
          {state.errors?.amountTl ?? 'Yalnızca tam TL girebilirsin.'}
        </small>
      </label>
      <div className="cash-form-footer">
        <p
          className={`form-message form-message-${state.status}`}
          aria-live="polite"
        >
          {state.message}
        </p>
        <button className="primary-action form-submit" disabled={pending}>
          {pending ? 'Yükleniyor…' : 'Nakit bakiye yükle'}
        </button>
      </div>
    </form>
  );
}
