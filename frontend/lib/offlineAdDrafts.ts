/**
 * مسودات الأوفلاين — IndexedDB.
 *
 * يدعم 4 أنواع: إعلان / منتج / خدمة / طلب خدمة (kind).
 *
 * المستخدم يكتب بدون نت → يُحفظ محليًا بحالة draft/pending_sync
 * وليس «تم النشر». عند عودة الاتصال: الرفع من مركز المزامنة أو تلقائيًا.
 *
 * لا نخزّن ملفات الصور الأصلية بجودتها الكاملة (تلك تُرسَل فعليًا عبر
 * طابور الـ SW نفسه — نفس الطلب الأصلي). هنا فقط بيانات النص + نسخ
 * معاينة مضغوطة صغيرة اختيارية (FIX IMAGEOFFLINE-WIRE-01، انظر
 * AdDraftPreviewImage أدناه) لعرضها بمركز المزامنة، لا للنشر.
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
export type OfflineDraftKind = 'ad' | 'product' | 'service' | 'service-broadcast' | 'open-request';

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
    case 'service-broadcast':
      return 'طلب خدمة';
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
    operationId?: string | null;
    userId?: string | null;
    images?: AdDraftPreviewImage[];
  },
): Promise<AdDraft> {
  const existing = input.id ? await getAdDraft(input.id) : null;
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
    id: input.id ?? existing?.id ?? newId(),
    mode: input.mode,
    kind: input.kind ?? existing?.kind ?? 'ad',
    remoteAdId: input.remoteAdId ?? existing?.remoteAdId ?? null,
    payload: input.payload,
    versions,
    status: input.status ?? existing?.status ?? 'draft',
    lastError: input.lastError,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    operationId: input.operationId ?? existing?.operationId ?? null,
    userId: input.userId ?? existing?.userId ?? null,
    images: (input.images ?? existing?.images)?.slice(0, MAX_PREVIEW_IMAGES),
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(draft);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
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

  return draft;
}

export async function deleteAdDraft(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
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
    tx.oncomplete = () => resolve();
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

export async function countPendingAdDrafts(): Promise<number> {
  const items = await listAdDrafts();
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
  });
}

export function listAdDraftVersions(draft: AdDraft): DraftVersion[] {
  return draft.versions ?? [];
}
