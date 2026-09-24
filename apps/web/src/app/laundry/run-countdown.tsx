'use client';

import { useLaundryNow } from './laundry-clock';

function formatRemaining(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours} saat ${minutes} dakika ${seconds} saniye kaldı`;
}

export function LaundryRunCountdown({ readyAt }: { readyAt: string }) {
  const now = useLaundryNow();
  const remainingSeconds = Math.max(
    0,
    Math.ceil((new Date(readyAt).getTime() - now) / 1_000),
  );

  if (remainingSeconds === 0) {
    return (
      <span className="laundry-countdown laundry-countdown-ready">
        Süre bitti · Operatörün çıkarması bekleniyor
      </span>
    );
  }

  return (
    <span className="laundry-countdown">
      {formatRemaining(remainingSeconds)}
    </span>
  );
}
