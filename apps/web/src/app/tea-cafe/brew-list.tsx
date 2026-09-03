'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';

import type { TeaCafeBrew } from '@/lib/api';

import { deleteBrewAction, type TeaCafeActionState } from './actions';

const initialActionState: TeaCafeActionState = {
  status: 'idle',
  message: '',
};
const timeFormatter = new Intl.DateTimeFormat('tr-TR', {
  hour: '2-digit',
  minute: '2-digit',
});

function remainingLabel(milliseconds: number): string {
  if (milliseconds <= 0) {
    return 'Hazır';
  }

  const totalSeconds = Math.ceil(milliseconds / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes > 0
    ? `${minutes} dk ${String(seconds).padStart(2, '0')} sn`
    : `${seconds} sn`;
}

export function BrewList({
  brews,
  initialNow,
  canDelete = false,
}: {
  brews: TeaCafeBrew[];
  initialNow: number;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    const clientStartedAt = Date.now();
    const clock = window.setInterval(
      () => setNow(initialNow + Date.now() - clientStartedAt),
      1_000,
    );
    const refresh = window.setInterval(() => router.refresh(), 30_000);

    return () => {
      window.clearInterval(clock);
      window.clearInterval(refresh);
    };
  }, [initialNow, router]);

  if (brews.length === 0) {
    return (
      <p className="empty-state tea-cafe-empty">
        Henüz görünür bir çay veya kahve demleme kaydı yok.
      </p>
    );
  }

  return (
    <div className="brew-grid">
      {brews.map((brew) => (
        <BrewCard brew={brew} canDelete={canDelete} key={brew.id} now={now} />
      ))}
    </div>
  );
}

function BrewCard({
  brew,
  canDelete,
  now,
}: {
  brew: TeaCafeBrew;
  canDelete: boolean;
  now: number;
}) {
  const [state, formAction, pending] = useActionState(
    deleteBrewAction,
    initialActionState,
  );
  const readyAt = new Date(brew.readyAt);
  const startedAt = new Date(brew.startedAt);
  const remaining = readyAt.getTime() - now;
  const ready = remaining <= 0;
  const durationMilliseconds = brew.durationMinutes * 60_000;
  const progress = Math.max(
    0,
    Math.min(
      100,
      ((durationMilliseconds - remaining) / durationMilliseconds) * 100,
    ),
  );
  const beverageLabel = brew.beverageType === 'TEA' ? 'Çay' : 'Kahve';

  return (
    <article className={`brew-card ${ready ? 'brew-card-ready' : ''}`}>
      <header>
        <span className="brew-type-mark" aria-hidden="true">
          {brew.beverageType === 'TEA' ? 'Ç' : 'K'}
        </span>
        <span className={`brew-state ${ready ? 'brew-state-ready' : ''}`}>
          {ready ? 'İçime hazır' : 'Demleniyor'}
        </span>
      </header>

      <div className="brew-card-copy">
        <h3>{beverageLabel}</h3>
        {brew.note ? <p>{brew.note}</p> : null}
      </div>

      <div className="brew-countdown">
        <span>{ready ? 'Durum' : 'Kalan süre'}</span>
        <strong>{remainingLabel(remaining)}</strong>
        <div className="brew-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      <dl className="brew-details">
        <div>
          <dt>Başlangıç</dt>
          <dd>
            <time dateTime={brew.startedAt}>
              {timeFormatter.format(startedAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt>Hazır olacağı saat</dt>
          <dd>
            <time dateTime={brew.readyAt}>{timeFormatter.format(readyAt)}</time>
          </dd>
        </div>
        <div>
          <dt>Demleme süresi</dt>
          <dd>{brew.durationMinutes} dakika</dd>
        </div>
      </dl>

      <footer className="brew-card-footer">
        <small>{brew.preparedBy} tarafından kaydedildi</small>
        {canDelete ? (
          <form
            action={formAction}
            onSubmit={(event) => {
              if (!window.confirm(`${beverageLabel} kaydı silinsin mi?`)) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="brewId" value={brew.id} />
            <button className="danger-action" disabled={pending}>
              {pending ? 'Siliniyor…' : 'Kaydı sil'}
            </button>
          </form>
        ) : null}
      </footer>
      {canDelete && state.status === 'error' ? (
        <p className="form-message form-message-error" role="alert">
          {state.message}
        </p>
      ) : null}
    </article>
  );
}
