'use server';

import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { cancelCanteenOrder, placeCanteenOrder } from '@/lib/api';

export interface OrderActionState {
  status: 'idle' | 'success' | 'error';
  message: string;
  errors?: Record<string, string>;
}

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function refreshOrderPages() {
  revalidatePath('/');
  revalidatePath('/wallet');
  revalidatePath('/canteen');
  revalidatePath('/canteen/manage');
}

export async function placeOrderAction(
  _previousState: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const session = await auth();

  if (!session?.apiAccessToken) {
    return { status: 'error', message: 'Sipariş için tekrar giriş yapın.' };
  }

  try {
    const result = await placeCanteenOrder(session.apiAccessToken, {
      items: [
        {
          productId: formText(formData, 'productId'),
          quantity: formText(formData, 'quantity'),
        },
      ],
      idempotencyKey: formText(formData, 'idempotencyKey'),
    });

    if (result.ok) {
      refreshOrderPages();
    }

    return {
      status: result.ok ? 'success' : 'error',
      message: result.message,
      errors: result.errors,
    };
  } catch {
    return {
      status: 'error',
      message: 'API hizmetine ulaşılamadı. Lütfen tekrar deneyin.',
    };
  }
}

export async function cancelOrderAction(
  _previousState: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const session = await auth();

  if (!session?.apiAccessToken) {
    return { status: 'error', message: 'İptal için tekrar giriş yapın.' };
  }

  try {
    const result = await cancelCanteenOrder(
      session.apiAccessToken,
      formText(formData, 'orderId'),
    );

    if (result.ok) {
      refreshOrderPages();
    }

    return {
      status: result.ok ? 'success' : 'error',
      message: result.message,
      errors: result.errors,
    };
  } catch {
    return {
      status: 'error',
      message: 'API hizmetine ulaşılamadı. Lütfen tekrar deneyin.',
    };
  }
}
