'use server';

import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import {
  completeLaundryLoad,
  createLaundryLoad,
  refundLaundryLoad,
  searchLaundryCustomers,
  transferLaundryLoad,
  updateLaundryTariffs,
  type LaundryMachineType,
  type LaundryMutationResult,
  type LaundryOwner,
} from '@/lib/api';

export interface LaundryActionState {
  status: 'idle' | 'success' | 'error';
  message: string;
  errors?: Record<string, string>;
  requestId?: string;
}

export interface LaundryCustomerSearchState {
  status: 'idle' | 'success' | 'error';
  message: string;
  customers: LaundryOwner[];
}

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function revalidateLaundryPages() {
  revalidatePath('/');
  revalidatePath('/wallet');
  revalidatePath('/laundry');
  revalidatePath('/laundry/manage');
}

export async function manageLaundryAction(
  _previousState: LaundryActionState,
  formData: FormData,
): Promise<LaundryActionState> {
  const session = await auth();
  const isManager = session?.user.roles.includes('laundry_manager');
  const isOperator = session?.user.roles.includes('laundry_operator');

  if (!session?.apiAccessToken || (!isManager && !isOperator)) {
    return {
      status: 'error',
      message: 'Bu Laundry işlemi için gerekli yetkin bulunmuyor.',
    };
  }

  const intent = formText(formData, 'intent');
  if (intent === 'tariffs' && !isManager) {
    return {
      status: 'error',
      message: 'Fiyatları yalnızca Laundry yöneticisi değiştirebilir.',
    };
  }

  try {
    let result: LaundryMutationResult;
    let requestId: string | undefined;

    if (intent === 'create' || intent === 'transfer') {
      const machineType = formText(formData, 'machineType');
      const machineNumber = Number(formText(formData, 'machineNumber'));
      const idempotencyKey = formText(formData, 'idempotencyKey');
      requestId = idempotencyKey;

      if (
        (machineType !== 'WASH' && machineType !== 'DRY') ||
        !Number.isInteger(machineNumber) ||
        machineNumber < 1 ||
        !idempotencyKey
      ) {
        return {
          status: 'error',
          message:
            'Geçerli ve boş bir makine seçmelisin. Sayfayı yenileyip tekrar deneyebilirsin.',
        };
      }

      const machine = {
        machineType: machineType as LaundryMachineType,
        machineNumber,
        idempotencyKey,
      };

      result =
        intent === 'create'
          ? await createLaundryLoad(session.apiAccessToken, {
              phoneE164: formText(formData, 'phoneE164'),
              ...machine,
            })
          : await transferLaundryLoad(
              session.apiAccessToken,
              formText(formData, 'loadId'),
              machine,
            );
    } else if (intent === 'complete') {
      result = await completeLaundryLoad(
        session.apiAccessToken,
        formText(formData, 'loadId'),
      );
    } else if (intent === 'refund') {
      const reason = formText(formData, 'reason');
      const idempotencyKey = formText(formData, 'idempotencyKey');
      requestId = idempotencyKey;
      if (reason.length < 3 || !idempotencyKey) {
        return {
          status: 'error',
          message:
            'İade için gerekçe ve geçerli işlem anahtarı gereklidir. Sayfayı yenileyip tekrar deneyebilirsin.',
          errors: { reason: 'İade gerekçesi zorunludur.' },
        };
      }
      result = await refundLaundryLoad(
        session.apiAccessToken,
        formText(formData, 'loadId'),
        { reason, idempotencyKey },
      );
    } else if (intent === 'tariffs') {
      const washPriceTl = Number(formText(formData, 'washPriceTl'));
      const dryPriceTl = Number(formText(formData, 'dryPriceTl'));
      if (
        !Number.isSafeInteger(washPriceTl) ||
        washPriceTl < 1 ||
        !Number.isSafeInteger(dryPriceTl) ||
        dryPriceTl < 1
      ) {
        return {
          status: 'error',
          message: 'Fiyatlar en az 1 TL olan tam sayılar olmalıdır.',
        };
      }
      result = await updateLaundryTariffs(session.apiAccessToken, {
        washPriceTl,
        dryPriceTl,
      });
    } else {
      return { status: 'error', message: 'Laundry işlemi geçerli değil.' };
    }

    if (result.ok) {
      revalidateLaundryPages();
    }

    return {
      status: result.ok ? 'success' : 'error',
      message: result.message,
      errors: result.errors,
      requestId: result.ok ? requestId : undefined,
    };
  } catch {
    return {
      status: 'error',
      message: 'API hizmetine ulaşılamadı. Lütfen tekrar deneyin.',
    };
  }
}

export async function searchLaundryCustomersAction(
  _previousState: LaundryCustomerSearchState,
  formData: FormData,
): Promise<LaundryCustomerSearchState> {
  const session = await auth();
  const canOperate = session?.user.roles.some(
    (role) => role === 'laundry_operator' || role === 'laundry_manager',
  );

  if (!session?.apiAccessToken || !canOperate) {
    return {
      status: 'error',
      message: 'Öğrenci aramak için Laundry yetkisi gereklidir.',
      customers: [],
    };
  }

  const phone = formText(formData, 'phone').replaceAll(' ', '');
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) {
    return {
      status: 'error',
      message: 'Telefon numarasını +905551112233 biçiminde gir.',
      customers: [],
    };
  }

  try {
    const customers = await searchLaundryCustomers(
      session.apiAccessToken,
      phone,
    );
    return {
      status: 'success',
      message: customers.length
        ? `${customers.length} öğrenci bulundu.`
        : 'Bu telefonla aktif bir öğrenci bulunamadı.',
      customers,
    };
  } catch {
    return {
      status: 'error',
      message: 'Öğrenci araması şu anda yapılamıyor.',
      customers: [],
    };
  }
}
