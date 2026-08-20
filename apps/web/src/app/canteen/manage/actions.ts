'use server';

import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import {
  archiveCanteenProduct,
  createOrUpdateCanteenProduct,
  transitionCanteenOrder,
  updateCanteenOrdering,
  updateCanteenProductDetails,
  updateCanteenProductStock,
  updateCanteenProductVisibility,
  type CanteenMutationResult,
  type CanteenOrderStatus,
} from '@/lib/api';

export interface ProductActionState {
  status: 'idle' | 'success' | 'error';
  message: string;
  errors?: Record<string, string>;
}

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function refreshCanteenPages() {
  revalidatePath('/');
  revalidatePath('/canteen');
  revalidatePath('/canteen/manage');
}

export async function manageProductAction(
  _previousState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const session = await auth();
  const intent = formText(formData, 'intent');
  const managerOnly = ['create', 'details', 'reactivate'].includes(intent);
  const hasManagerRole = session?.user.roles.includes('canteen_manager');
  const hasOperatorRole = session?.user.roles.includes('canteen_operator');

  if (
    !session?.apiAccessToken ||
    (managerOnly ? !hasManagerRole : !hasManagerRole && !hasOperatorRole)
  ) {
    return {
      status: 'error',
      message: 'Bu kantin işlemi için gerekli yetkin bulunmuyor.',
    };
  }

  const productId = formText(formData, 'productId');
  let result: CanteenMutationResult;

  try {
    switch (intent) {
      case 'create':
      case 'reactivate':
        result = await createOrUpdateCanteenProduct(session.apiAccessToken, {
          name: formText(formData, 'name'),
          priceTl: formText(formData, 'priceTl'),
          stock: formText(formData, 'stock'),
        });
        break;
      case 'details':
        result = await updateCanteenProductDetails(
          session.apiAccessToken,
          productId,
          {
            name: formText(formData, 'name'),
            priceTl: formText(formData, 'priceTl'),
          },
        );
        break;
      case 'stock':
        result = await updateCanteenProductStock(
          session.apiAccessToken,
          productId,
          formText(formData, 'stock'),
        );
        break;
      case 'list':
      case 'unlist':
        result = await updateCanteenProductVisibility(
          session.apiAccessToken,
          productId,
          intent === 'list',
        );
        break;
      case 'archive':
        result = await archiveCanteenProduct(session.apiAccessToken, productId);
        break;
      case 'ordering-open':
      case 'ordering-close':
        result = await updateCanteenOrdering(
          session.apiAccessToken,
          intent === 'ordering-open',
        );
        break;
      case 'order-status':
        result = await transitionCanteenOrder(
          session.apiAccessToken,
          formText(formData, 'orderId'),
          {
            status: formText(formData, 'targetStatus') as CanteenOrderStatus,
          },
        );
        break;
      default:
        return { status: 'error', message: 'Ürün işlemi geçerli değil.' };
    }

    if (result.ok) {
      refreshCanteenPages();
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
