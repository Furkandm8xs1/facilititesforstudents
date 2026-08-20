'use client';

import { useActionState, useEffect, useRef } from 'react';

import { manageProductAction, type ProductActionState } from './actions';

const initialState: ProductActionState = { status: 'idle', message: '' };

export function CreateProductForm() {
  const [state, formAction, pending] = useActionState(
    manageProductAction,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
    }
  }, [state.status, state.message]);

  return (
    <form className="product-create-form" action={formAction} ref={formRef}>
      <input type="hidden" name="intent" value="create" />
      <label>
        <span>Ürün adı</span>
        <input
          name="name"
          maxLength={120}
          placeholder="Kaşarlı tost"
          required
        />
        <small>{state.errors?.name}</small>
      </label>
      <label>
        <span>Fiyat</span>
        <div className="amount-input">
          <input
            name="priceTl"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            placeholder="35"
            required
          />
          <strong>TL</strong>
        </div>
        <small>{state.errors?.priceTl ?? 'Yalnızca tam TL.'}</small>
      </label>
      <label>
        <span>İlk stok</span>
        <input
          name="stock"
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          placeholder="20"
          required
        />
        <small>{state.errors?.stock ?? 'Tam adet olarak girin.'}</small>
      </label>
      <div className="product-form-footer">
        <p
          className={`form-message form-message-${state.status}`}
          aria-live="polite"
        >
          {state.message}
        </p>
        <button className="primary-action" disabled={pending}>
          {pending ? 'Kaydediliyor…' : 'Ürünü kaydet'}
        </button>
      </div>
    </form>
  );
}
