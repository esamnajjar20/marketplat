
import { safeStorageGet, safeStorageRemove, safeStorageSet } from '@/lib/browserStorage';
const KEY = 'marketplat:data-saver';
const EVENT = 'marketplat:data-saver';

let hydrated = false;

function connectionWantsSaver(): boolean {
  if (typeof navigator === 'undefined') return false;

  const conn = (navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      saveData?: boolean;
      downlink?: number;
      rtt?: number;
    };
  }).connection;

  if (!conn) return false;
  if (conn.saveData) return true;

  const type = conn.effectiveType?.toLowerCase();
  return (
    type === 'slow-2g' ||
    type === '2g' ||
    type === '3g' ||
    (typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink < 1.5) ||
    (typeof conn.rtt === 'number' && conn.rtt >= 1_500)
  );
}

export function isDataSaverEnabled(): boolean {
  if (typeof window === 'undefined' || !hydrated) return false;

  try {
    if (safeStorageGet(KEY) === '1') return true;
  } catch {
    /* ignore */
  }

  return connectionWantsSaver();
}

export function hydrateDataSaver(): void {
  hydrated = true;
}

export function setDataSaverEnabled(on: boolean): void {
  if (typeof window === 'undefined') return;

  try {
    if (on) {
      safeStorageSet(KEY, '1');
    } else {
      safeStorageRemove(KEY);
    }

    window.dispatchEvent(
      new CustomEvent(EVENT, {
        detail: on,
      }),
    );
  } catch {
    /* ignore */
  }
}
