'use client';

import { useActionState } from 'react';

import type { AdminUser } from '@/lib/api';

import { updateUserRolesAction, type UserRolesActionState } from './actions';
import { roleOptions } from './role-options';

const initialState: UserRolesActionState = { status: 'idle', message: '' };

const statusLabels = {
  ACTIVE: 'Aktif',
  SUSPENDED: 'Askıda',
  DEPARTED: 'Ayrıldı',
} as const;

export function UserRoleEditor({
  user,
  currentUserSubject,
  rowNumber,
}: {
  user: AdminUser;
  currentUserSubject: string;
  rowNumber: number;
}) {
  const [state, formAction, pending] = useActionState(
    updateUserRolesAction,
    initialState,
  );
  const isCurrentUser = user.keycloakSubject === currentUserSubject;
  const assignedRoleCount = user.roles.filter(
    (role) => role !== 'portal_user',
  ).length;

  return (
    <details className="user-table-row">
      <summary className="user-table-summary">
        <span className="user-row-number">
          {String(rowNumber).padStart(2, '0')}
        </span>
        <span className="user-row-name">
          <strong>
            {user.firstName} {user.lastName}
          </strong>
          {isCurrentUser ? <span className="self-badge">Sen</span> : null}
        </span>
        <span className="user-row-phone">{user.phoneE164}</span>
        <span className={`user-status user-status-${user.status}`}>
          {statusLabels[user.status]}
        </span>
        <span className="user-row-role-count">{assignedRoleCount} rol</span>
        <span className="user-row-action">
          <span className="row-action-open">Rolleri gör</span>
          <span className="row-action-close">Kapat</span>
        </span>
      </summary>

      <form className="user-row-role-form" action={formAction}>
        <input type="hidden" name="userId" value={user.id} />
        <div className="base-role user-base-role">
          <strong>Portal kullanıcısı</strong>
          <span>Her hesapta zorunlu ve değiştirilemez.</span>
        </div>
        <div className="user-role-grid">
          {roleOptions.map((role) => {
            const checked = user.roles.includes(role.value);
            const lockOwnAdminRole =
              isCurrentUser && role.value === 'platform_admin';

            return (
              <div key={role.value}>
                {lockOwnAdminRole ? (
                  <input type="hidden" name="roles" value={role.value} />
                ) : null}
                <label className="role-option user-role-option">
                  <input
                    type="checkbox"
                    name="roles"
                    value={role.value}
                    defaultChecked={checked}
                    disabled={lockOwnAdminRole}
                  />
                  <span>
                    <strong>{role.label}</strong>
                    <small>
                      {lockOwnAdminRole
                        ? 'Kendi yönetici yetkini kaldıramazsın.'
                        : role.description}
                    </small>
                  </span>
                </label>
              </div>
            );
          })}
        </div>
        <footer className="user-role-footer">
          <p
            className={`form-message form-message-${state.status}`}
            aria-live="polite"
          >
            {state.message}
          </p>
          <button className="primary-action" disabled={pending}>
            {pending ? 'Kaydediliyor…' : 'Rolleri kaydet'}
          </button>
        </footer>
      </form>
    </details>
  );
}
