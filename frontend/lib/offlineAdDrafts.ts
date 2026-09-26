/**
 * مسودات الأوفلاين — IndexedDB.
 *
 * يدعم 4 أنواع: إعلان / منتج / خدمة / طلب خدمة (kind).
 *
 * المستخدم يكتب بدون نت → يُحفظ محليًا بحالة draft/pending_sync
 * وليس «تم النشر». عند عودة الاتصال: الرفع من مركز المزامنة أو تلقائيًا.
 *
 * FIX OFFLINE-DRAFT-PUBLISH-01: نخزّن أيضًا ملفات النشر الأصلية
 * (publishFiles) عند فشل الشبكة حتى يستطيع offlineDraftPublisher
 * إعادة الرفع عند عودة النت حتى لو طابور الـ SW لم يعترض الطلب
 * (SW غير مفعّل، origin مختلف، إلخ). المعاينات المضغوطة (images)
 * تبقى للعرض فقط في مركز المزامنة.
 *
 * الاسم التاريخي offlineAdDrafts بقي للتوافق مع الاستيرادات الحالية؛
 * الحقل kind يميّز النوع فعليًا.
 */

const DB_NAME = 'market-ad-drafts';
const DB_VERSION = 1;
const STORE = 'drafts';
/**
 * سقف إجمالي لكل مستخدم عبر كل الأنواع (إعلان/منتج/خدمة/طلب خدمة) معًا —
 * نفس الـ store ونفس العدّاد. ليس 20 لكل نوع. قرار منتج صريح: الحدّ على
 * الجهاز لكل حساب، لا فصلًا حسب الكيان. تغييره إلى per-kind يحتاج تصفية
 * listAdDrafts بالـ kind قبل تطبيق السقف.
 */
const MAX_DRAFTS = 20;
const MAX_PREVIEW_IMAGES = 4;

export type AdDraftStatus = 'draft' | 'pending_sync' | 'failed' | 'synced';

/** نوع الكيان — مسودات قديمة بلا kind تُعامَل كـ 'ad'. */
export type OfflineDraftKind = 'ad' | 'product' | 'service' | 'open-request';

/**
 * FIX IMAGEOFFLINE-WIRE-01: نسخة معاينة مضغوطة واحدة (lib/imageOffline.ts's
 * compressImageForOffline) — للعرض بمركز المزامنة فقط، ليست الصورة
 * المُرسَلة فعليًا عند النشر (تلك عبر طابور الـ SW بجودتها الكاملة).
 */
export interface AdDraftPreviewImage {
  name: string;
  blob: Blob;
}

/**
 * FIX OFFLINE-DRAFT-PUBLISH-01 + FIX ARRAYBUFFER-MIGRATION-01.
 *
 * ARRAYBUFFER-MIGRATION-01: bytes (ArrayBuffer) is the current format.
 * Blob (legacy) is kept so drafts written before this migration still
 * load. Android WebView sometimes rejects Blob writes with
 * DataError('Failed to write blobs (InvalidBlob)') — ArrayBuffer never
 * hits that path.
 */
export interface AdDraftPublishFile {
  name: string;
  type: string;
  /** Current format — IndexedDB-safe raw bytes. */
  bytes?: ArrayBuffer;
  /** Legacy format from drafts written before the ArrayBuffer migration. */
  blob?: Blob;
}

/** حد أقصى لملفات النشر المحفوظة مع المسودة (صور أصلية). */
const MAX_PUBLISH_FILES = 10;
// FIX DRAFT-PUBLISH-SIZE-CAP: count cap alone is not enough — ten 5MB
// phone photos would consume 50MB of IndexedDB per draft, easily
// blowing the per-origin quota on a low-end Android device (often
// ~10-20% of free disk in practice) and taking every other draft down
// with it. A single oversized upload is skipped, and the total is
// hard-capped at 12MB — comfortably above the ~4-8MB of a few
// browser-compressed JPEGs, comfortably below any realistic quota.
const MAX_PUBLISH_FILE_BYTES = 6 * 1024 * 1024;   // 6 MB per file (FIX OFFLINE-QUEUE-RELIABILITY-01)
const MAX_PUBLISH_TOTAL_BYTES = 18 * 1024 * 1024; // 18 MB per draft

