'use client';

/**
 * OCR لبطاقات النت الصغيرة (اسم مستخدم + كلمة سر — أرقام فقط في هذا المشروع).
 *
 * Pipeline:
 *   frame/guide crop → ROI لكل حقل → upscale 3× → preprocessing متعدد
 *   → Tesseract (digits only) → تطبيع → validation → (اختياري) توافق إطارات
 *
 * يعمل محليًا عبر public/tesseract + public/tessdata إن توفّرت، وإلا CDN.
 */

type TesseractWorker = {
  setParameters: (params: Record<string, string>) => Promise<void>;
  recognize: (
    image: HTMLCanvasElement | HTMLImageElement | string,
  ) => Promise<{ data: { text: string; confidence?: number } }>;
  terminate: () => Promise<void>;
  loadLanguage?: (lang: string) => Promise<void>;
  initialize?: (lang: string) => Promise<void>;
};

type TesseractModule = {
  createWorker: (
    langs?: string | string[],
    oem?: number,
    options?: Record<string, unknown>,
  ) => Promise<TesseractWorker>;
};

const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const LOAD_TIMEOUT_MS = 20000;
const RECOGNIZE_TIMEOUT_MS = 25000;
const WORKER_INIT_TIMEOUT_MS = 20000;

// مسارات محلية اختيارية (public/tesseract + public/tessdata) — إن رُفعت
// لاحقًا للعمل بدون إنترنت. لم تكن موجودة فعليًا في هذا المشروع (تحقّقنا:
// المجلدان غير موجودين إطلاقًا)، وكانت الأكواد تفرضهما بشكل ثابت بدل
// التحقق من وجودهما فعلًا — أي طلب لهما يفشل بـ404 من أول استخدام.
// السبب الجذري لضعف/فشل القراءة: getWorker() كانت تمرر هذه المسارات
// المكسورة في أول محاولتين (ara+eng ثم eng)، فتفشل الاثنتان دائمًا،
// ولا يصل الكود إلا للـfallback الثالث الذي كان بلا أي opts (يعتمد على
// افتراضات Tesseract.js الداخلية) — وهو fallback بلا عربي إطلاقًا (eng
// فقط)، ما يفسّر ضعف قراءة الاسم العربي بوضع الدفع تحديدًا. الحل: تحقّق
// فعلي من توفر الملفات المحلية (HEAD) قبل استخدامها، وإلا استخدم نفس
// روابط الـCDN المسموحة أصلًا في middleware.ts (CSP: cdn.jsdelivr.net +
// tessdata.projectnaptha.com) — بدل الاعتماد على افتراضات المكتبة
// الداخلية التي قد تشير لمضيف غير مسموح بالـCSP أصلًا (unpkg.com مثلًا).
const LOCAL_WORKER_PATH = '/tesseract/worker.min.js';
const LOCAL_CORE_PATH = '/tesseract/tesseract-core-simd-lstm.wasm.js';
const LOCAL_LANG_PATH = '/tessdata';
const CDN_WORKER_PATH = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js';
const CDN_CORE_PATH =
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm.js';
const CDN_LANG_PATH = 'https://tessdata.projectnaptha.com/4.0.0_best';

let resolvedPathsPromise: Promise<{ workerPath: string; corePath: string; langPath: string }> | null = null;

/** تحقّق فعلي (HEAD، بمهلة قصيرة) من وجود مسار — بدل افتراض وجوده. */
async function urlExists(url: string, timeoutMs = 2500): Promise<boolean> {
  if (typeof fetch === 'undefined') return false;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** يحدد مسارات worker/core/lang الفعلية القابلة للاستخدام (محلي إن توفر، وإلا CDN). */
function resolveTesseractPaths(): Promise<{ workerPath: string; corePath: string; langPath: string }> {
  if (resolvedPathsPromise) return resolvedPathsPromise;
  resolvedPathsPromise = (async () => {
    const [workerOk, coreOk, langOk] = await Promise.all([
      urlExists(LOCAL_WORKER_PATH),
      urlExists(LOCAL_CORE_PATH),
      urlExists(`${LOCAL_LANG_PATH}/eng.traineddata.gz`),
    ]);
    return {
      workerPath: workerOk ? LOCAL_WORKER_PATH : CDN_WORKER_PATH,
      corePath: coreOk ? LOCAL_CORE_PATH : CDN_CORE_PATH,
      langPath: langOk ? LOCAL_LANG_PATH : CDN_LANG_PATH,
    };
  })();
  return resolvedPathsPromise;
}

/** أطوال مقبولة لبطاقات النت (أرقام فقط) */
export const CARD_USER_LEN = { min: 8, max: 16 } as const;
export const CARD_PASS_LEN = { min: 4, max: 10 } as const;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`انتهت مهلة ${label} (${ms / 1000} ث)`) ),
      ms,
    );
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

let loadPromise: Promise<TesseractModule> | null = null;

// حجم البطاقة الآن يحتاج قراءة حقلين (مستخدم/سر) بالتوازي فعليًا — عامل واحد
// (Tesseract worker) يعالج طلبات recognize بالتتابع حتى لو استُدعيت عبر
// Promise.all، فكانت كل الحقول تُقرأ عمليًا واحدًا تلو الآخر رغم الشكل
// المتوازي بالكود. مسبح من عاملين يتيح تشغيل حقلين فعليًا بنفس اللحظة —
// نصف الزمن تقريبًا لأبطأ جزء من خط الأنابيب.
const WORKER_POOL_SIZE = 2;
const workerPromises: Array<Promise<TesseractWorker> | null> = new Array(WORKER_POOL_SIZE).fill(null);

