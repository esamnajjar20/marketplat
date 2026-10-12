'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentOfflineUserId } from '@/lib/offlineUserScope';

const DB_NAME = 'marketplat-form-attachments';
const DB_VERSION = 1;
const STORE_NAME = 'attachments';
const MAX_FILES = 10;
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_BYTES = 18 * 1024 * 1024;

type StoredFile = { name: string; type: string; lastModified: number; bytes: ArrayBuffer; size: number };
type AttachmentRecord = { key: string; owner: string; files: StoredFile[]; savedAt: number; totalBytes: number };

function scopedKey(key: string, owner: string) { return `${owner}:${key}`; }
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('التخزين المحلي للملفات غير متاح في هذا المتصفح.')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('تعذّر فتح مخزن مرفقات المسودة.'));
    request.onblocked = () => reject(new Error('مخزن المرفقات مشغول بتبويب آخر. أغلق التبويبات القديمة ثم أعد المحاولة.'));
  });
}
async function getRecord(key: string): Promise<AttachmentRecord | null> {
  const db = await openDb();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as AttachmentRecord | undefined) ?? null);
    req.onerror = () => reject(req.error);
  }); } finally { db.close(); }
}
async function ensureStorageCapacity(recordKey: string, nextBytes: number): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return;
  const [estimate, previous] = await Promise.all([
    navigator.storage.estimate(),
    getRecord(recordKey).catch(() => null),
  ]);
  if (!estimate.quota || estimate.usage == null) return;
  const projectedUsage = Math.max(0, estimate.usage - (previous?.totalBytes ?? 0)) + nextBytes;
  // Leave headroom for the app's other offline caches and browser bookkeeping.
  if (projectedUsage > estimate.quota * 0.95) {
    throw new Error('المساحة المتاحة على الجهاز لا تكفي لحفظ الصور بأمان. احذف بعض التنزيلات أو قلّل حجم الصور ثم أعد المحاولة.');
  }
}
async function putRecord(record: AttachmentRecord, canCommit: () => boolean): Promise<boolean> {
  const db = await openDb();
  try {
    // Re-check after opening IndexedDB: a newer selection or clear may have
    // superseded this save while openDb() was pending.
    if (!canCommit()) return false;
    await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('تعذّر حفظ الصور محليًا.'));
    tx.onabort = () => reject(tx.error ?? new Error('أُلغي حفظ الصور محليًا.'));
    });
    return true;
  } finally { db.close(); }
}
async function deleteRecord(key: string, canCommit: () => boolean = () => true): Promise<boolean> {
  const db = await openDb();
  try {
    // Prevent a stale empty-selection cleanup from deleting newer attachments.
    if (!canCommit()) return false;
    await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('تعذّر حذف مرفقات المسودة.'));
    tx.onabort = () => reject(tx.error ?? new Error('أُلغي حذف مرفقات المسودة.'));
    });
    return true;
  } finally { db.close(); }
}

