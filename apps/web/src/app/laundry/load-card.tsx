'use client';

import type { LaundryLoad, LaundryRun } from '@/lib/api';
import { formatTryMinor } from '@/lib/money';

import { useLaundryNow } from './laundry-clock';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

const timeFormatter = new Intl.DateTimeFormat('tr-TR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Istanbul',
});

function machineLabel(run: LaundryRun) {
  return `${run.machineType === 'WASH' ? 'Çamaşır' : 'Kurutma'} makinesi ${run.machineNumber}`;
}

function machineIcon(run: LaundryRun) {
  return run.machineType === 'WASH' ? 'Y' : 'K';
}

function remainingLabel(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'Hazır';
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0)
    return `${hours} saat ${minutes} dk ${String(seconds).padStart(2, '0')} sn`;
  if (minutes > 0)
    return `${minutes} dk ${String(seconds).padStart(2, '0')} sn`;
  return `${seconds} sn`;
}

function elapsedLabel(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} saat ${minutes} dk` : `${minutes} dk`;
}

function ActiveRunCard({ run }: { run: LaundryRun }) {
  const now = useLaundryNow();
  const readyAt = new Date(run.readyAt);
  const remaining = readyAt.getTime() - now;
  const remainingSeconds = Math.max(0, Math.ceil(remaining / 1_000));
  const ready = remainingSeconds === 0;
  const durationMs = run.durationSeconds * 1_000;
  const elapsed = durationMs - remaining;
  const progress = Math.max(0, Math.min(100, (elapsed / durationMs) * 100));

  return (
    <article
      className={`laundry-run-card ${ready ? 'laundry-run-card-ready' : ''}`}
    >
      <header>
        <span className="laundry-run-type-mark" aria-hidden="true">
          {machineIcon(run)}
        </span>
        <span
          className={`laundry-run-state ${ready ? 'laundry-run-state-ready' : ''}`}
        >
          {ready ? 'Çıkarılmayı bekliyor' : 'Makinede'}
        </span>
      </header>

      <div className="laundry-run-card-copy">
        <h3>{machineLabel(run)}</h3>
      </div>

      <div className="laundry-run-countdown">
        <span>
          {ready ? 'Çıkarılmayı bekliyor' : 'Kıyafet çıkmasına kalan'}
        </span>
        <strong>
          {ready ? elapsedLabel(-remaining) : remainingLabel(remainingSeconds)}
        </strong>
        <div className="laundry-run-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      <dl className="laundry-run-card-details">
        <div>
          <dt>Planlanan çıkış</dt>
          <dd>
            <time dateTime={run.readyAt}>{timeFormatter.format(readyAt)}</time>
          </dd>
        </div>
        <div>
          <dt>Süre</dt>
          <dd>{Math.round(run.durationSeconds / 60)} dakika</dd>
        </div>
        <div>
          <dt>Ücret</dt>
          <dd>{formatTryMinor(run.priceMinor)}</dd>
        </div>
      </dl>
    </article>
  );
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

  const activeRuns = load.runs.filter((run) => !run.removedAt);
  const isActive = !load.completedAt && !load.refundedAt;

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

      {isActive && activeRuns.length > 0 ? (
        <div className="laundry-active-runs">
          {activeRuns.map((run) => (
            <ActiveRunCard run={run} key={run.id} />
          ))}
        </div>
      ) : (
        <div className="laundry-run-list">
          {load.runs.map((run) => (
            <div className="laundry-run" key={run.id}>
              <div>
                <strong>{machineLabel(run)}</strong>
                <span>{run.removedAt ? 'Kıyafet çıktı' : 'Makinede'}</span>
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
      )}
    </article>
  );
}