function loadTesseract(): Promise<TesseractModule> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OCR غير متاح على الخادم'));
  }
  const w = window as unknown as { Tesseract?: TesseractModule };
  if (w.Tesseract) return Promise.resolve(w.Tesseract);
  if (loadPromise) return loadPromise;

  // تفضيل النسخة المحلية إن وُجدت في public/
  const localSrc = '/tesseract/tesseract.min.js';
  loadPromise = (async () => {
    const tryScript = (src: string) =>
      new Promise<void>((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          existing.addEventListener('load', () => resolve());
          existing.addEventListener('error', () => reject());
          if (w.Tesseract) resolve();
          return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`فشل تحميل ${src}`));
        document.head.appendChild(s);
      });

    try {
      await tryScript(localSrc);
      if (w.Tesseract) return w.Tesseract;
    } catch {
      /* fallback CDN */
    }
    await withTimeout(tryScript(TESSERACT_CDN), LOAD_TIMEOUT_MS, 'تحميل Tesseract');
    if (!w.Tesseract) throw new Error('Tesseract غير معرّف بعد التحميل');
    return w.Tesseract;
  })();

  return loadPromise;
}

async function getWorker(poolIndex = 0): Promise<TesseractWorker> {
  const idx = poolIndex % WORKER_POOL_SIZE;
  const existing = workerPromises[idx];
  if (existing) return existing;
  const created = (async () => {
    const Tess = await loadTesseract();
    // مسارات مُتحقَّق من صلاحيتها فعليًا (محلي إن توفر، وإلا CDN مسموح
    // بالـCSP) — بدل الافتراض الأعمى بأن public/tesseract أو public/tessdata
    // موجودان، وهو ما كان يسبب فشل كل محاولة OCR من نقطة تحميل الـworker
    // نفسها قبل ما توصل الصورة لأي معالجة.
    const opts: Record<string, unknown> = await resolveTesseractPaths();
    let worker: TesseractWorker;
    try {
      // ara+eng: أسماء عربية في الدفع + أرقام لاتينية
      worker = await withTimeout(
        Tess.createWorker(['ara', 'eng'], 1, opts),
        WORKER_INIT_TIMEOUT_MS,
        'تهيئة قارئ النص (عربي/إنجليزي)',
      );
    } catch {
      try {
        worker = await withTimeout(
          Tess.createWorker('eng', 1, opts),
          WORKER_INIT_TIMEOUT_MS,
          'تهيئة قارئ النص (إنجليزي)',
        );
      } catch {
        // fallback أخير: افتراضات Tesseract.js الداخلية (بلا opts) — قد لا
        // تطابق الـCSP الحالي (مضيف غير jsdelivr/tessdata.projectnaptha.com)،
        // لذا هي أضعف مسار وليست الحل الأساسي؛ أُبقيت فقط كخط دفاع أخير.
        worker = await withTimeout(
          Tess.createWorker('eng'),
          WORKER_INIT_TIMEOUT_MS,
          'تهيئة قارئ النص (احتياطي)',
        );
      }
    }
    return worker;
  })();
  workerPromises[idx] = created;
  // فشل التهيئة يجب ألا يُبقي الوعد عالقًا مرفوضًا دائمًا لاستدعاءات لاحقة
  // (كل صفحة/محاولة سكان جديدة تستحق محاولة تهيئة جديدة لنفس الفتحة بالمسبح).
  created.catch(() => {
    if (workerPromises[idx] === created) workerPromises[idx] = null;
  });
  return created;
}

// ── Image helpers ───────────────────────────────────────────────

function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d');
  if (ctx) ctx.drawImage(src, 0, 0);
  return c;
}

/** Upscale بـ bicubic-ish عبر canvas (drawImage quality) */
export function upscaleCanvas(src: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const f = Math.max(1, Math.min(4, factor));
  const c = document.createElement('canvas');
  c.width = Math.round(src.width * f);
  c.height = Math.round(src.height * f);
  const ctx = c.getContext('2d');
  if (!ctx) return src;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/**
 * ROI لحقول البطاقة داخل إطار الدليل.
 *
 * القيم مبنية على قياس فعلي لبطاقة حقيقية (غزل نت) بعد تصحيح دوران EXIF:
 * الشعار/الاسم التجاري يشغل تقريبًا 0–38% من ارتفاع البطاقة، سطر اسم
 * المستخدم تقريبًا 40–72%، وسطر كلمة السر تقريبًا 70–100% (يشمل الفوتر
 * الرفيع أسفله). القيم القديمة (0.22–0.54 لاسم المستخدم، 0.52–0.84 لكلمة
 * السر) كانت أعلى من موقعها الحقيقي بفارق صف كامل تقريبًا — فحص بصري
 * مباشر (قص المنطقتين وعرضهما) أثبت أن "ROI اسم المستخدم" كان يلتقط
 * الشعار بدل الأرقام، و"ROI كلمة السر" كان يلتقط سطر اسم المستخدم نفسه
 * بدل كلمة السر. هذا هو السبب الجذري الفعلي لضعف/خطأ القراءة، مش جودة
 * الصورة أو الإعدادات.
 */
export function cropFieldRoi(
  src: HTMLCanvasElement,
  field: 'username' | 'password',
): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  // هوامش جانبية 8% — النص عادة في الوسط
  const x = Math.round(w * 0.08);
  const cropW = Math.round(w * 0.84);
  let y: number;
  let cropH: number;
  if (field === 'username') {
    y = Math.round(h * 0.40);
    cropH = Math.round(h * 0.32);
  } else {
    y = Math.round(h * 0.70);
    cropH = Math.round(h * 0.30);
  }
  const c = document.createElement('canvas');
  c.width = Math.max(1, cropW);
  c.height = Math.max(1, cropH);
  const ctx = c.getContext('2d');
  if (!ctx) return src;
  ctx.drawImage(src, x, y, cropW, cropH, 0, 0, c.width, c.height);
  return c;
}

