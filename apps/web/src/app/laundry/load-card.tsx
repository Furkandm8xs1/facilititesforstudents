import type { LaundryLoad, LaundryRun } from '@/lib/api';
import { formatTryMinor } from '@/lib/money';

import { LaundryRunCountdown } from './run-countdown';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

function machineLabel(run: LaundryRun) {
  return `${run.machineType === 'WASH' ? 'Çamaşır' : 'Kurutma'} makinesi ${run.machineNumber}`;
}

export function LaundryLoadCard({
  load,
  showOwner = false,
}: {
  load: LaundryLoad;
  showOwner?: boolean;
}) {
  const currentRun =
    load.currentRun ??
    (load.location && 'machineType' in load.location ? load.location : null) ??
    [...load.runs].reverse().find((run) => !run.removedAt) ??
    load.runs.at(-1);
  const ownerName = load.owner
    ? `${load.owner.firstName} ${load.owner.lastName}`
    : (load.customerName ?? 'Laundry kullanıcısı');
  const ownerPhone = load.owner?.phoneE164 ?? load.phoneE164;

  return (
    <article className="laundry-load-card">
      <header>
        <div>
          <span className={`laundry-state laundry-state-${load.status}`}>
            {load.refundedAt
              ? 'İade edildi'
              : load.completedAt
                ? 'Tamamlandı'
                : 'Aktif'}
          </span>
          {showOwner ? (
            <>
              <strong>{ownerName}</strong>
              {ownerPhone ? <small>{ownerPhone}</small> : null}
            </>
          ) : (
            <strong>
              {currentRun ? machineLabel(currentRun) : 'Laundry kaydı'}
            </strong>
          )}
        </div>
        <time dateTime={load.createdAt}>
          {dateFormatter.format(new Date(load.createdAt))}
        </time>
      </header>

      <div className="laundry-run-list">
        {load.runs.map((run) => (
          <div className="laundry-run" key={run.id}>
            <div>
              <strong>{machineLabel(run)}</strong>
              <span>{run.removedAt ? 'Kıyafet çıktı' : 'Makinede'}</span>
              {!run.removedAt ? (
                <LaundryRunCountdown readyAt={run.readyAt} />
              ) : null}
            </div>
            <div className="laundry-run-timing">
              <span>Planlanan çıkış</span>
              <time dateTime={run.readyAt}>
                {dateFormatter.format(new Date(run.readyAt))}
              </time>
              {run.removedAt ? (
                <>
                  <span>Çıkarıldığı saat</span>
                  <time dateTime={run.removedAt}>
                    {dateFormatter.format(new Date(run.removedAt))}
                  </time>
                </>
              ) : null}
              <strong>{formatTryMinor(run.priceMinor)}</strong>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
