'use client';

import { useActionState, useEffect, useRef } from 'react';

import { placeOrderAction, type OrderActionState } from './actions';

const initialState: OrderActionState = { status: 'idle', message: '' };

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
      idempotencyRef.current.value = crypto.randomUUID();
    }
  }, []);

  useEffect(() => {
    if (state.status === 'success' && idempotencyRef.current) {
      idempotencyRef.current.value = crypto.randomUUID();
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
