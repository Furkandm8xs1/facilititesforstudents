'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';

import { getLaundryClockAction } from './actions';

const LaundryClockContext = createContext<number | null>(null);

export function LaundryClockProvider({
  initialServerTime,
  children,
}: {
  initialServerTime: string;
  children: ReactNode;
}) {
  const [now, setNow] = useState(() => new Date(initialServerTime).getTime());

  useEffect(() => {
    let active = true;
    let clockOffsetMs = new Date(initialServerTime).getTime() - Date.now();

    const update = () => {
      if (active) setNow(Date.now() + clockOffsetMs);
    };

    const synchronize = async () => {
      const sentAt = Date.now();
      const serverTime = await getLaundryClockAction();
      const receivedAt = Date.now();

      if (!active || !serverTime) return;
      const estimatedServerNow =
        new Date(serverTime).getTime() + (receivedAt - sentAt) / 2;
      clockOffsetMs = estimatedServerNow - receivedAt;
      update();
    };

    update();
    void synchronize();
    const interval = window.setInterval(update, 1_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [initialServerTime]);

  return (
    <LaundryClockContext.Provider value={now}>
      {children}
    </LaundryClockContext.Provider>
  );
}

export function useLaundryNow() {
  const now = useContext(LaundryClockContext);
  if (now === null) {
    throw new Error('useLaundryNow requires LaundryClockProvider.');
  }
  return now;
}
