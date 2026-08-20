'use client';

import { useActionState } from 'react';

import { manageProductAction, type ProductActionState } from './actions';

const initialState: ProductActionState = { status: 'idle', message: '' };

export function OrderingControl({ enabled }: { enabled: boolean }) {
  const [state, formAction, pending] = useActionState(
    manageProductAction,
    initialState,
  );

  return (
    <form className="ordering-control" action={formAction}>
      <div>
        <span>Sipariş durumu</span>
        <strong>{enabled ? 'Ana Kantin açık' : 'Ana Kantin kapalı'}</strong>
        <small>
          Kapatıldığında ürünler görünür kalır fakat yeni sipariş alınmaz.
        </small>
      </div>
      <button
        className={enabled ? 'danger-action' : 'primary-action'}
        name="intent"
        value={enabled ? 'ordering-close' : 'ordering-open'}
        disabled={pending}
      >
        {pending
          ? 'Güncelleniyor…'
          : enabled
            ? 'Siparişi kapat'
            : 'Siparişe aç'}
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
