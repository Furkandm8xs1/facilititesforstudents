'use server';

import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { createCashDeposit, reverseCashDeposit } from '@/lib/api';

export interface WalletActionState {
  status: 'idle' | 'success' | 'error';
  message: string;
  errors?: Record<string, string>;
}

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

async function cashierSession() {
  const session = await auth();

  if (
    !session?.apiAccessToken ||
    !session.user.roles.includes('wallet_cashier')
  ) {
    return null;
  }

  return session;
}

function refreshWalletPages() {
  revalidatePath('/');
  revalidatePath('/wallet');
  revalidatePath('/wallet/cashier');
}

export async function createCashDepositAction(
  _previousState: WalletActionState,
  formData: FormData,
): Promise<WalletActionState> {
  const session = await cashierSession();

  if (!session) {
    return {
      status: 'error',
      message: 'Bu işlem için cüzdan kasiyeri yetkisi gerekli.',
    };
  }

  try {
    const result = await createCashDeposit(session.apiAccessToken!, {
      phoneE164: formText(formData, 'phoneE164'),
      amountTl: formText(formData, 'amountTl'),
      idempotencyKey: formText(formData, 'idempotencyKey'),
    });

    if (result.ok) {
      refreshWalletPages();
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

export async function reverseCashDepositAction(
  _previousState: WalletActionState,
  formData: FormData,
): Promise<WalletActionState> {
  const session = await cashierSession();

  if (!session) {
    return {
      status: 'error',
      message: 'Bu işlem için cüzdan kasiyeri yetkisi gerekli.',
    };
  }

  try {
    const result = await reverseCashDeposit(
      session.apiAccessToken!,
      formText(formData, 'entryId'),
      {
        reason: formText(formData, 'reason'),
        idempotencyKey: formText(formData, 'idempotencyKey'),
      },
    );

    if (result.ok) {
      refreshWalletPages();
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
