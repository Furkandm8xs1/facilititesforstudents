'use client';

import { useActionState, useEffect, useRef } from 'react';

import { placeOrderAction, type OrderActionState } from './actions';

const initialState: OrderActionState = { status: 'idle', message: '' };

function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function OrderProductForm({
  productId,
  availableStock,
  orderingEnabled,
}: {
  productId: string;
  availableStock: string;
  orderingEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    placeOrderAction,
    initialState,
  );
  const idempotencyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (idempotencyRef.current && !idempotencyRef.current.value) {
      idempotencyRef.current.value = createIdempotencyKey();
    }
  }, []);

  useEffect(() => {
    if (state.status === 'success' && idempotencyRef.current) {
      idempotencyRef.current.value = createIdempotencyKey();
    }
  }, [state.status, state.message]);

  return (
    <form className="catalog-order-form" action={formAction}>
      <input type="hidden" name="productId" value={productId} />
      <input ref={idempotencyRef} type="hidden" name="idempotencyKey" />
      <label>
        <span>Adet</span>
        <input
          name="quantity"
          type="number"
          inputMode="numeric"
          min="1"
          max={availableStock}
          step="1"
          defaultValue="1"
          disabled={!orderingEnabled || pending}
          required
        />
      </label>
      <button className="primary-action" disabled={!orderingEnabled || pending}>
        {pending
          ? 'Sipariş veriliyor…'
          : orderingEnabled
            ? 'Sipariş ver'
            : 'Kantin kapalı'}
      </button>
      <p
        className={`form-message form-message-${state.status}`}
        aria-live="polite"
      >
        {state.message}
      </p>
    </form>
  );
}
