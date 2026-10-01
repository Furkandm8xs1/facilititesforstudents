'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';

import {
  getLaundryPriceMinor,
  type LaundryMachine,
  type LaundryMachineType,
  type LaundryOwner,
  type LaundryTariffs,
} from '@/lib/api';
import { formatTryMinor } from '@/lib/money';

import { manageLaundryAction, type LaundryActionState } from '../actions';

const initialState: LaundryActionState = { status: 'idle', message: '' };

export function NewLoadForm({
  customer,
  machines,
  tariffs,
}: {
  customer: LaundryOwner;
  machines: LaundryMachine[];
  tariffs: LaundryTariffs;
}) {
  const [machineType, setMachineType] = useState<LaundryMachineType>('WASH');
  const [state, formAction, pending] = useActionState(
    manageLaundryAction,
    initialState,
  );
  const idempotencyRef = useRef<HTMLInputElement>(null);
  const matchingMachines = useMemo(
    () => machines.filter((machine) => machine.machineType === machineType),
    [machineType, machines],
  );
  const price = formatTryMinor(getLaundryPriceMinor(tariffs, machineType));

  useEffect(() => {
    if (idempotencyRef.current && !idempotencyRef.current.value) {
      idempotencyRef.current.value = crypto.randomUUID();
    }
  }, []);

  useEffect(() => {
    if (state.requestId && idempotencyRef.current) {
      idempotencyRef.current.value = crypto.randomUUID();
    }
  }, [state.requestId]);

  return (
    <form className="laundry-operation-form" action={formAction}>
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="phoneE164" value={customer.phoneE164} />
      <input ref={idempotencyRef} type="hidden" name="idempotencyKey" />
      <header>
        <div>
          <span>Seçili kullanıcı</span>
          <strong>
            {customer.firstName} {customer.lastName}
          </strong>
          <small>{customer.phoneE164}</small>
        </div>
        <strong>{price}</strong>
      </header>
      <div className="laundry-form-grid">
        <label>
          <span>İşlem türü</span>
          <select
            name="machineType"
            value={machineType}
            onChange={(event) =>
              setMachineType(event.target.value as LaundryMachineType)
            }
          >
            <option value="WASH">Yıkama</option>
            <option value="DRY">Kurutma</option>
          </select>
        </label>
        <label>
          <span>Boş makine</span>
          <select name="machineNumber" required defaultValue="">
            <option value="" disabled>
              Makine seç
            </option>
            {matchingMachines.map((machine) => (
              <option
                value={machine.machineNumber}
                key={`${machine.machineType}-${machine.machineNumber}`}
              >
                {machine.machineNumber} numaralı makine
              </option>
            ))}
          </select>
        </label>
      </div>
      {matchingMachines.length === 0 ? (
        <p className="form-message form-message-error">
          Bu türde boş makine bulunmuyor.
        </p>
      ) : null}
      <div className="laundry-form-footer">
        <p
          className={`form-message form-message-${state.status}`}
          aria-live="polite"
        >
          {state.message}
        </p>
        <button
          className="primary-action"
          disabled={pending || matchingMachines.length === 0}
        >
          {pending ? 'İşleniyor…' : `${price} tahsil et ve başlat`}
        </button>
      </div>
    </form>
  );
}