type PrepKind = 'gray' | 'contrast' | 'thresh100' | 'thresh130' | 'thresh160';

function preprocess(src: HTMLCanvasElement, kind: PrepKind): HTMLCanvasElement {
  const c = cloneCanvas(src);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    let g = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
    if (kind === 'contrast' || kind.startsWith('thresh')) {
      g = (g - 128) * 1.45 + 128;
      g = Math.max(0, Math.min(255, g));
    }
    if (kind.startsWith('thresh')) {
      const t = kind === 'thresh100' ? 100 : kind === 'thresh130' ? 130 : 160;
      g = g >= t ? 255 : 0;
    }
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// خمس نسخ معالجة لكل حقل كانت تعني 5 استدعاءات recognize فعلية لكل حقل بكل
// إطار (بطيء جدًا على جوال + شبكة CDN). 3 نسخ متكاملة (رمادي خام، تباين
// معزّز، وعتبة تحويل ثنائي عند 130 كنقطة وسط) تغطي نفس الحالات العملية —
// إضاءة عادية / ضعيفة / انعكاس — بدون تكرار زائد لا يضيف تصويتًا حقيقيًا.
const PREP_VARIANTS: PrepKind[] = ['gray', 'contrast', 'thresh130'];

// ── Normalization / validation (digits-only cards) ──────────────

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EN_DIGITS = '0123456789';

/** استبدال أخطاء OCR الشائعة ثم الإبقاء على الأرقام فقط */
export function normalizeCardDigits(raw: string): string {
  let s = raw
    .replace(/[٠-٩]/g, (d) => EN_DIGITS[AR_DIGITS.indexOf(d)] ?? d)
    .replace(/[OoD]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/[Zz]/g, '2')
    .replace(/[Gg]/g, '6')
    .replace(/[Qq]/g, '0');
  return s.replace(/[^\d]/g, '');
}

export function isValidCardUsername(digits: string): boolean {
  return digits.length >= CARD_USER_LEN.min && digits.length <= CARD_USER_LEN.max;
}

export function isValidCardPassword(digits: string): boolean {
  return digits.length >= CARD_PASS_LEN.min && digits.length <= CARD_PASS_LEN.max;
}

/**
 * استخراج الحقلين من نص متعدد الأسطر بالاعتماد على ترتيب الظهور فقط (لا
 * الطول) — اسم المستخدم دائمًا أول run صالح، كلمة السر أول run صالح مختلف
 * يظهر بعده. مشتركة بين مسار الدليل الحي (كاحتياطي) ومسار القص اليدوي
 * (كمصدر أساسي وحيد، دون أي قص نسبي إضافي).
 */
function extractOrderedDigitFields(
  text: string,
  seedUsername = '',
  seedPassword = '',
): { username: string; password: string } {
  const runs = (text.match(/\d{4,}/g) ?? []).map(normalizeCardDigits).filter(Boolean);
  let username = seedUsername;
  let password = seedPassword;
  if (!username || !isValidCardUsername(username)) {
    const cand = runs.find((r) => isValidCardUsername(r));
    if (cand) username = cand;
  }
  if (!password || !isValidCardPassword(password)) {
    const usernameIdx = username ? runs.indexOf(username) : -1;
    const cand =
      runs.find((r, i) => r !== username && isValidCardPassword(r) && i > usernameIdx) ??
      runs.find((r) => r !== username && isValidCardPassword(r));
    if (cand) password = cand;
  }
  return { username, password };
}

function scoreDigitRun(digits: string, field: 'username' | 'password'): number {
  if (!digits) return 0;
  const ok =
    field === 'username' ? isValidCardUsername(digits) : isValidCardPassword(digits);
  let score = ok ? 50 + digits.length : digits.length;
  // تفضيل أطوال شائعة
  if (field === 'username' && digits.length >= 10 && digits.length <= 13) score += 20;
  if (field === 'password' && digits.length >= 5 && digits.length <= 8) score += 20;
  return score;
}

function bestDigitCandidate(text: string, field: 'username' | 'password'): string {
  const normalized = normalizeCardDigits(text);
  if (!normalized) return '';
  // إن كان النص كله رقمًا واحدًا
  if (scoreDigitRun(normalized, field) > 0) {
    // قد تلصق حقول — حاول تقطيع لأفضل run
    const runs = text.match(/\d{4,}/g)?.map(normalizeCardDigits) ?? [normalized];
    let best = '';
    let bestScore = -1;
    for (const r of runs) {
      const sc = scoreDigitRun(r, field);
      if (sc > bestScore) {
        bestScore = sc;
        best = r;
      }
    }
    // أيضًا جرب السلسلة كاملة إن كانت ضمن المدى
    const fullSc = scoreDigitRun(normalized, field);
    if (fullSc >= bestScore) return normalized.length <= (field === 'username' ? CARD_USER_LEN.max : CARD_PASS_LEN.max)
      ? normalized
      : best || normalized.slice(0, field === 'username' ? CARD_USER_LEN.max : CARD_PASS_LEN.max);
    return best;
  }
  return normalized;
}

// ── Single-field OCR with multi-prep voting ─────────────────────

async function ocrDigitsOnCanvas(
  canvas: HTMLCanvasElement,
  field: 'username' | 'password',
  poolIndex = 0,
): Promise<{ digits: string; votes: number }> {
  const worker = await getWorker(poolIndex);
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789',
    tessedit_pageseg_mode: '7', // single text line
  });

  const scaled = upscaleCanvas(canvas, canvas.width < 400 ? 3 : 2);
  const tallies = new Map<string, number>();

  for (const kind of PREP_VARIANTS) {
    const prepped = preprocess(scaled, kind);
    try {
      const { data } = await withTimeout(
        worker.recognize(prepped),
        RECOGNIZE_TIMEOUT_MS,
        'OCR',
      );
      const digits = bestDigitCandidate(data.text || '', field);
      if (!digits) continue;
      tallies.set(digits, (tallies.get(digits) ?? 0) + 1 + (scoreDigitRun(digits, field) > 40 ? 1 : 0));
    } catch {
      /* try next prep */
    }
  }

  let best = '';
  let bestVotes = 0;
  for (const [d, v] of tallies) {
    if (v > bestVotes || (v === bestVotes && d.length > best.length)) {
      best = d;
      bestVotes = v;
    }
  }
  return { digits: best, votes: bestVotes };
}