/** Persists selected image Files separately from JSON form fields and restores them after reload. */
export function useFormDraftAttachments(
  key: string,
  files: File[],
  setFiles: (files: File[]) => void,
  options: { enabled?: boolean } = {},
) {
  const { enabled = true } = options;
  const owner = getCurrentOfflineUserId() ?? 'guest';
  const recordKey = scopedKey(key, owner);
  const ownerAtMount = useRef(owner);
  const latestFiles = useRef(files);
  const setFilesRef = useRef(setFiles);
  const readyRef = useRef(false);
  const restoredRef = useRef(false);
  const operationVersionRef = useRef(0);
  const [retryToken, setRetryToken] = useState(0);
  const [isSavingAttachments, setIsSavingAttachments] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [savedAttachmentCount, setSavedAttachmentCount] = useState(0);
  latestFiles.current = files;
  setFilesRef.current = setFiles;

  useEffect(() => {
    if (!enabled) { readyRef.current = false; return; }
    let cancelled = false;
    readyRef.current = false;
    void (async () => {
      try {
        const record = await getRecord(recordKey);
        if (cancelled) return;
        if (record && record.owner === ownerAtMount.current) {
          const current = latestFiles.current;
          if (current.length === 0 && !restoredRef.current) {
            const restored = record.files.map((item) => new File([item.bytes], item.name, { type: item.type, lastModified: item.lastModified }));
            setFilesRef.current(restored);
            setSavedAttachmentCount(restored.length);
          }
        }
        restoredRef.current = true;
        readyRef.current = true;
      } catch (error) {
        if (!cancelled) {
          readyRef.current = true;
          setAttachmentError(error instanceof Error ? error.message : 'تعذّر استعادة الصور المحفوظة.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, recordKey]);

  const signature = files.map((f) => `${f.name}:${f.size}:${f.lastModified}:${f.type}`).join('|');
  useEffect(() => {
    if (!enabled || !readyRef.current) return;
    const operationVersion = ++operationVersionRef.current;
    let cancelled = false;
    const isCurrentOperation = () => !cancelled && operationVersionRef.current === operationVersion && (getCurrentOfflineUserId() ?? 'guest') === ownerAtMount.current;
    if ((getCurrentOfflineUserId() ?? 'guest') !== ownerAtMount.current) {
      setAttachmentError('تغيّر الحساب؛ لم تُحفظ الصور لحماية خصوصية المسودة.');
      return () => { cancelled = true; };
    }
    const current = latestFiles.current;
    if (current.length === 0) {
      setIsSavingAttachments(false);
      void deleteRecord(recordKey, isCurrentOperation).then((deleted) => { if (deleted && isCurrentOperation()) { setSavedAttachmentCount(0); setAttachmentError(null); } }).catch((error) => {
        if (isCurrentOperation()) setAttachmentError(error instanceof Error ? error.message : 'تعذّر حذف الصور المحفوظة.');
      });
      return () => { cancelled = true; };
    }
    if (current.length > MAX_FILES) {
      setIsSavingAttachments(false);
      setAttachmentError(`يمكن حفظ ${MAX_FILES} صور كحد أقصى في المسودة؛ الصور الإضافية لن تُحفظ محليًا.`);
      return;
    }
    const totalBytes = current.reduce((sum, file) => sum + file.size, 0);
    const tooLarge = current.find((file) => file.size > MAX_FILE_BYTES);
    if (tooLarge || totalBytes > MAX_TOTAL_BYTES) {
      setIsSavingAttachments(false);
      setAttachmentError(tooLarge
        ? `الصورة «${tooLarge.name}» أكبر من 6 ميغابايت؛ لن تُحفظ محليًا.`
        : 'مجموع الصور أكبر من 18 ميغابايت؛ خفّض حجمها حتى تُحفظ المسودة بأمان.');
      return;
    }
    setIsSavingAttachments(true);
    setAttachmentError(null);
    void (async () => {
      try {
        const stored: StoredFile[] = [];
        for (const file of current) {
          stored.push({ name: file.name, type: file.type || 'application/octet-stream', lastModified: file.lastModified, size: file.size, bytes: await file.arrayBuffer() });
        }
        if (!isCurrentOperation()) return;
        if ((getCurrentOfflineUserId() ?? 'guest') !== ownerAtMount.current) throw new Error('تغيّر الحساب؛ أُوقف حفظ الصور لحماية الخصوصية.');
        await ensureStorageCapacity(recordKey, totalBytes);
        if (!isCurrentOperation()) return;
        const committed = await putRecord({ key: recordKey, owner: ownerAtMount.current, files: stored, savedAt: Date.now(), totalBytes }, isCurrentOperation);
        if (committed && isCurrentOperation()) { setSavedAttachmentCount(stored.length); setAttachmentError(null); }
      } catch (error) {
        if (isCurrentOperation()) setAttachmentError(error instanceof Error ? error.message : 'تعذّر حفظ الصور محليًا. احتفظ بالصور الأصلية قبل مغادرة الصفحة.');
      } finally { if (isCurrentOperation()) setIsSavingAttachments(false); }
    })();
    return () => { cancelled = true; };
    // File metadata is the change signal; File objects themselves are read from latestFiles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, recordKey, signature, retryToken]);

  const retrySaveAttachments = useCallback(() => {
    if ((getCurrentOfflineUserId() ?? 'guest') !== ownerAtMount.current) {
      setAttachmentError('تغيّر الحساب؛ لم تُعَد محاولة حفظ الصور.');
      return;
    }
    setRetryToken((value) => value + 1);
  }, []);

  const clearAttachments = useCallback(async () => {
    const clearVersion = ++operationVersionRef.current;
    if ((getCurrentOfflineUserId() ?? 'guest') !== ownerAtMount.current) {
      setAttachmentError('تغيّر الحساب؛ لم تُحذف أي مرفقات.');
      return;
    }
    try {
      const deleted = await deleteRecord(recordKey, () => operationVersionRef.current === clearVersion && (getCurrentOfflineUserId() ?? 'guest') === ownerAtMount.current);
      if (!deleted || operationVersionRef.current !== clearVersion) return;
      setSavedAttachmentCount(0);
      setAttachmentError(null);
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : 'تعذّر حذف الصور المحفوظة.');
    }
  }, [recordKey]);

  return { attachmentError, isSavingAttachments, savedAttachmentCount, clearAttachments, retrySaveAttachments };
}
