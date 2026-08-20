'use server';

import { auth } from '@/auth';
import { createUser } from '@/lib/api';

export interface CreateUserFormState {
  status: 'idle' | 'success' | 'error';
  message: string;
  errors?: Record<string, string>;
}

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export async function createUserAction(
  _previousState: CreateUserFormState,
  formData: FormData,
): Promise<CreateUserFormState> {
  const session = await auth();

  if (
    !session?.apiAccessToken ||
    !session.user.roles.includes('platform_admin')
  ) {
    return {
      status: 'error',
      message: 'Bu işlem için platform yöneticisi yetkisi gerekli.',
    };
  }

  try {
    const result = await createUser(session.apiAccessToken, {
      firstName: formText(formData, 'firstName'),
      lastName: formText(formData, 'lastName'),
      phoneE164: formText(formData, 'phoneE164'),
      temporaryPassword: formText(formData, 'temporaryPassword'),
      roles: formData
        .getAll('roles')
        .filter((role): role is string => typeof role === 'string'),
    });

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
