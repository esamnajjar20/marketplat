/**
 * تفضيلات مركز الأوفلاين (محلية على الجهاز).
 * - wifiOnlySync: لا تُزامَن تلقائياً على بيانات الجوال
 */

const WIFI_KEY = 'offline-hub:wifi-only-sync';
export function getWifiOnlySync(): boolean {
  try {
    const v = localStorage.getItem(WIFI_KEY);
    // افتراضي: false (مزامنة على أي اتصال) حتى لا نكسر السلوك الحالي صامتًا
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

export function setWifiOnlySync(enabled: boolean): void {
  try {
    localStorage.setItem(WIFI_KEY, enabled ? '1' : '0');
    window.dispatchEvent(new CustomEvent('offline-hub:prefs-changed'));
  } catch {
    /* private mode */
  }
}

/**
 * هل يُسمح بالمزامنة التلقائية الآن؟
 * - غير متصل → لا
 * - wifiOnly غير مفعّل → نعم
 * - wifiOnly مفعّل → نعم فقط على wifi/ethernet أو عند عدم توفر Network Information API
 */
export function shouldAutoSyncNow(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (!navigator.onLine) return false;
  if (!getWifiOnlySync()) return true;

  type NetInfo = { type?: string; effectiveType?: string; saveData?: boolean };
  const nav = navigator as Navigator & {
    connection?: NetInfo;
    mozConnection?: NetInfo;
    webkitConnection?: NetInfo;
  };
  const conn: NetInfo | undefined =
    nav.connection || nav.mozConnection || nav.webkitConnection;

  if (!conn) {
    // لا معلومات شبكة — لا نمنع المزامنة (أفضل من حظر صامت على أجهزة كثيرة)
    return true;
  }
  if (conn.saveData) return false;
  const type = (conn.type || '').toLowerCase();
  if (type === 'wifi' || type === 'ethernet' || type === 'wimax') return true;
  if (type === 'cellular' || type === '2g' || type === '3g' || type === '4g' || type === '5g') {
    return false;
  }
  // type "unknown" / "none" / empty
  return true;
}

export function describeNetworkForSync(): string {
  if (typeof navigator === 'undefined' || !navigator.onLine) return 'غير متصل';
  const conn = (navigator as Navigator & {
    connection?: { type?: string; effectiveType?: string };
  }).connection;
  if (!conn?.type) return 'متصل';
  const t = conn.type.toLowerCase();
  if (t === 'wifi') return 'Wi‑Fi';
  if (t === 'ethernet') return 'سلكي';
  if (t === 'cellular') return 'بيانات الجوال';
  return conn.type;
}