/**
 * ARRAYBUFFER-MIGRATION-01: async — each File's bytes are read into an
 * ArrayBuffer so the draft survives IndexedDB on Android WebView. A
 * file whose arrayBuffer() rejects is skipped (draft is still saved
 * without it rather than failing the whole save).
 */
export async function filesToPublishFiles(
  files: File[],
): Promise<AdDraftPublishFile[]> {
  const out: AdDraftPublishFile[] = [];
  let total = 0;
  for (const f of files.slice(0, MAX_PUBLISH_FILES)) {
    if (f.size > MAX_PUBLISH_FILE_BYTES) {
      console.warn(
        '[offline-drafts] skipping oversized publish file',
        f.name,
        f.size,
      );
      continue;
    }
    if (total + f.size > MAX_PUBLISH_TOTAL_BYTES) {
      console.warn(
        '[offline-drafts] publish files total cap reached, dropping remaining',
        { total, cap: MAX_PUBLISH_TOTAL_BYTES },
      );
      break;
    }
    try {
      const bytes = await f.arrayBuffer();
      out.push({
        name: f.name || 'image.jpg',
        type: f.type || 'application/octet-stream',
        bytes,
      });
      total += f.size;
    } catch (err) {
      console.warn(
        '[offline-drafts] arrayBuffer() failed for',
        f.name,
        err,
      );
      // Skip — saving a draft without this file beats failing the save.
    }
  }
  return out;
}

/**
 * ARRAYBUFFER-MIGRATION-01: rebuilds File[] from publishFiles stored in
 * IndexedDB. Handles both the current `bytes` format and the legacy
 * `blob` one. Entries with neither are silently skipped.
 */
export async function publishFilesToFiles(
  files: AdDraftPublishFile[],
): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) {
    const type = f.type || 'application/octet-stream';
    if (f.bytes) {
      out.push(new File([f.bytes], f.name, { type }));
    } else if (f.blob) {
      out.push(new File([f.blob], f.name, { type }));
    }
  }
  return out;
}

/**
 * حمولة نصية مشتركة. للإعلان: title؛ للمنتج: name (يُنسخ أيضًا إلى title
 * للعرض الموحّد)؛ للخدمة: title.
 */
export interface AdDraftPayload {
  title: string;
  description: string;
  price?: string | number | null;
  categoryId?: string | null;
  city?: string | null;
  condition?: string | null;
  contactPhone?: string | null;
  /** معرفات/أسماء ملفات فقط — ليس محتوى الصور */
  imageLabels?: string[];
  /** حقول إضافية حسب النوع (pricingType، availability، …) */
  [key: string]: unknown;
}

export interface DraftVersion {
  savedAt: string;
  payload: AdDraftPayload;
}

