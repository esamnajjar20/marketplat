/**
 * مسودات الإعلانات للأوفلاين — IndexedDB.
 *
 * المستخدم يكتب إعلانًا بدون نت → يُحفظ محليًا بحالة draft/pending_sync
 * وليس «تم النشر». عند عودة الاتصال: الرفع من مركز المزامنة أو تلقائيًا.
 *
 * لا نخزّن ملفات صور ضخمة كـ base64 بلا حد — فقط بيانات النص + أسماء
 * ملفات اختيارية؛ رفع الصور الفعلي يتم أونلاين.
 */

const DB_NAME = 'market-ad-drafts';
const DB_VERSION = 1;
const STORE = 'drafts';
const MAX_DRAFTS = 20;

export type AdDraftStatus = 'draft' | 'pending_sync' | 'failed' | 'synced';

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
  [key: string]: unknown;
}

export interface AdDraft {
  id: string;
  mode: 'create' | 'edit';
  /** لمعرّف الإعلان عند التعديل */
  remoteAdId?: string | null;
  payload: AdDraftPayload;
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
    remoteAdId?: string | null;
    payload: AdDraftPayload;
    status?: AdDraftStatus;
    lastError?: string;
    operationId?: string | null;
    userId?: string | null;
  },
): Promise<AdDraft> {
  const existing = input.id ? await getAdDraft(input.id) : null;
  const now = new Date().toISOString();
  const draft: AdDraft = {
    id: input.id ?? existing?.id ?? newId(),
    mode: input.mode,
    remoteAdId: input.remoteAdId ?? existing?.remoteAdId ?? null,
    payload: input.payload,
    status: input.status ?? existing?.status ?? 'draft',
    lastError: input.lastError,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    operationId: input.operationId ?? existing?.operationId ?? null,
    userId: input.userId ?? existing?.userId ?? null,
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(draft);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // سقف عدد المسودات
  const all = await listAdDrafts();
  if (all.length > MAX_DRAFTS) {
    const excess = all.slice(MAX_DRAFTS);
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
    // لا داعٍ للاحتفاظ بمسودة "متزامنة" — الإعلان نُشر فعليًا، والمحتوى
    // نفسه موجود الآن على السيرفر لا بحاجة نسخة محلية. حذفها أوضح من
    // إبقائها بحالة يسهل الخلط بينها وبين قائمة إعلاناتي الحقيقية.
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
