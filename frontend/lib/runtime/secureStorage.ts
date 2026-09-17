/**
 * تخزين مفاتيح حساسة نسبيًا حسب بيئة التشغيل.
 *
 * - Browser / PWA: localStorage (نفس سلوك المشروع الحالي)
 * - Native: @capacitor/preferences إن وُجدت، وإلا localStorage كاحتياط
 *
 * ملاحظة أمنية: JWT الحالي يبقى في ذاكرة الـ store + cookies httpOnly
 * للـ refresh — هذه الطبقة لرموز الجهاز (FCM) وتفضيلات التثبيت/الإشعارات
 * وليس لاستبدال مسار المصادقة.
 *
 * تثبيت Preferences اختياري:
 *   npm i @capacitor/preferences
 *   npx cap sync
 */

import { isNativePlatform } from '@/lib/capacitor/platform';

type Driver = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

const memory = new Map<string, string>();

const memoryDriver: Driver = {
  async get(key) {
    return memory.has(key) ? memory.get(key)! : null;
  },
  async set(key, value) {
    memory.set(key, value);
  },
  async remove(key) {
    memory.delete(key);
  },
};

const localStorageDriver: Driver = {
  async get(key) {
    if (typeof localStorage === 'undefined') return memoryDriver.get(key);
    try {
      return localStorage.getItem(key);
    } catch {
      return memoryDriver.get(key);
    }
  },
  async set(key, value) {
    if (typeof localStorage === 'undefined') return memoryDriver.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {
      await memoryDriver.set(key, value);
    }
  },
  async remove(key) {
    if (typeof localStorage === 'undefined') return memoryDriver.remove(key);
    try {
      localStorage.removeItem(key);
    } catch {
      await memoryDriver.remove(key);
    }
  },
};

let cached: Driver | null = null;

async function resolveDriver(): Promise<Driver> {
  if (cached) return cached;
  if (!(await isNativePlatform())) {
    cached = localStorageDriver;
    return cached;
  }
  try {
    // Optional peer: install with `npm i @capacitor/preferences && npx cap sync`
    // Using a variable keeps TS from resolving the module at compile time,
    // so the build succeeds whether or not the optional peer is installed.
    const pkgName = '@capacitor/preferences';
    const mod = (await import(/* webpackIgnore: true */ pkgName)) as {
      Preferences: {
        get: (opts: { key: string }) => Promise<{ value: string | null }>;
        set: (opts: { key: string; value: string }) => Promise<void>;
        remove: (opts: { key: string }) => Promise<void>;
      };
    };
    const { Preferences } = mod;
    cached = {
      async get(key) {
        const { value } = await Preferences.get({ key });
        return value;
      },
      async set(key, value) {
        await Preferences.set({ key, value });
      },
      async remove(key) {
        await Preferences.remove({ key });
      },
    };
    return cached;
  } catch {
    cached = localStorageDriver;
    return cached;
  }
}

export async function secureGet(key: string): Promise<string | null> {
  return (await resolveDriver()).get(key);
}

export async function secureSet(key: string, value: string): Promise<void> {
  return (await resolveDriver()).set(key, value);
}

export async function secureRemove(key: string): Promise<void> {
  return (await resolveDriver()).remove(key);
}
