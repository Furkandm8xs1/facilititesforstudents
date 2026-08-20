'use client';

import { useActionState } from 'react';

import type { CanteenOrder, CanteenOrderStatus } from '@/lib/api';
import { formatTryMinor } from '@/lib/money';

import { manageProductAction, type ProductActionState } from './actions';

const initialState: ProductActionState = { status: 'idle', message: '' };
const statusLabels: Record<CanteenOrderStatus, string> = {
  PLACED: 'Yeni sipariş',
  PREPARING: 'Hazırlanıyor',
  READY: 'Teslime hazır',
  DELIVERED: 'Teslim edildi',
  CANCELLED: 'Kullanıcı iptal etti',
  CANCELLED_BY_CANTEEN: 'Kantin iptal etti',
};

export function OrderQueue({ order }: { order: CanteenOrder }) {
  const [state, formAction, pending] = useActionState(
    manageProductAction,
    initialState,
  );

  return (
    <form className="management-order-card" action={formAction}>
      <input type="hidden" name="intent" value="order-status" />
      <input type="hidden" name="orderId" value={order.id} />
      <header>
        <div>
          <span className={`order-status order-status-${order.status}`}>
            {statusLabels[order.status]}
          </span>
          <strong>{order.customerName}</strong>
          <small>{order.customerPhone}</small>
        </div>
        <div>
          <strong>{formatTryMinor(order.totalMinor)}</strong>
          <time dateTime={order.createdAt}>
            {new Intl.DateTimeFormat('tr-TR', {
              dateStyle: 'short',
              timeStyle: 'short',
            }).format(new Date(order.createdAt))}
          </time>
        </div>
      </header>

      <ul>
        {order.items.map((item) => (
          <li key={item.productId}>
            <span>
              {item.productName} × {item.quantity}
            </span>
            <strong>{formatTryMinor(item.lineTotalMinor)}</strong>
          </li>
        ))}
      </ul>

      <div className="product-actions">
        {order.status === 'PLACED' ? (
          <>
            <button
              className="primary-action"
              name="targetStatus"
              value="PREPARING"
              disabled={pending}
            >
              Hazırlamaya başla
            </button>
            <button
              className="danger-action"
              name="targetStatus"
              value="CANCELLED_BY_CANTEEN"
              disabled={pending}
            >
              İptal ve iade
            </button>
          </>
        ) : null}
        {order.status === 'PREPARING' ? (
          <>
            <button
              className="primary-action"
              name="targetStatus"
              value="READY"
              disabled={pending}
            >
              Hazır olarak işaretle
            </button>
            <button
              className="danger-action"
              name="targetStatus"
              value="CANCELLED_BY_CANTEEN"
              disabled={pending}
            >
              İptal ve iade
            </button>
          </>
        ) : null}
        {order.status === 'READY' ? (
          <button
            className="primary-action"
            name="targetStatus"
            value="DELIVERED"
            disabled={pending}
          >
            Teslim edildi olarak işaretle
          </button>
        ) : null}
      </div>

      <p
        className={`form-message form-message-${state.status}`}
        aria-live="polite"
      >
        {state.message}
      </p>
    </form>
  );
}
