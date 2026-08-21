'use server';

import { revalidatePath } from 'next/cache';

import { auth } from '@/auth';
import { updateAdminUserRoles } from '@/lib/api';

export interface UserRolesActionState {
  status: 'idle' | 'success' | 'error';
  message: string;
}

function formText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export async function updateUserRolesAction(
  _previousState: UserRolesActionState,
  formData: FormData,
): Promise<UserRolesActionState> {
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
    const result = await updateAdminUserRoles(
      session.apiAccessToken,
      formText(formData, 'userId'),
      formData
        .getAll('roles')
        .filter((role): role is string => typeof role === 'string'),
    );

    if (result.ok) {
      revalidatePath('/admin/users');
    }

    return {
      status: result.ok ? 'success' : 'error',
      message: result.message,
    };
  } catch {
    return {
      status: 'error',
      message: 'API hizmetine ulaşılamadı. Lütfen tekrar deneyin.',
    };
  }
}