export interface AdDraft {
  id: string;
  mode: 'create' | 'edit';
  /**
   * نوع الكيان. مسودات أُنشئت قبل التعميم بلا هذا الحقل → تُقرأ كـ 'ad'.
   */
  kind?: OfflineDraftKind;
  /** لمعرّف الكيان البعيد عند التعديل (إعلان / منتج / خدمة) */
  remoteAdId?: string | null;
  payload: AdDraftPayload;
  /**
   * PHASE-3: last payloads before current (newest first), max 5.
   * Does not store images blobs — payload text only.
   */
  versions?: DraftVersion[];
  status: AdDraftStatus;
  lastError?: string;
  // FIX LASTERROR-CODE-01: structured fields that make the
  // stored error re-translatable. `lastError` is the frozen
  // human-readable string as it stood at save time; it becomes
  // stale after any change to i18n/ar/errors.ts. The UI
  // re-translates from lastErrorCode when present (with
  // lastError as a legacy fallback for drafts written before
  // these fields existed).
  lastErrorCode?: string;
  lastErrorStatus?: number;
  createdAt: string;
  updatedAt: string;
  /**
   * FIX AD-DRAFT-QUEUE-LINK-01: نفس المعرّف المُرسَل كـ X-Offline-Op-Id
   * مع الطلب الفعلي (انظر lib/offlineOperationId.ts). يسمح لـ
   * lib/offlineAdDraftSync.ts بربط نجاح/فشل عنصر طابور الـ SW الحقيقي
   * بهذه المسودة تحديدًا، بدل بقائها "شبحًا" منفصلًا لا يتزامن أبدًا.
   * قد يكون null لمسودة أُنشئت بلا محاولة إرسال فعلية بعد (status:'draft'
   * نقي، لم يُقيَّد بعد بأي طلب طابور).
   */
  operationId?: string | null;
  /**
   * FIX AD-DRAFT-USER-SCOPE-01: معرّف صاحب المسودة وقت إنشائها. بدونه،
   * تسجيل خروج من حساب ودخول بآخر على نفس الجهاز يُظهر مسودات الحساب
   * السابق للحساب الجديد. null فقط لمسودات قديمة أُنشئت قبل هذا الحقل
   * (تُعامَل كغير مرتبطة بأي مستخدم معروف — انظر listAdDrafts).
   */
  userId?: string | null;
  /**
   * FIX IMAGEOFFLINE-WIRE-01: نسخ معاينة مضغوطة (حد MAX_PREVIEW_IMAGES) —
   * قد تكون فارغة/غائبة لو الضغط فشل أو الملف لم يكن صورة أصلًا؛ هذا لا
   * يمنع حفظ المسودة نفسها ولا يؤثر على النشر الفعلي.
   */
  images?: AdDraftPreviewImage[];
  /**
   * FIX OFFLINE-DRAFT-PUBLISH-01: الصور/الملفات الأصلية لإعادة النشر
   * من المسودة عند عودة النت (مسار احتياطي مستقل عن طابور الـ SW).
   */
  publishFiles?: AdDraftPublishFile[];
  /** عدد محاولات النشر التلقائي من المسودة — سقف لتجنّب حلقة لا نهائية. */
  publishRetryCount?: number;
}

