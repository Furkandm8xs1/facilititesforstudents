'use client';

import {
  type KeyboardEvent,
  useActionState,
  useState,
} from 'react';

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
import { createIdempotencyKey } from '@/lib/idempotency';

const initialState: LaundryActionState = { status: 'idle', message: '' };

function IdempotencyKeyInput() {
  const [idempotencyKey] = useState(createIdempotencyKey);

  return (
    <input
      type="hidden"
      name="idempotencyKey"
      value={idempotencyKey}
      readOnly
    />
  );
}

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
  const [isOpen, setIsOpen] = useState(false);
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

  function toggleOperations() {
    setIsOpen((open) => !open);
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    toggleOperations();
  }

  return (
    <div
      className={`laundry-operation-card ${isOpen ? 'laundry-operation-card-open' : ''}`}
    >
      <div
        className="laundry-operation-summary"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-controls={`laundry-load-actions-${load.id}`}
        onClick={toggleOperations}
        onKeyDown={handleCardKeyDown}
      >
        <LaundryLoadCard load={load} showOwner />
      </div>

      {isOpen ? (
        <div
          className="laundry-operation-actions"
          id={`laundry-load-actions-${load.id}`}
        >
          <form action={completeAction}>
            <input type="hidden" name="intent" value="complete" />
            <input type="hidden" name="loadId" value={load.id} />
            <button
              className="secondary-action"
              disabled={completePending || !runReady}
            >
              {completePending
                ? 'Tamamlanıyor…'
                : 'Kıyafetleri çıkar ve tamamla'}
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
            <IdempotencyKeyInput
              key={transferState.requestId ?? 'initial-transfer-key'}
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
            <IdempotencyKeyInput
              key={refundState.requestId ?? 'initial-refund-key'}
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
      ) : null}
    </div>
  );
}