// ── Public API ──────────────────────────────────────────────────

export interface CardOcrFields {
  username: string;
  password: string;
  /** ثقة نسبية 0–1 من تصويت الـ prep */
  confidence: number;
  verified: boolean;
  raw: string;
}

/**
 * مسار كامل لصورة مقصوصة (دليل الكاميرا): ROI + upscale + multi-prep + digits.
 */
export async function ocrCardFieldsFromGuide(
  guideCanvas: HTMLCanvasElement,
): Promise<CardOcrFields> {
  const userRoi = cropFieldRoi(guideCanvas, 'username');
  const passRoi = cropFieldRoi(guideCanvas, 'password');

  // اسم المستخدم على العامل 0 وكلمة السر على العامل 1 — بالتوازي الفعلي،
  // لا بالتتابع على نفس العامل كما كان (Promise.all على عامل واحد لا يشغّل
  // الطلبين معًا، هو ينتظر الأول وينفّذ الثاني بعده رغم شكل التوازي بالكود).
  const [userRes, passRes] = await Promise.all([
    ocrDigitsOnCanvas(userRoi, 'username', 0),
    ocrDigitsOnCanvas(passRoi, 'password', 1),
  ]);

  let username = userRes.digits;
  let password = passRes.digits;

  // كشف فعلي حقيقي (بطاقتان حقيقيتان): كلمة السر رجعت "88886" ثم "988880"
  // بدل "168135" الصحيحة — بطول صالح كل مرة (4-10 رقمًا)، فمرّت من فحص
  // "طول صالح" رغم كونها غلطًا تمامًا. طول صالح لا يعني قراءة صحيحة. لذلك
  // الشرط الآن لا يكتفي بـ"غير صالح الطول"، بل يشمل أيضًا "تصويت ضعيف" (أقل
  // من موافقة نسختين معالجة من أصل 3 على نفس القيمة) — نفس عتبة الثقة
  // المستخدمة أصلًا لعلم verified، لكن الآن تُستخدم أيضًا لتفعيل محاولة
  // تصحيح بديلة بدل قبول قيمة "طول معقول" بلا أي سند حقيقي.
  const needFullFallback =
    !username || !password ||
    !isValidCardUsername(username) || !isValidCardPassword(password) ||
    userRes.votes < 2 || passRes.votes < 2;

  let fullText = '';
  if (needFullFallback) {
    try {
      const fullScaled = upscaleCanvas(guideCanvas, guideCanvas.width < 500 ? 2.5 : 2);
      const worker = await getWorker(0);
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: '6',
      });
      const gray = preprocess(fullScaled, 'contrast');
      const { data } = await withTimeout(worker.recognize(gray), RECOGNIZE_TIMEOUT_MS, 'OCR');
      fullText = data.text || '';
    } catch {
      fullText = '';
    }
  }

  // احتياطي من النص الكامل — يُستخدم كلما كانت قراءة الـROI فاضية، غير صالحة
  // الطول، *أو ضعيفة التصويت* (أعلاه). دليل فعلي على بطاقات حقيقية أثبت أن
  // ROI كلمة السر ممكن يرجع رقمًا مختلفًا تمامًا وليس فقط رقم اسم المستخدم
  // بالذات — فحص "طول صالح فقط" كان يمنع هذا الاحتياطي من التفعيل بالضبط
  // بالحالة الأكثر ضررًا (قيمة غلط بثقة شكلية، مش قيمة فاضية أو فاسدة الطول).
  //
  // لا نفرز الاحتمالات حسب الطول (اسم المستخدم يسبق كلمة السر بترتيب
  // الظهور فقط، مش بالطول — انظر extractOrderedDigitFields).
  if (needFullFallback && fullText) {
    const extracted = extractOrderedDigitFields(
      fullText,
      isValidCardUsername(username) && userRes.votes >= 2 ? username : '',
      isValidCardPassword(password) && passRes.votes >= 2 ? password : '',
    );
    username = extracted.username;
    password = extracted.password;
  }

  // لا تخلط: إن تساويا خذ من ROI فقط
  if (username && password && username === password) {
    password = passRes.digits !== username ? passRes.digits : '';
  }

  const userOk = isValidCardUsername(username);
  const passOk = isValidCardPassword(password);
  const votes = userRes.votes + passRes.votes;
  const confidence = Math.min(1, (votes / 12) * 0.6 + (userOk ? 0.2 : 0) + (passOk ? 0.2 : 0));
  const verified = userOk && passOk && userRes.votes >= 2 && passRes.votes >= 2;

  return {
    username,
    password,
    confidence,
    verified,
    raw: [username, password].filter(Boolean).join('\n') || fullText,
  };
}

