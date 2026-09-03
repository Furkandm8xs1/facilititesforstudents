'use server';

import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { createTeaCafeBrew, deleteTeaCafeBrew } from '@/lib/api';

export interface TeaCafeActionState {
  status: 'idle' | 'success' | 'error';
  message: string;
  errors?: Record<string, string>;
}

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

function refreshTeaCafePages() {
  revalidatePath('/');
  revalidatePath('/tea-cafe');
  revalidatePath('/tea-cafe/manage');
}

export async function createBrewAction(
  _previousState: TeaCafeActionState,
  formData: FormData,
): Promise<TeaCafeActionState> {
  const session = await auth();

  if (
    !session?.apiAccessToken ||
    !session.user.roles.includes('tea_cafe_attendant')
  ) {
    return {
      status: 'error',
      message: 'Bu işlem için çayhane görevlisi yetkisi gerekiyor.',
    };
  }

  try {
    const result = await createTeaCafeBrew(session.apiAccessToken, {
      beverageType: formText(formData, 'beverageType'),
      durationMinutes: formText(formData, 'durationMinutes'),
      note: formText(formData, 'note'),
    });

    if (result.ok) {
      refreshTeaCafePages();
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

export async function deleteBrewAction(
  _previousState: TeaCafeActionState,
  formData: FormData,
): Promise<TeaCafeActionState> {
  const session = await auth();

  if (
    !session?.apiAccessToken ||
    !session.user.roles.includes('tea_cafe_attendant')
  ) {
    return {
      status: 'error',
      message: 'Bu işlem için çayhane görevlisi yetkisi gerekiyor.',
    };
  }

  try {
    const result = await deleteTeaCafeBrew(
      session.apiAccessToken,
      formText(formData, 'brewId'),
    );

    if (result.ok) {
      refreshTeaCafePages();
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