// DRAFTS-BADGE-01: event so UI badges (BottomNav +) can live-update.
// Every mutation below dispatches this after a successful write.
const DRAFTS_UPDATED_EVENT = 'offline-drafts:updated';
function dispatchDraftsUpdated(): void {
  if (typeof window === 'undefined') return;
  try { window.dispatchEvent(new Event(DRAFTS_UPDATED_EVENT)); } catch { /* noop */ }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB غير متاح'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function newId(): string {
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** عنوان العرض الموحّد — title للإعلان/الخدمة، name للمنتج. */
export function draftDisplayTitle(d: AdDraft): string {
  const p = d.payload;
  const raw =
    (typeof p.title === 'string' && p.title.trim()) ||
    (typeof p.name === 'string' && String(p.name).trim()) ||
    '';
  return raw || 'مسودة بدون عنوان';
}

export function draftKindLabel(kind?: OfflineDraftKind | null): string {
  switch (kind ?? 'ad') {
    case 'product':
      return 'منتج';
    case 'service':
      return 'خدمة';
    case 'open-request':
      return 'طلب / احتياج';
    case 'ad':
    default:
      return 'إعلان';
  }
}

/**
 * FIX AD-DRAFT-USER-SCOPE-01: userId اختياري — مررها لتصفية مسودات
 * المستخدم الحالي فقط (شاشة "المزامنة" يجب أن تفعل هذا دومًا). بلا
 * userId تُرجَع كل المسودات بلا تمييز — تُستخدم فقط داخليًا (مثلًا عند
 * التنظيف الشامل) لا من أي واجهة تعرض محتوى لمستخدم بعينه.
 */
export async function listAdDrafts(userId?: string | null): Promise<AdDraft[]> {
  const db = await openDb();
  const items = await new Promise<AdDraft[]>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as AdDraft[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  const filtered = items.filter((d) => {
    if (d.status === 'synced') return false;
    // مسودة بلا userId (تنسيق قديم قبل FIX AD-DRAFT-USER-SCOPE-01) تُعرَض
    // فقط لو ما طُلب تصفية بمستخدم محدد — لا نخمّن ملكيتها.
    if (userId === undefined) return true;
    return (d.userId ?? null) === (userId ?? null);
  });
  return filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** يبحث عن مسودة بمعرّف عملية معيّن (X-Offline-Op-Id) — يُستخدم من
 * lib/offlineAdDraftSync.ts لربط نتيجة الطابور الفعلية بالمسودة. */
export async function findAdDraftByOperationId(operationId: string): Promise<AdDraft | null> {
  const all = await listAdDrafts(undefined);
  return all.find((d) => d.operationId === operationId) ?? null;
}

export async function getAdDraft(id: string): Promise<AdDraft | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as AdDraft) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAdDraft(
  input: {
    id?: string;
    mode: 'create' | 'edit';
    kind?: OfflineDraftKind;
    remoteAdId?: string | null;
    payload: AdDraftPayload;
    status?: AdDraftStatus;
    lastError?: string;
  // FIX LASTERROR-CODE-01: structured fields that make the
  // stored error re-translatable. `lastError` is the frozen
  // human-readable string as it stood at save time; it becomes
  // stale after any change to i18n/ar/errors.ts. The UI
  // re-translates from lastErrorCode when present (with
  // lastError as a legacy fallback for drafts written before
  // these fields existed).
  lastErrorCode?: string;
  lastErrorStatus?: number;
    operationId?: string | null;
    userId?: string | null;
    images?: AdDraftPreviewImage[];
    publishFiles?: AdDraftPublishFile[];
    publishRetryCount?: number;
  },
): Promise<AdDraft> {
  // FIX DRAFT-DEDUP-01: when called without an explicit id AND for a
  // real submission attempt (pending_sync/failed — not a plain 'draft'),
  // look for an existing same-user + same-kind + same-mode + same-payload
  // draft from a recent attempt and update it instead of creating a new
  // record. Before this, every offline retry made a fresh row because
  // getActiveOfflineDraftId() is cleared whenever the form opens without
  // ?draftId=, and each new attempt then had nothing to update — the
  // visible symptom was duplicate drafts ("hhhhhhhh" × 2) in the sync
  // center, with counters that double-counted a single user action.
  //
  // The window is 24h, and the payload comparison is exact (title +
  // description + category + city + everything else the form submits).
  // Two DIFFERENT submissions (different text, different images) never
  // collapse — only repeat attempts at the same content do. 'draft'
  // status is excluded on purpose: a user actively editing two items
  // at once should keep two autosaved drafts separate.
  let effectiveId = input.id;
  // T695 — dedup only runs when we have a real userId to scope against.
  // The comment above says "same-user + same-kind + same-mode + same-
  // payload", but the code called listAdDrafts(input.userId ?? undefined)
  // — when input.userId was undefined, listAdDrafts returns EVERY
  // draft on the device (its own documented behavior for callers that
  // pass no filter). A payload-identical draft from a different user
  // (e.g. both typed "iPhone 14 Pro" on a shared device, which the
  // marketplace makes likely) would then be matched, effectiveId set
  // to ITS id, and the save would overwrite the other user's draft —
  // preserving their userId, content replaced. Skipping dedup when
  // userId is undefined loses only the same-user double-save
  // protection for a path that shouldn't exist anyway (all real
  // callers pass the current user), and eliminates the cross-user
  // write.
  if (
    !effectiveId &&
    typeof input.userId === 'string' &&
    (input.status === 'pending_sync' || input.status === 'failed')
  ) {
    try {
      const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;
      const nowMs = Date.now();
      const all = await listAdDrafts(input.userId);
      const payloadJson = JSON.stringify(input.payload);
      const match = all.find((d) => {
        if ((d.kind ?? 'ad') !== (input.kind ?? 'ad')) return false;
        if (d.mode !== input.mode) return false;
        if (d.status === 'synced') return false;
        const ageMs = nowMs - new Date(d.updatedAt).getTime();
        if (!Number.isFinite(ageMs) || ageMs > DEDUP_WINDOW_MS) return false;
        try {
          return JSON.stringify(d.payload) === payloadJson;
        } catch {
          return false;
        }
      });
      if (match) {
        effectiveId = match.id;
        // SW-FIX-DEDUP-DEBUG: console.debug instead of console.info — Chrome
        // hides debug logs by default in production unless the user explicitly
        // opens the console with verbose level. Kept for support diagnostics.
        console.debug('[offline-drafts] dedup: updating existing draft', match.id);
      }
    } catch (err) {
      // Never let dedup failure block the save — worst case, a duplicate.
      console.warn('[offline-drafts] dedup lookup failed:', err);
    }
  }

  const existing = effectiveId ? await getAdDraft(effectiveId) : null;
  const now = new Date().toISOString();
  let versions: DraftVersion[] = existing?.versions ? [...existing.versions] : [];
  if (
    existing?.payload &&
    JSON.stringify(existing.payload) !== JSON.stringify(input.payload)
  ) {
    versions = [
      { savedAt: existing.updatedAt || now, payload: existing.payload },
      ...versions,
    ].slice(0, 5);
  }
  const draft: AdDraft = {
    id: effectiveId ?? existing?.id ?? newId(),
    mode: input.mode,
    kind: input.kind ?? existing?.kind ?? 'ad',
    remoteAdId: input.remoteAdId ?? existing?.remoteAdId ?? null,
    payload: input.payload,
    versions,
    status: input.status ?? existing?.status ?? 'draft',
    // T696 — preserve existing failure fields across saves that don't
    // touch them (e.g. restoreAdDraftVersion passes no lastError but
    // keeps status:'failed' — previously that combination wiped the
    // message while leaving the status, so the sync center listed a
    // failed draft with no reason). Mirrors the existing?.xxx fallback
    // already used for remoteAdId/operationId/userId below, gated on
    // the resulting status still being 'failed' so that a save which
    // moves the draft forward (back to 'draft') still clears the stale
    // failure text.
    ...(() => {
      const keeps = (input.status ?? existing?.status) === 'failed';
      return {
        lastError: keeps ? (input.lastError ?? existing?.lastError) : undefined,
        lastErrorCode: keeps ? (input.lastErrorCode ?? existing?.lastErrorCode) : undefined,
        lastErrorStatus: keeps ? (input.lastErrorStatus ?? existing?.lastErrorStatus) : undefined,
      };
    })(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    operationId: input.operationId ?? existing?.operationId ?? null,
    userId: input.userId ?? existing?.userId ?? null,
    images: (input.images ?? existing?.images)?.slice(0, MAX_PREVIEW_IMAGES),
    publishFiles:
      input.publishFiles !== undefined
        ? input.publishFiles.slice(0, MAX_PUBLISH_FILES)
        : existing?.publishFiles,
    publishRetryCount:
      input.publishRetryCount !== undefined
        ? input.publishRetryCount
        : existing?.publishRetryCount,
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(draft);
    // SAVE-DEBUG-CLEANUP-02: keep the onerror/onabort diagnostics —
    // if a future IndexedDB write fails (quota, another InvalidBlob
    // variant), one line in the console is worth having. Removed the
    // oncomplete console.log — it fired on every successful draft save.
    tx.oncomplete = () => { resolve(); };
    tx.onerror = () => { console.error('[offline-drafts] write tx error', tx.error); reject(tx.error); };
    tx.onabort = () => { console.error('[offline-drafts] write tx ABORTED', tx.error); reject(tx.error); };
  });

  // سقف عدد المسودات — FIX AD-DRAFT-USER-SCOPE-01: لكل مستخدم على حدة،
  // لا عالميًا عبر الجهاز. قبل هذا، نشاط مستخدم B الكثيف على نفس الجهاز
  // كان يقدر يحذف مسودات المستخدم A (pending_sync/failed تشمل) بلا أي
  // علاقة بينهما.
  const ownDrafts = await listAdDrafts(draft.userId);
  if (ownDrafts.length > MAX_DRAFTS) {
    const excess = ownDrafts.slice(MAX_DRAFTS);
    for (const d of excess) {
      await deleteAdDraft(d.id);
    }
  }

  dispatchDraftsUpdated();
  return draft;
}

export async function deleteAdDraft(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { dispatchDraftsUpdated(); resolve(); };
    tx.onerror = () => {
      // FIX AD-DRAFT-LOGGING: تسجيل فشل الحذف للتشخيص.
      console.warn('[ad-drafts] delete failed:', id, tx.error);
      reject(tx.error);
    };
  });
}