/**
 * مسار مخصّص للقص اليدوي (رفع صورة من المعرض + المستخدم يحدد صندوق القص
 * بنفسه) — خطأ بنيوي فعلي مؤكَّد بتجربة حقيقية: كان هذا المسار يمرّر
 * القصّة اليدوية كاملة كـ"guideCanvas" لـocrCardFieldsFromGuide، التي بدورها
 * تعيد قصّها *مرة ثانية* بنسب ثابتة مبنية على تخطيط بطاقة كاملة (شعار 0-38%،
 * مستخدم 40-72%، سر 70-100%). هذا صحيح فقط لو كانت الصورة الممرَّرة صورة
 * للبطاقة كاملة — لكن قصّة المستخدم اليدوية مستطيل تعسفي (المستخدم يحدد
 * حدوده بنفسه، وغالبًا يضيّقه حول النص مباشرة لا حول البطاقة كاملة)، فإعادة
 * قصّه بنسب ثابتة إضافية كانت تقتطع من منتصف الأرقام الفعلية أو تلتقط سطرًا
 * غلط بالكامل. دليل: بطاقة حقيقية بقيمتين معروفتين (445282914562 / 168135)
 * أعطت "—" لاسم المستخدم و"988880" لكلمة السر بهذا المسار.
 *
 * الحل: لا نعيد قص القصّة اليدوية إطلاقًا. نُشغّل OCR على القصّة كما هي
 * (نص كامل، كل الأسطر)، ونستخرج الحقلين بترتيب الظهور فقط (نفس آلية
 * extractOrderedDigitFields المستخدمة كاحتياطي بالمسار الآخر) — هون هي
 * المصدر الأساسي الوحيد، لا احتياطي ثانوي.
 */
export async function ocrCardFieldsFromTightCrop(
  cropCanvas: HTMLCanvasElement,
): Promise<CardOcrFields> {
  const scaled = upscaleCanvas(cropCanvas, cropCanvas.width < 500 ? 3 : 2);
  const preps: PrepKind[] = ['contrast', 'thresh130', 'gray'];

  // نسخ معالجة متعددة بالتوازي على مسبح العاملين — كل نسخة تُستخرج منها
  // الحقلان بترتيب الظهور، وبعدها تصويت بسيط بين النتائج.
  const results = await Promise.all(
    preps.map(async (kind, i) => {
      try {
        const worker = await getWorker(i);
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789',
          tessedit_pageseg_mode: '6', // كتلة نص متعددة الأسطر
        });
        const prepped = preprocess(scaled, kind);
        const { data } = await withTimeout(worker.recognize(prepped), RECOGNIZE_TIMEOUT_MS, 'OCR');
        return extractOrderedDigitFields(data.text || '');
      } catch {
        return { username: '', password: '' };
      }
    }),
  );

  const tally = (key: 'username' | 'password') => {
    const m = new Map<string, number>();
    for (const r of results) {
      const v = r[key];
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    let best = '';
    let votes = 0;
    for (const [v, c] of m) {
      if (c > votes) {
        best = v;
        votes = c;
      }
    }
    return { value: best, votes };
  };

  const u = tally('username');
  const p = tally('password');
  let username = u.value;
  let password = p.value;
  if (username && password && username === password) {
    password = '';
  }

  const userOk = isValidCardUsername(username);
  const passOk = isValidCardPassword(password);
  const confidence = Math.min(
    1,
    (u.votes / preps.length) * 0.5 + (p.votes / preps.length) * 0.5 +
      (userOk ? 0.15 : 0) + (passOk ? 0.15 : 0),
  );
  const verified = userOk && passOk && u.votes >= 2 && p.votes >= 2;

  return {
    username,
    password,
    confidence,
    verified,
    raw: [username, password].filter(Boolean).join('\n') || results.map((r) => `${r.username} ${r.password}`).join('\n'),
  };
}

