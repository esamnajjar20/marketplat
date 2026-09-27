const KEY = 'marketplat:data-saver';
const EVENT = 'marketplat:data-saver';

let hydrated = false;

function connectionWantsSaver(): boolean {
  if (typeof navigator === 'undefined') return false;

  const conn = (navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      saveData?: boolean;
    };
  }).connection;

  if (!conn) return false;
  if (conn.saveData) return true;

  const type = conn.effectiveType;
  return type === 'slow-2g' || type === '2g';
}

export function isDataSaverEnabled(): boolean {
  if (typeof window === 'undefined' || !hydrated) return false;

  try {
    if (window.localStorage.getItem(KEY) === '1') return true;
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
      window.localStorage.setItem(KEY, '1');
    } else {
      window.localStorage.removeItem(KEY);
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
