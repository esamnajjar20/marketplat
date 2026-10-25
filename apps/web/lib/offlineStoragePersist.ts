/**
 * FIX STORAGE-PERSIST-01 — اطلب «تخزين دائم» من المتصفح.
 *
 * بدون navigator.storage.persist() يعتبر المتصفح كل الكاش (صفحات، ملفات JS/CSS،
 * بيانات) قابلًا للمسح بلا إنذار تحت ضغط التخزين، خصوصًا على iOS Safari والأجهزة
 * قليلة المساحة. هذا الطلب لا يضمن شيئًا: Chrome يقرّر بصمت حسب التفاعل/التثبيت،
 * و Firefox يعرض نافذة إذن، لذلك لا نستدعيه إلا للمستخدم المسجّل أو التطبيق
 * المثبّت، ولا نعيد الطلب بعد رفض قبل DENIED_RETRY_AFTER_MS.
 */

export type StoragePersistOutcome = 'granted' | 'already' | 'denied' | 'unsupported' | 'throttled';

const STATE_KEY = 'market:storage-persist:v1';
export const DENIED_RETRY_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

type PersistState = { result: 'granted' | 'denied'; at: number };

function readState(): PersistState | null {
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistState>;
    if ((parsed.result === 'granted' || parsed.result === 'denied') && typeof parsed.at === 'number') {
      return { result: parsed.result, at: parsed.at };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeState(state: PersistState): void {
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function isStandaloneDisplayMode(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

export async function ensurePersistentStorage(now: number = Date.now()): Promise<StoragePersistOutcome> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.persist !== 'function') {
    return 'unsupported';
  }
  try {
    if (typeof navigator.storage.persisted === 'function' && (await navigator.storage.persisted())) {
      writeState({ result: 'granted', at: now });
      return 'already';
    }
    const last = readState();
    if (last?.result === 'denied' && now - last.at < DENIED_RETRY_AFTER_MS) return 'throttled';

    const granted = await navigator.storage.persist();
    writeState({ result: granted ? 'granted' : 'denied', at: now });
    return granted ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}