/** توافق عدة قراءات (إطارات) — الأغلبية تفوز */
export function consensusCardFields(
  samples: Array<{ username: string; password: string }>,
): { username: string; password: string; verified: boolean; agreement: number } {
  const count = (key: 'username' | 'password') => {
    const m = new Map<string, number>();
    for (const s of samples) {
      const v = s[key];
      if (!v) continue;
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    let best = '';
    let n = 0;
    for (const [v, c] of m) {
      if (c > n) {
        best = v;
        n = c;
      }
    }
    return { value: best, n };
  };
  const u = count('username');
  const p = count('password');
  const need = Math.max(2, Math.ceil(samples.length * 0.5));
  const verified = u.n >= need && p.n >= need && isValidCardUsername(u.value) && isValidCardPassword(p.value);
  return {
    username: u.value,
    password: p.value,
    verified,
    agreement: samples.length ? (u.n + p.n) / (2 * samples.length) : 0,
  };
}

/**
 * التقاط عدة إطارات من دالة capture ثم توافق.
 * capture يجب أن ترجع canvas مقصوص على الدليل أو null.
 */
export async function ocrCardMultiFrame(
  capture: () => HTMLCanvasElement | null,
  frames = 3,
  delayMs = 120,
): Promise<CardOcrFields> {
  const samples: Array<{ username: string; password: string }> = [];
  let lastRaw = '';

  for (let i = 0; i < frames; i++) {
    const canvas = capture();
    if (canvas) {
      try {
        const r = await ocrCardFieldsFromGuide(canvas);
        if (r.username || r.password) {
          samples.push({ username: r.username, password: r.password });
          lastRaw = r.raw;
        }
      } catch {
        /* frame failed */
      }
    }
    // خروج مبكر: إن اتفق آخر إطارين تمامًا على حقلين صالحين، النتيجة مؤكدة
    // عمليًا ولا داعي لاستهلاك وقت/بطارية بإطارات إضافية لا تغيّر شيئًا —
    // هذا أكبر مصدر بطء بالتجربة الفعلية (كان يمر دائمًا على كل الإطارات
    // الخمسة حتى لو الإطار الأول والثاني متطابقين ومؤكدين).
    if (samples.length >= 2) {
      const a = samples[samples.length - 1]!;
      const b = samples[samples.length - 2]!;
      if (
        a.username === b.username &&
        a.password === b.password &&
        isValidCardUsername(a.username) &&
        isValidCardPassword(a.password)
      ) {
        break;
      }
    }
    if (i < frames - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  if (samples.length === 0) {
    return { username: '', password: '', confidence: 0, verified: false, raw: '' };
  }

  const c = consensusCardFields(samples);
  return {
    username: c.username,
    password: c.password,
    confidence: c.agreement,
    verified: c.verified,
    raw: lastRaw || `${c.username}\n${c.password}`,
  };
}


// ── Payment: name + Palestinian mobile (059/056 + 7) ────────────

export function normalizePayPhone(raw: string): string {
  let n = normalizeCardDigits(raw); // reuse digit normalize
  // إن بدأ بـ 5 وطول 9 → أضف 0
  if (/^5[69]\d{7}$/.test(n)) n = '0' + n;
  return n;
}

export function isValidPayPhone(value: string): boolean {
  return /^(059|056)\d{7}$/.test(value);
}

export function normalizePayName(raw: string): string {
  return raw
    .replace(/[\u064B-\u065F\u0670]/g, '') // تشكيل
    .replace(/[^\p{L}\p{N}\s.'\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function scorePayNameQuality(name: string): number {
  if (!name) return 0;
  const letters = (name.match(/\p{L}/gu) ?? []).length;
  if (letters < 2) return 0;
  const words = name.split(/\s+/).filter((w) => w.length >= 2);
  let s = Math.min(40, letters * 2) + Math.min(30, words.length * 12);
  if (name.length >= 4 && name.length <= 48) s += 15;
  if (/\d{4,}/.test(name)) s -= 25; // أرقام طويلة = ليس اسمًا
  return Math.max(0, Math.min(100, s));
}

/** ROI للدفع: الاسم أعلى، الرقم أسفل */
export function cropPayFieldRoi(
  src: HTMLCanvasElement,
  field: 'name' | 'phone',
): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const x = Math.round(w * 0.08);
  const cropW = Math.round(w * 0.84);
  let y: number;
  let cropH: number;
  if (field === 'name') {
    y = Math.round(h * 0.12);
    cropH = Math.round(h * 0.38);
  } else {
    y = Math.round(h * 0.48);
    cropH = Math.round(h * 0.38);
  }
  const c = document.createElement('canvas');
  c.width = Math.max(1, cropW);
  c.height = Math.max(1, cropH);
  const ctx = c.getContext('2d');
  if (!ctx) return src;
  ctx.drawImage(src, x, y, cropW, cropH, 0, 0, c.width, c.height);
  return c;
}

async function ocrPayPhoneOnCanvas(canvas: HTMLCanvasElement, poolIndex = 1): Promise<{ phone: string; votes: number }> {
  const worker = await getWorker(poolIndex);
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789',
    tessedit_pageseg_mode: '7',
  });
  const scaled = upscaleCanvas(canvas, canvas.width < 350 ? 3 : 2.5);
  const tallies = new Map<string, number>();

  for (const kind of PREP_VARIANTS) {
    const prepped = preprocess(scaled, kind);
    try {
      const { data } = await withTimeout(worker.recognize(prepped), RECOGNIZE_TIMEOUT_MS, 'OCR');
      const phone = normalizePayPhone(data.text || '');
      // ابحث عن أي مقطع 10 أرقام صالح داخل الناتج
      const candidates = new Set<string>();
      if (isValidPayPhone(phone)) candidates.add(phone);
      const loose = (data.text || '').replace(/\D/g, '');
      for (let i = 0; i + 10 <= loose.length; i++) {
        const slice = loose.slice(i, i + 10);
        const n = normalizePayPhone(slice);
        if (isValidPayPhone(n)) candidates.add(n);
      }
      // جرب بادئة ناقصة 0
      if (/^5[69]\d{7}$/.test(loose.slice(0, 9))) {
        const n = '0' + loose.slice(0, 9);
        if (isValidPayPhone(n)) candidates.add(n);
      }
      for (const c of candidates) {
        tallies.set(c, (tallies.get(c) ?? 0) + 2);
      }
      if (!candidates.size && phone.length >= 9) {
        tallies.set(phone, (tallies.get(phone) ?? 0) + 1);
      }
    } catch {
      /* next */
    }
  }

  let best = '';
  let bestVotes = 0;
  for (const [p, v] of tallies) {
    const boost = isValidPayPhone(p) ? 10 : 0;
    if (v + boost > bestVotes) {
      best = p;
      bestVotes = v + boost;
    }
  }
  return { phone: best, votes: bestVotes };
}

async function ocrPayNameOnCanvas(canvas: HTMLCanvasElement, poolIndex = 0): Promise<{ name: string; votes: number }> {
  const worker = await getWorker(poolIndex);
  // اسم: بدون whitelist — يحتاج عربي/لاتيني
  await worker.setParameters({
    tessedit_char_whitelist: '',
    tessedit_pageseg_mode: '7',
  });
  const scaled = upscaleCanvas(canvas, canvas.width < 400 ? 3 : 2);
  const tallies = new Map<string, number>();

  for (const kind of ['gray', 'contrast'] as PrepKind[]) {
    const prepped = preprocess(scaled, kind);
    try {
      const { data } = await withTimeout(worker.recognize(prepped), RECOGNIZE_TIMEOUT_MS, 'OCR');
      const name = normalizePayName(data.text || '');
      if (scorePayNameQuality(name) < 20) continue;
      tallies.set(name, (tallies.get(name) ?? 0) + 1 + (scorePayNameQuality(name) > 50 ? 1 : 0));
    } catch {
      /* next */
    }
  }

  let best = '';
  let bestVotes = 0;
  for (const [n, v] of tallies) {
    if (v > bestVotes || (v === bestVotes && scorePayNameQuality(n) > scorePayNameQuality(best))) {
      best = n;
      bestVotes = v;
    }
  }
  return { name: best, votes: bestVotes };
}

export interface PayOcrFields {
  name: string;
  phone: string;
  nameConfidence: number;
  phoneConfidence: number;
  verified: boolean;
  raw: string;
}

export async function ocrPayFieldsFromGuide(guideCanvas: HTMLCanvasElement): Promise<PayOcrFields> {
  const nameRoi = cropPayFieldRoi(guideCanvas, 'name');
  const phoneRoi = cropPayFieldRoi(guideCanvas, 'phone');

  const [nameRes, phoneRes] = await Promise.all([
    ocrPayNameOnCanvas(nameRoi),
    ocrPayPhoneOnCanvas(phoneRoi),
  ]);

  // احتياطي: رقم من الصورة كاملة إن فشلت ROI
  let phone = phoneRes.phone;
  if (!isValidPayPhone(phone)) {
    const full = upscaleCanvas(guideCanvas, 2);
    const fullPhone = await ocrPayPhoneOnCanvas(full);
    if (isValidPayPhone(fullPhone.phone)) phone = fullPhone.phone;
  }

  const name = nameRes.name;
  const phoneOk = isValidPayPhone(phone);
  const nameOk = scorePayNameQuality(name) >= 25;

  return {
    name,
    phone: phoneOk ? phone : phone, // أبقِ حتى لو غير صالح للعرض/التعديل
    nameConfidence: Math.min(1, nameRes.votes / 4 + (nameOk ? 0.3 : 0)),
    phoneConfidence: Math.min(1, phoneRes.votes / 8 + (phoneOk ? 0.4 : 0)),
    verified: phoneOk && nameOk && phoneRes.votes >= 2,
    raw: `${name}\n${phone}`.trim(),
  };
}

/**
 * نفس منطق ocrCardFieldsFromTightCrop لكن لبيانات الدفع (اسم + جوال) — القصّة
 * اليدوية لا تُعاد قصّها بنسب ثابتة (name 12-50%، phone 48-86%) لأن تلك النسب
 * صحيحة فقط لصورة إيصال/ورقة كاملة، لا لمستطيل تعسفي حدده المستخدم بنفسه.
 * OCR على القصّة كاملة، ثم فصل الاسم عن الرقم بالمحتوى (سطر رقمي = جوال، غير
 * رقمي = اسم) بدل الموضع النسبي.
 */
export async function ocrPayFieldsFromTightCrop(cropCanvas: HTMLCanvasElement): Promise<PayOcrFields> {
  const scaled = upscaleCanvas(cropCanvas, cropCanvas.width < 500 ? 3 : 2);
  const preps: PrepKind[] = ['contrast', 'thresh130', 'gray'];

  const results = await Promise.all(
    preps.map(async (kind, i) => {
      try {
        const worker = await getWorker(i);
        await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '6' });
        const prepped = preprocess(scaled, kind);
        const { data } = await withTimeout(worker.recognize(prepped), RECOGNIZE_TIMEOUT_MS, 'OCR');
        const text = data.text || '';
        const phone = extractPayPhoneFromText(text);
        const lines = text.split(/\r?\n/).map((l) => normalizePayName(l)).filter(Boolean);
        const name = lines.find((l) => scorePayNameQuality(l) >= 20) || '';
        return { name, phone };
      } catch {
        return { name: '', phone: '' };
      }
    }),
  );

  const tally = <K extends 'name' | 'phone'>(key: K) => {
    const m = new Map<string, number>();
    for (const r of results) {
      const v = r[key];
      if (v) m.set(v, (m.get(v) ?? 0) + 1);
    }
    let best = '';
    let votes = 0;
    for (const [v, c] of m) {
      if (c > votes) {
        best = v;
        votes = c;
      }
    }
    return { value: best, votes };
  };

  const n = tally('name');
  const p = tally('phone');
  const phoneOk = isValidPayPhone(p.value);
  const nameOk = scorePayNameQuality(n.value) >= 25;

  return {
    name: n.value,
    phone: p.value,
    nameConfidence: Math.min(1, n.votes / preps.length + (nameOk ? 0.3 : 0)),
    phoneConfidence: Math.min(1, p.votes / preps.length + (phoneOk ? 0.4 : 0)),
    verified: phoneOk && nameOk && p.votes >= 2,
    raw: `${n.value}\n${p.value}`.trim(),
  };
}

