'use client';

import { useActionState } from 'react';

import type { CanteenOrder, CanteenOrderStatus } from '@/lib/api';
import { formatTryMinor } from '@/lib/money';

import { cancelOrderAction, type OrderActionState } from './actions';

const initialState: OrderActionState = { status: 'idle', message: '' };
const statusLabels: Record<CanteenOrderStatus, string> = {
  PLACED: 'Sipariş alındı',
  PREPARING: 'Hazırlanıyor',
  READY: 'Teslime hazır',
  DELIVERED: 'Teslim edildi',
  CANCELLED: 'İptal edildi',
  CANCELLED_BY_CANTEEN: 'Kantin iptal etti',
};

export function OrderHistory({ order }: { order: CanteenOrder }) {
  const [state, formAction, pending] = useActionState(
    cancelOrderAction,
    initialState,
  );

  return (
    <article className="customer-order-card">
      <header>
        <div>
          <span className={`order-status order-status-${order.status}`}>
            {statusLabels[order.status]}
          </span>
          <strong>{formatTryMinor(order.totalMinor)}</strong>
        </div>
        <time dateTime={order.createdAt}>
          {new Intl.DateTimeFormat('tr-TR', {
            dateStyle: 'short',
            timeStyle: 'short',
          }).format(new Date(order.createdAt))}
        </time>
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

      {order.status === 'PLACED' ? (
        <form action={formAction}>
          <input type="hidden" name="orderId" value={order.id} />
          <button className="danger-action" disabled={pending}>
            {pending ? 'İptal ediliyor…' : 'Siparişi iptal et'}
          </button>
        </form>
      ) : null}

      <p
        className={`form-message form-message-${state.status}`}
        aria-live="polite"
      >
        {state.message}
      </p>
    </article>
  );
}
