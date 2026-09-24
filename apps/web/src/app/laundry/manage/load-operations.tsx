'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import {
  getLaundryPriceMinor,
  type LaundryLoad,
  type LaundryMachine,
  type LaundryMachineType,
  type LaundryTariffs,
} from '@/lib/api';
import { formatTryMinor } from '@/lib/money';

import { manageLaundryAction, type LaundryActionState } from '../actions';
import { useLaundryNow } from '../laundry-clock';
import { LaundryLoadCard } from '../load-card';

const initialState: LaundryActionState = { status: 'idle', message: '' };

export function LoadOperations({
  load,
  machines,
  tariffs,
}: {
  load: LaundryLoad;
  machines: LaundryMachine[];
  tariffs: LaundryTariffs;
}) {
  const [machineType, setMachineType] = useState<LaundryMachineType>('WASH');
  const now = useLaundryNow();
  const [transferState, transferAction, transferPending] = useActionState(
    manageLaundryAction,
    initialState,
  );
  const [completeState, completeAction, completePending] = useActionState(
    manageLaundryAction,
    initialState,
  );
  const [refundState, refundAction, refundPending] = useActionState(
    manageLaundryAction,
    initialState,
  );
  const transferIdempotencyRef = useRef<HTMLInputElement>(null);
  const refundIdempotencyRef = useRef<HTMLInputElement>(null);
  const matchingMachines = machines.filter(
    (machine) => machine.machineType === machineType,
  );
  const price = formatTryMinor(getLaundryPriceMinor(tariffs, machineType));
  const activeRun = [...load.runs]
    .reverse()
    .find((run) => run.status === 'IN_MACHINE' && !run.removedAt);
  const runReady =
    now > 0 &&
    activeRun !== undefined &&
    new Date(activeRun.readyAt).getTime() <= now;

  useEffect(() => {
    if (
      transferIdempotencyRef.current &&
      !transferIdempotencyRef.current.value
    ) {
      transferIdempotencyRef.current.value = crypto.randomUUID();
    }
    if (refundIdempotencyRef.current && !refundIdempotencyRef.current.value) {
      refundIdempotencyRef.current.value = crypto.randomUUID();
    }
  }, []);

  useEffect(() => {
    if (transferState.requestId && transferIdempotencyRef.current) {
      transferIdempotencyRef.current.value = crypto.randomUUID();
    }
  }, [transferState.requestId]);

  useEffect(() => {
    if (refundState.requestId && refundIdempotencyRef.current) {
      refundIdempotencyRef.current.value = crypto.randomUUID();
    }
  }, [refundState.requestId]);

  return (
    <div className="laundry-operation-card">
      <LaundryLoadCard load={load} showOwner />

      <div className="laundry-operation-actions">
        <form action={completeAction}>
          <input type="hidden" name="intent" value="complete" />
          <input type="hidden" name="loadId" value={load.id} />
          <button
            className="secondary-action"
            disabled={completePending || !runReady}
          >
            {completePending ? 'Tamamlanıyor…' : 'Kıyafetleri çıkar ve tamamla'}
          </button>
          {!runReady ? (
            <small>Makine süresi bitince çıkarma işlemi açılır.</small>
          ) : null}
          <p
            className={`form-message form-message-${completeState.status}`}
            aria-live="polite"
          >
            {completeState.message}
          </p>
        </form>

        <form className="laundry-transfer-form" action={transferAction}>
          <input type="hidden" name="intent" value="transfer" />
          <input type="hidden" name="loadId" value={load.id} />
          <input
            ref={transferIdempotencyRef}
            type="hidden"
            name="idempotencyKey"
          />
          <label>
            <span>Başka makineye aktar</span>
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
          <button
            className="primary-action"
            disabled={
              transferPending || matchingMachines.length === 0 || !runReady
            }
          >
            {transferPending
              ? 'Aktarılıyor…'
              : `${price} daha tahsil et ve aktar`}
          </button>
          <p
            className={`form-message form-message-${transferState.status}`}
            aria-live="polite"
          >
            {transferState.message}
          </p>
        </form>

        <form className="laundry-refund-form" action={refundAction}>
          <input type="hidden" name="intent" value="refund" />
          <input type="hidden" name="loadId" value={load.id} />
          <input
            ref={refundIdempotencyRef}
            type="hidden"
            name="idempotencyKey"
          />
          <label>
            <span>Tam iade gerekçesi</span>
            <input
              name="reason"
              minLength={3}
              placeholder="Örn. makine arızası"
              required
            />
          </label>
          <button className="danger-action" disabled={refundPending}>
            {refundPending ? 'İade ediliyor…' : 'Tüm ücretleri iade et'}
          </button>
          <p
            className={`form-message form-message-${refundState.status}`}
            aria-live="polite"
          >
            {refundState.message}
          </p>
        </form>
      </div>
    </div>
  );
}
