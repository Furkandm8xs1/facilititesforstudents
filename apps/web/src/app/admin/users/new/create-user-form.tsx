'use client';

import { useActionState, useEffect, useRef } from 'react';

import { createUserAction, type CreateUserFormState } from './actions';

const initialCreateUserState: CreateUserFormState = {
  status: 'idle',
  message: '',
};

const roleOptions = [
  {
    value: 'platform_admin',
    label: 'Platform yöneticisi',
    description: 'Kullanıcıları ve rollerini yönetir.',
  },
  {
    value: 'canteen_manager',
    label: 'Kantin yöneticisi',
    description: 'Ürünleri ve fiyatları yönetir.',
  },
  {
    value: 'canteen_operator',
    label: 'Kantin görevlisi',
    description: 'Stok ve sipariş akışını yönetir.',
  },
  {
    value: 'wallet_cashier',
    label: 'Cüzdan kasiyeri',
    description: 'Nakit yükleme ve gerekçeli düzeltme yapar.',
  },
] as const;

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState(
    createUserAction,
    initialCreateUserState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
    }
  }, [state.status, state.message]);

  return (
    <form className="admin-form" action={formAction} ref={formRef}>
      <div className="form-grid">
        <label>
          <span>Ad</span>
          <input name="firstName" maxLength={80} autoComplete="off" required />
          <small>{state.errors?.firstName}</small>
        </label>
        <label>
          <span>Soyad</span>
          <input name="lastName" maxLength={80} autoComplete="off" required />
          <small>{state.errors?.lastName}</small>
        </label>
      </div>

      <label>
        <span>Telefon numarası</span>
        <input
          name="phoneE164"
          type="tel"
          inputMode="tel"
          placeholder="+905551112233"
          autoComplete="off"
          required
        />
        <small>
          {state.errors?.phoneE164 ?? 'Ülke koduyla ve boşluksuz girin.'}
        </small>
      </label>

      <label>
        <span>Geçici parola</span>
        <input
          name="temporaryPassword"
          type="password"
          minLength={10}
          maxLength={128}
          autoComplete="new-password"
          required
        />
        <small>
          {state.errors?.temporaryPassword ??
            'Kullanıcı ilk girişte bu parolayı değiştirecek.'}
        </small>
      </label>

      <fieldset>
        <legend>Roller</legend>
        <div className="base-role">
          <strong>Portal kullanıcısı</strong>
          <span>Her hesaba otomatik atanır.</span>
        </div>
        <div className="role-grid">
          {roleOptions.map((role) => (
            <label className="role-option" key={role.value}>
              <input type="checkbox" name="roles" value={role.value} />
              <span>
                <strong>{role.label}</strong>
                <small>{role.description}</small>
              </span>
            </label>
          ))}
        </div>
        {state.errors?.roles ? (
          <small className="field-error">{state.errors.roles}</small>
        ) : null}
      </fieldset>

      <div className="form-footer">
        <p
          className={`form-message form-message-${state.status}`}
          aria-live="polite"
        >
          {state.message}
        </p>
        <button className="primary-action form-submit" disabled={pending}>
          {pending ? 'Kullanıcı oluşturuluyor…' : 'Kullanıcı oluştur'}
        </button>
      </div>
    </form>
  );
}