function extractPayPhoneFromText(text: string): string {
  const loose = normalizeCardDigits(text);
  for (let i = 0; i + 10 <= loose.length; i++) {
    const slice = loose.slice(i, i + 10);
    const n = normalizePayPhone(slice);
    if (isValidPayPhone(n)) return n;
  }
  if (/^5[69]\d{7}$/.test(loose.slice(0, 9))) {
    const n = '0' + loose.slice(0, 9);
    if (isValidPayPhone(n)) return n;
  }
  return '';
}

export function consensusPayFields(
  samples: Array<{ name: string; phone: string }>,
): { name: string; phone: string; verified: boolean; agreement: number } {
  const count = (key: 'name' | 'phone') => {
    const m = new Map<string, number>();
    for (const s of samples) {
      const v = s[key];
      if (!v) continue;
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    let best = '';
    let n = 0;
    for (const [v, c] of m) {
      if (c > n) {
        best = v;
        n = c;
      }
    }
    return { value: best, n };
  };
  const nm = count('name');
  const ph = count('phone');
  // فضّل هاتفًا صالحًا حتى لو أقل تكرارًا قليلًا
  const phoneTallies = new Map<string, number>();
  for (const s of samples) {
    if (s.phone) phoneTallies.set(s.phone, (phoneTallies.get(s.phone) ?? 0) + (isValidPayPhone(s.phone) ? 2 : 1));
  }
  let bestPhone = ph.value;
  let bestPn = 0;
  for (const [v, c] of phoneTallies) {
    if (c > bestPn) {
      bestPhone = v;
      bestPn = c;
    }
  }
  const need = Math.max(2, Math.ceil(samples.length * 0.45));
  const verified =
    isValidPayPhone(bestPhone) &&
    bestPn >= need &&
    scorePayNameQuality(nm.value) >= 25 &&
    nm.n >= Math.max(1, need - 1);

  return {
    name: nm.value,
    phone: bestPhone,
    verified,
    agreement: samples.length ? (nm.n + bestPn) / (2 * samples.length + samples.length) : 0,
  };
}

export async function ocrPayMultiFrame(
  capture: () => HTMLCanvasElement | null,
  frames = 3,
  delayMs = 110,
): Promise<PayOcrFields> {
  const samples: Array<{ name: string; phone: string }> = [];
  let last: PayOcrFields | null = null;

  for (let i = 0; i < frames; i++) {
    const canvas = capture();
    if (canvas) {
      try {
        const r = await ocrPayFieldsFromGuide(canvas);
        if (r.name || r.phone) {
          samples.push({ name: r.name, phone: r.phone });
          last = r;
        }
      } catch {
        /* frame fail */
      }
    }
    // نفس منطق الخروج المبكر لبطاقات النت: توافق إطارين متتاليين على رقم
    // هاتف صالح كافٍ، لا داعي لإطارات إضافية.
    if (samples.length >= 2) {
      const a = samples[samples.length - 1]!;
      const b = samples[samples.length - 2]!;
      if (a.phone === b.phone && a.name === b.name && isValidPayPhone(a.phone)) break;
    }
    if (i < frames - 1) await new Promise((r) => setTimeout(r, delayMs));
  }

  if (!samples.length) {
    return { name: '', phone: '', nameConfidence: 0, phoneConfidence: 0, verified: false, raw: '' };
  }

  const c = consensusPayFields(samples);
  return {
    name: c.name,
    phone: c.phone,
    nameConfidence: last?.nameConfidence ?? c.agreement,
    phoneConfidence: isValidPayPhone(c.phone) ? Math.max(0.7, c.agreement) : c.agreement * 0.5,
    verified: c.verified,
    raw: `${c.name}\n${c.phone}`.trim(),
  };
}


// ── Legacy API (pay mode + generic text) ────────────────────────

export interface OcrTextOptions {
  lang?: string;
  whitelist?: string | null;
  scale?: number;
}

export async function ocrCardText(
  canvas: HTMLCanvasElement,
  options: OcrTextOptions = {},
): Promise<string> {
  const worker = await getWorker();
  const scale = options.scale ?? 2;
  const scaled = upscaleCanvas(canvas, scale);
  const prepped = preprocess(scaled, 'contrast');

  const whitelist =
    options.whitelist === null
      ? undefined
      : options.whitelist ?? '0123456789';

  if (whitelist) {
    await worker.setParameters({
      tessedit_char_whitelist: whitelist,
      tessedit_pageseg_mode: '6',
    });
  } else {
    await worker.setParameters({
      tessedit_char_whitelist: '',
      tessedit_pageseg_mode: '6',
    });
  }

  const { data } = await withTimeout(worker.recognize(prepped), RECOGNIZE_TIMEOUT_MS, 'OCR');
  return (data.text || '').trim();
}

export interface OcrCheckedResult {
  text: string;
  verified: boolean;
  alt?: string;
}

/** توافق مقياسَين — للوضع العام / الدفع */
export async function ocrCardTextChecked(
  canvas: HTMLCanvasElement,
  options: OcrTextOptions = {},
): Promise<OcrCheckedResult> {
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
  const textA = await ocrCardText(canvas, options);
  const textB = await ocrCardText(canvas, { ...options, scale: (options.scale ?? 2) + 1 });
  const a = normalize(textA);
  const b = normalize(textB);
  if (a && a === b) return { text: textA, verified: true };
  if (!a) return { text: textB, verified: false };
  if (!b) return { text: textA, verified: false };
  return { text: textA, verified: false, alt: textB };
}

export function looksLikeOcrCard(text: string): boolean {
  const digits = normalizeCardDigits(text);
  if (digits.length >= 8) return true;
  const runs = text.match(/[A-Za-z0-9]{4,}/g) ?? [];
  return runs.some((r) => /\d/.test(r));
}
