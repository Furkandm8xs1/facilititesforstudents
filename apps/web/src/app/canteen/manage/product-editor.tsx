'use client';

import { useActionState } from 'react';

import type { CanteenProduct } from '@/lib/api';
import { formatTryMinor } from '@/lib/money';

import { manageProductAction, type ProductActionState } from './actions';

const initialState: ProductActionState = { status: 'idle', message: '' };

export function ProductEditor({
  product,
  canManageDetails,
}: {
  product: CanteenProduct;
  canManageDetails: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    manageProductAction,
    initialState,
  );

  return (
    <form className="product-editor" action={formAction}>
      <input type="hidden" name="productId" value={product.id} />
      <header>
        <div>
          <span
            className={`product-state ${product.archived ? 'product-state-archived' : product.customerVisible ? 'product-state-live' : ''}`}
          >
            {product.archived
              ? 'Arşivde'
              : product.customerVisible
                ? 'Satışta'
                : product.listed
                  ? 'Stok bekliyor'
                  : 'Satışa kapalı'}
          </span>
          <strong>{product.name}</strong>
        </div>
        <span>{formatTryMinor(product.priceMinor)}</span>
      </header>

      <div className="product-editor-grid">
        <label>
          <span>Ürün adı</span>
          <input
            name="name"
            defaultValue={product.name}
            maxLength={120}
            disabled={!canManageDetails}
            required={canManageDetails}
          />
          <small>{state.errors?.name}</small>
        </label>
        <label>
          <span>Fiyat (tam TL)</span>
          <input
            name="priceTl"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            defaultValue={(BigInt(product.priceMinor) / BigInt(100)).toString()}
            disabled={!canManageDetails}
            required={canManageDetails}
          />
          <small>{state.errors?.priceTl}</small>
        </label>
        <label>
          <span>Toplam stok</span>
          <input
            name="stock"
            type="number"
            inputMode="numeric"
            min={product.stockReserved}
            step="1"
            defaultValue={product.stockOnHand}
            required
          />
          <small>
            {state.errors?.stock ??
              `Kullanılabilir: ${product.availableStock} · Rezerve: ${product.stockReserved}`}
          </small>
        </label>
      </div>

      <p
        className={`form-message form-message-${state.status}`}
        aria-live="polite"
      >
        {state.message}
      </p>

      <div className="product-actions">
        {product.archived ? (
          canManageDetails ? (
            <button
              className="secondary-action"
              name="intent"
              value="reactivate"
              disabled={pending}
            >
              Yeniden etkinleştir
            </button>
          ) : null
        ) : (
          <>
            {canManageDetails ? (
              <button
                className="secondary-action"
                name="intent"
                value="details"
                disabled={pending}
              >
                Ad ve fiyatı kaydet
              </button>
            ) : null}
            <button
              className="secondary-action"
              name="intent"
              value="stock"
              disabled={pending}
            >
              Stoğu kaydet
            </button>
            <button
              className="secondary-action"
              name="intent"
              value={product.listed ? 'unlist' : 'list'}
              disabled={pending}
            >
              {product.listed ? 'Satışa kapat' : 'Satışa aç'}
            </button>
            <button
              className="danger-action"
              name="intent"
              value="archive"
              disabled={pending}
            >
              Arşivle
            </button>
          </>
        )}
      </div>
    </form>
  );
}