/** حذف شامل بلا شرط — احتفظ به لمسح كامل حقيقي (مثلًا زر "امسح كل بيانات
 * الأوفلاين" بإعدادات التخزين)، لكن لا تستدعِه من تسجيل الخروج (انظر
 * clearDraftOnlyAdDrafts أدناه — FIX AD-DRAFT-LOGOUT-DATALOSS-01). */
export async function clearAllAdDrafts(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => { dispatchDraftsUpdated(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * FIX AD-DRAFT-LOGOUT-DATALOSS-01: يُستدعى من تسجيل الخروج بدل
 * clearAllAdDrafts(). يحذف فقط مسودات status:'draft' — نص محلي لم يُحاول
 * إرساله أصلًا، آمن اعتباره "غير موجود" لو المستخدم خرج بلا نشره. يُبقي
 * 'pending_sync' و'failed' كما هي: عملية إرسال فعلية إما لا تزال منتظرة
 * بطابور الـ SW (سيُكمِلها تلقائيًا عند عودة الاتصال بغض النظر عن جلسة
 * الواجهة الحالية) أو فشلت وتحتاج قرار المستخدم — تسجيل الخروج وحده لا
 * يبرر محوها بصمت. مع FIX AD-DRAFT-USER-SCOPE-01، تبقى مربوطة بـ userId
 * صاحبها فلا تظهر لحساب آخر يدخل بعده على نفس الجهاز.
 */
export async function clearDraftOnlyAdDrafts(): Promise<void> {
  const all = await listAdDrafts(undefined);
  const toDelete = all.filter((d) => d.status === 'draft');
  for (const d of toDelete) {
    await deleteAdDraft(d.id);
  }
}

/** يُستدعى من lib/offlineAdDraftSync.ts عند وصول نتيجة فعلية من طابور
 * الـ SW لمسودة مرتبطة بـ operationId معيّن. */
export async function markAdDraftByOperationId(
  operationId: string,
  patch: { status: AdDraftStatus; lastError?: string },
): Promise<void> {
  const draft = await findAdDraftByOperationId(operationId);
  if (!draft) return;
  if (patch.status === 'synced') {
    // لا داعٍ للاحتفاظ بمسودة "متزامنة" — المحتوى نُشر فعليًا على السيرفر.
    await deleteAdDraft(draft.id);
    return;
  }
  await saveAdDraft({ ...draft, status: patch.status, lastError: patch.lastError });
}

/** يُستدعى عند QUEUE_ITEM_DISCARDED — المستخدم رفض إعادة المحاولة صراحة
 * من مركز المزامنة، فلا معنى لإبقاء مسودة "بانتظار الرفع" بلا أي عملية
 * تدعمها. حذف صريح، لا عبر إعادة استخدام دلالة 'synced'. */
export async function deleteAdDraftByOperationId(operationId: string): Promise<void> {
  const draft = await findAdDraftByOperationId(operationId);
  if (draft) await deleteAdDraft(draft.id);
}

/**
 * FIX AD-DRAFT-COUNT-SCOPE: كانت تستدعي listAdDrafts() بلا userId، فترجع
 * عدد مسودات كل المستخدمين على نفس الجهاز — رقم خاطئ لأي واجهة تعرضه
 * (لو استُخدمت مستقبلًا). الآن تقبل userId اختياريًا للاتساق مع listAdDrafts.
 * ملاحظة: غير مستخدمة حاليًا في الكود، لكنها موجودة كواجهة عامة (API)
 * فتُصلَح وقائيًا بدل تركها فخًّا لمن يستخدمها لاحقًا.
 */
export async function countPendingAdDrafts(userId?: string | null): Promise<number> {
  const items = await listAdDrafts(userId);
  return items.filter((d) => d.status === 'draft' || d.status === 'pending_sync' || d.status === 'failed')
    .length;
}


/** PHASE-3: restore payload from a previous version index (0 = newest history). */
export async function restoreAdDraftVersion(
  draftId: string,
  versionIndex: number,
): Promise<AdDraft | null> {
  const existing = await getAdDraft(draftId);
  if (!existing?.versions?.length) return null;
  const ver = existing.versions[versionIndex];
  if (!ver) return null;
  return saveAdDraft({
    id: existing.id,
    mode: existing.mode,
    kind: existing.kind,
    remoteAdId: existing.remoteAdId,
    payload: ver.payload,
    status: existing.status,
    operationId: existing.operationId,
    userId: existing.userId,
    images: existing.images,
    publishFiles: existing.publishFiles,
    publishRetryCount: existing.publishRetryCount,
  });
}

export function listAdDraftVersions(draft: AdDraft): DraftVersion[] {
  return draft.versions ?? [];
}
