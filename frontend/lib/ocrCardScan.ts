// lib/ocrCardScan.ts (نسخة محسنة كاملة)

'use client';

/**
 * OCR لبطاقات النت الصغيرة (اسم مستخدم + كلمة سر — أرقام فقط في هذا المشروع).
 *
 * Pipeline:
 *   frame/guide crop → Deskew → Preprocess (CLAHE + Median + Sauvola/Otsu) → ROI ديناميكي
 *   → upscale 3× → Tesseract (digits only) → تطبيع → validation → توافق إطارات
 *
 * تحسينات الدقة المضافة:
 *   - Sauvola Adaptive أقوى (Integral Image, نافذة 25, k=0.34)
 *   - Otsu Binarization كخيار معالجة إضافي
 *   - Multi-Frame Voting موزون بالتكرار
 *   - estimateImageQuality لرفض اللقطات السيئة مبكراً
 *   - قراءة الأسماء (Pay): معالجات أقوى + تطبيع عربي محسّن + تقييم جودة أدق
 *   - تسريع: PREP_VARIANTS_FAST (3 فقط) + early exit + upscale أخف + timeout 12s
 *
 * يعمل محليًا عبر public/tesseract + public/tessdata إن توفّرت، وإلا CDN.
 */

// ====== الأنواع والثوابت ======
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
const RECOGNIZE_TIMEOUT_MS = 12000; // FIX OCR-SPEED-01: كان 25s — فشل أسرع أفضل من انتظار طويل
const WORKER_INIT_TIMEOUT_MS = 20000;

// المسارات المحلية والـ CDN
const LOCAL_WORKER_PATH = '/tesseract/worker.min.js';
const LOCAL_CORE_PATH = '/tesseract/tesseract-core-simd-lstm.wasm.js';
const LOCAL_LANG_PATH = '/tessdata';
const CDN_WORKER_PATH = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js';
const CDN_CORE_PATH =
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd-lstm.wasm.js';
const CDN_LANG_PATH = 'https://tessdata.projectnaptha.com/4.0.0_best';

let resolvedPathsPromise: Promise<{ workerPath: string; corePath: string; langPath: string }> | null = null;

// دالة urlExists
// AUDIT-FIX (OCR-OFFLINE-01): كانت تستخدم fetch(url, {method:'HEAD'}) للتحقق
// من وجود الملف محليًا. مشكلة: Cache API's match() لا يطابق طلبات HEAD مع
// استجابات GET المخزّنة إلا بخيار {ignoreMethod:true} — وService Worker هنا
// (sw.js) لا يستخدمه. النتيجة الفعلية بدون إنترنت: طلب HEAD يصل لـ SW، لا
// يجد تطابقًا (لأن المخزّن GET)، فشل الشبكة (بدون نت)، فيرجع
// Response.error() → urlExists() ترجع false حتى لو الملف موجود فعليًا في
// الكاش. عكس الهدف تمامًا (OCR بدون نت).
//
// الإصلاح: نفحص Cache Storage مباشرة أولًا (caches.match يطابق GET بشكل
// طبيعي عند تمرير string، بدون أي طلب شبكة أو انتظار). إن لم نجد شيئًا
// (مثلاً بيئة بدون SW مسجَّل بعد) نرجع لطلب شبكة GET عادي كخط دفاع ثانٍ —
// وليس HEAD، لتفادي نفس المشكلة إن أضيف ignoreMethod لاحقًا بشكل جزئي.
async function urlExists(url: string, timeoutMs = 2500): Promise<boolean> {
  if (typeof caches !== 'undefined') {
    try {
      const cached = await caches.match(url);
      if (cached) return true;
    } catch {
      // بيئة بدون Cache Storage (نادر) — نكمل لفحص الشبكة أدناه.
    }
  }

  if (typeof fetch === 'undefined') return false;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

// دالة resolveTesseractPaths
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
  const rp = resolvedPathsPromise;
  // UNHANDLED-CATCH-FIX: mirror getWorker's self-healing pattern —
  // register a rejection handler so the cached promise clears itself
  // and a later call can retry after a transient network failure.
  rp.catch(() => {
    if (resolvedPathsPromise === rp) resolvedPathsPromise = null;
  });
  return rp;
}

// FIX LEN-BOUND-01: كانت هناك حدود طول ثابتة (8-16 لاسم المستخدم، 4-10
// لكلمة السر) تفترض تنسيق مزوّد واحد بعينه. تحقّقنا من بطاقة حقيقية من
// مزوّد آخر بكود من 6 خانات فقط — كانت سترفض كقراءة صحيحة رغم صحتها 100%.
// طلب صريح: لا حد أدنى ولا حد أعلى، لوجود عدة بطاقات بأطوال مختلفة فعليًا.
// البديل: الاعتماد فقط على الترتيب الفيزيائي على البطاقة (اسم المستخدم
// دائمًا يسبق كلمة السر) بدل تصنيف حسب الطول — هذا المبدأ كان أصلًا موثّقًا
// كأساس في smartParseCard (انظر "لا نفرز حسب الطول" هناك).

// دالة withTimeout
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`انتهت مهلة ${label} (${ms / 1000} ث)`)),
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

// دالة loadTesseract
let loadPromise: Promise<TesseractModule> | null = null;

function loadTesseract(): Promise<TesseractModule> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OCR غير متاح على الخادم'));
  }
  const w = window as unknown as { Tesseract?: TesseractModule };
  if (w.Tesseract) return Promise.resolve(w.Tesseract);
  if (loadPromise) return loadPromise;

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
  const lp = loadPromise;
  // UNHANDLED-CATCH-FIX: same self-healing pattern as getWorker above.
  // Without this a single transient CDN/chunk failure would pin
  // loadPromise as a rejected promise forever — every later OCR attempt
  // would reject from cache without ever retrying.
  lp.catch(() => {
    if (loadPromise === lp) loadPromise = null;
  });
  return lp;
}

// مسبح العمال
const WORKER_POOL_SIZE = 2;
const workerPromises: Array<Promise<TesseractWorker> | null> = new Array(WORKER_POOL_SIZE).fill(null);

async function getWorker(poolIndex = 0): Promise<TesseractWorker> {
  const idx = poolIndex % WORKER_POOL_SIZE;
  const existing = workerPromises[idx];
  if (existing) return existing;
  const created = (async () => {
    const Tess = await loadTesseract();
    const opts: Record<string, unknown> = await resolveTesseractPaths();
    let worker: TesseractWorker;
    try {
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
  created.catch(() => {
    if (workerPromises[idx] === created) workerPromises[idx] = null;
  });
  return created;
}

// ====== أدوات الصور الأساسية ======

function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d');
  if (ctx) ctx.drawImage(src, 0, 0);
  return c;
}


/**
 * تقييم سريع لجودة الصورة قبل تشغيل OCR (0..1).
 * يستخدم لتوفير الوقت ورفض اللقطات السيئة جداً.
 */
export function estimateImageQuality(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  const sw = Math.min(canvas.width, 160);
  const sh = Math.min(canvas.height, 120);
  const sample = ctx.getImageData(0, 0, sw, sh);
  const d = sample.data;
  const n = sw * sh;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
    sum += g;
    sumSq += g * g;
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  const std = Math.sqrt(Math.max(0, variance));
  const contrastScore = Math.min(1, std / 55);
  const brightnessScore = mean > 40 && mean < 210 ? 1 : 0.4;
  return contrastScore * 0.7 + brightnessScore * 0.3;
}

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

function downscaleCanvas(src: HTMLCanvasElement, maxDim: number): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(src.width, src.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(src.width * scale));
  c.height = Math.max(1, Math.round(src.height * scale));
  const ctx = c.getContext('2d');
  if (!ctx) return src;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** يدور اللقطة بمضاعفات 90° بالضبط (0/1/2/3 = 0°/90°/180°/270° مع عقارب الساعة) دون فقد دقة كما يحصل مع deskewCanvas عند زوايا كسرية كبيرة. */
function rotateCanvasQuarter(src: HTMLCanvasElement, quarterTurns: 0 | 1 | 2 | 3): HTMLCanvasElement {
  if (quarterTurns === 0) return src;
  const swap = quarterTurns % 2 === 1;
  const c = document.createElement('canvas');
  c.width = swap ? src.height : src.width;
  c.height = swap ? src.width : src.height;
  const ctx = c.getContext('2d');
  if (!ctx) return src;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((quarterTurns * 90 * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

// FIX ORIENT-01: اكتُشفت على بطاقة حقيقية (بطاقة واي فاي مصوَّرة بزاوية ~90°
// عن الوضع الأفقي المتوقَّع) — لا deskewCanvas (يتجاهل عمدًا أي ميل قريب من
// مضاعفات 90°، فهو مصمَّم لتصحيح ميل طفيف فقط، سطر 5-260 أدناه) ولا أي جزء
// آخر من الأنبوب يصحّح دورانًا بمقدار ربع/نصف لفة. النتيجة: كل الكشف
// اللاحق (أشرطة الأسطر، قصّ ROI) يعمل على محور خاطئ تمامًا ويفشل حتمًا مهما
// كانت جودة تلك الخطوات — تحقّقنا رقميًا: قوة "أفقية النص" (نفس مقياس
// findRowBand) كانت ~1.47M عند تدوير 90° مقابل ~0.78M بلا تدوير على نفس
// البطاقة، أي الوضع الأصلي كان يقرأ البطاقة على المحور الخاطئ بفارق يقارب
// الضعف. لا يمكن حسم الاتجاه (90° أم 270°) من هذا المقياس وحده (كلاهما
// "أفقي" بنفس الدرجة، الفرق بينهما فوق/تحت لا يقاس بحواف الصف)، فنُرجع
// كلا الاحتمالين ليجرّب المستدعي المسار الكامل على كل منهما ويختار الأفضل
// نتيجة (نفس فلسفة FIX OCR-VERIFY-01: تفضيل نتيجة تحقّق فعلي بدل تخمين).
function detectQuarterRotationCandidates(src: HTMLCanvasElement): Array<0 | 1 | 2 | 3> {
  try {
    const small0 = downscaleCanvas(src, 220);
    const bands0 = computeTextLineBands(small0);
    const score0 = bands0?.band1.score ?? 0;

    const small90 = downscaleCanvas(rotateCanvasQuarter(src, 1), 220);
    const bands90 = computeTextLineBands(small90);
    const score90 = bands90?.band1.score ?? 0;

    if (score90 > score0 * 1.3) return [1, 3];
    if (score0 > score90 * 1.3) return [0];
    // فرق غير حاسم — البطاقة قد تكون بزاوية وسطية غير مدعومة أصلًا؛ جرّب
    // الوضع الأصلي أولًا (الأرخص) ثم بديلي الدوران احتياطًا.
    return [0, 1, 3];
  } catch {
    return [0];
  }
}

// ====== أدوات جديدة للتحسين ======

/**
 * تصحيح الميل باستخدام تحويل هف الخطي.
 */
function deskewCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = src.getContext('2d');
  if (!ctx) return src;
  const w = src.width;
  const h = src.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!);
  }

  const edge = new Uint8ClampedArray(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx = -gray[y * w + x - 1]! + gray[y * w + x + 1]!;
      const gy = -gray[(y - 1) * w + x]! + gray[(y + 1) * w + x]!;
      edge[y * w + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
    }
  }

  const angleVotes: Record<number, number> = {};
  for (let y = 10; y < h - 10; y += 5) {
    for (let x = 10; x < w - 10; x += 5) {
      if (edge[y * w + x]! > 50) {
        const gx = -gray[y * w + x - 1]! + gray[y * w + x + 1]!;
        const gy = -gray[(y - 1) * w + x]! + gray[(y + 1) * w + x]!;
        const angle = Math.atan2(gy, gx) * 180 / Math.PI;
        const rounded = Math.round(angle / 5) * 5;
        angleVotes[rounded] = (angleVotes[rounded] || 0) + 1;
      }
    }
  }

  let bestAngle = 0;
  let maxVotes = 0;
  let totalVotes = 0;
  for (const angle in angleVotes) {
    const a = parseInt(angle, 10); // PARSEINT-RADIX-01
    totalVotes += angleVotes[a] ?? 0;
    const deviation = Math.abs(a) % 90;
    if (deviation > 5 && deviation < 85) {
      if ((angleVotes[a] ?? 0) > maxVotes) {
        maxVotes = angleVotes[a] ?? 0;
        bestAngle = a;
      }
    }
  }

  // حارس الحد الأدنى من الأدلة: على صورة ضبابية/قليلة التباين، عدد نقاط
  // الحواف المؤهلة (>50) قد يكون ضئيلًا جدًا (عشرات فقط بدل مئات/آلاف) —
  // عندها حتى "الفئة الفائزة" ليست إشارة ميل حقيقية بل ضجيج عشوائي، وتطبيق
  // دوران بناءً عليها يُفسد بطاقة مصطفة أصلًا بشكل صحيح. تحقّقنا فعليًا على
  // صورة حقيقية: 4 أصوات من أصل 30 نقطة مؤهلة فقط أنتجت دورانًا زائفًا
  // بمقدار -20°، بينما صورة اصطناعية بنص حقيقي مائل أنتجت 80 صوتًا من أصل
  // 611 — أي أن الفارق الحاسم هو العدد المطلق للأدلة، وليس فقط نسبتها
  // (النسبتان كانتا متقاربتين ~13% في الحالتين).
  const MIN_TOTAL_EDGE_VOTES = 150;
  const MIN_WINNING_VOTES = 20;
  if (totalVotes < MIN_TOTAL_EDGE_VOTES || maxVotes < MIN_WINNING_VOTES) return src;

  if (bestAngle === 0) return src;

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d');
  if (!octx) return src;
  octx.translate(w / 2, h / 2);
  octx.rotate(bestAngle * Math.PI / 180);
  octx.drawImage(src, -w / 2, -h / 2);
  return out;
}

/**
 * معالجة مسبقة محسّنة لمقاومة الضجيج والانعكاسات والبطاقة الممسوكة باليد.
 * - تنعيم متوسط 3×3 (يقلل ضجيج المستشعر)
 * - CLAHE تقريبي (contrast) أو عتبة تكيفية Sauvola-like (adaptive)
 * - توضيح خفيف (sharp) لاستعادة حواف الأرقام بعد التنعيم
 * - عتبات ثابتة كخيارات احتياطية
 *
 * FIX DESKEW-DUP-01: لا تستدعي deskew داخليًا — المصدر يُدسكو مرة واحدة قبل الاستدعاء.
 */
function preprocessAdvanced(src: HTMLCanvasElement, kind: PrepKind): HTMLCanvasElement {
  const c = cloneCanvas(src);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const w = c.width;
  const h = c.height;
  const n = w * h;

  const gray = new Uint8ClampedArray(n);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!);
  }

  // تنعيم متوسط 3×3 — يزيل ضجيجًا عالي التردد دون طمس كبير للأرقام
  const filtered = new Uint8ClampedArray(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
            sum += gray[ny * w + nx]!;
            count++;
          }
        }
      }
      filtered[y * w + x] = Math.round(sum / count);
    }
  }

  const out = new Uint8ClampedArray(n);

  if (kind === 'contrast') {
    // CLAHE تقريبي على كتل 48×48 — أفضل للإضاءة غير المتساوية من الكتل الكبيرة
    const blockSize = 48;
    for (let by = 0; by < h; by += blockSize) {
      for (let bx = 0; bx < w; bx += blockSize) {
        let minVal = 255;
        let maxVal = 0;
        const yEnd = Math.min(by + blockSize, h);
        const xEnd = Math.min(bx + blockSize, w);
        for (let y = by; y < yEnd; y++) {
          for (let x = bx; x < xEnd; x++) {
            const p = filtered[y * w + x]!;
            if (p < minVal) minVal = p;
            if (p > maxVal) maxVal = p;
          }
        }
        const range = maxVal - minVal;
        if (range > 15) {
          for (let y = by; y < yEnd; y++) {
            for (let x = bx; x < xEnd; x++) {
              const idx = y * w + x;
              out[idx] = Math.round(((filtered[idx]! - minVal) * 255) / range);
            }
          }
        } else {
          for (let y = by; y < yEnd; y++) {
            for (let x = bx; x < xEnd; x++) {
              out[y * w + x] = filtered[y * w + x]!;
            }
          }
        }
      }
    }
  } else if (kind === 'adaptive') {
    // Sauvola-like محسّن باستخدام Integral Image — أدق وأسرع على الإضاءة المتفاوتة
    // نافذة 25×25، k=0.34، R=128. أفضل للبطاقات الممسوكة باليد.
    const win = 25;
    const half = (win - 1) >> 1;
    const k = 0.34;
    const R = 128;

    const integral = new Float64Array(n);
    const integralSq = new Float64Array(n);
    for (let y = 0; y < h; y++) {
      let rowSum = 0;
      let rowSumSq = 0;
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const val = filtered[idx]!;
        rowSum += val;
        rowSumSq += val * val;
        const above = y > 0 ? integral[(y - 1) * w + x]! : 0;
        const aboveSq = y > 0 ? integralSq[(y - 1) * w + x]! : 0;
        integral[idx] = above + rowSum;
        integralSq[idx] = aboveSq + rowSumSq;
      }
    }

    const rectSum = (x1: number, y1: number, x2: number, y2: number, arr: Float64Array) => {
      x1 = Math.max(0, x1); y1 = Math.max(0, y1);
      x2 = Math.min(w - 1, x2); y2 = Math.min(h - 1, y2);
      const a = arr[y2 * w + x2]!;
      const b = y1 > 0 ? arr[(y1 - 1) * w + x2]! : 0;
      const c = x1 > 0 ? arr[y2 * w + (x1 - 1)]! : 0;
      const d = y1 > 0 && x1 > 0 ? arr[(y1 - 1) * w + (x1 - 1)]! : 0;
      return a - b - c + d;
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const x1 = x - half, y1 = y - half, x2 = x + half, y2 = y + half;
        const area =
          (Math.min(w - 1, x2) - Math.max(0, x1) + 1) *
          (Math.min(h - 1, y2) - Math.max(0, y1) + 1);
        const sum = rectSum(x1, y1, x2, y2, integral);
        const sumSq = rectSum(x1, y1, x2, y2, integralSq);
        const mean = sum / (area || 1);
        const variance = Math.max(0, sumSq / (area || 1) - mean * mean);
        const std = Math.sqrt(variance);
        const thresh = mean * (1 + k * (std / R - 1));
        out[y * w + x] = filtered[y * w + x]! >= thresh ? 255 : 0;
      }
    }
  } else if (kind === 'otsu') {
    // Otsu global threshold — ممتاز عندما يكون التباين بين النص والخلفية واضح
    const hist = new Array(256).fill(0) as number[];
    for (let i = 0; i < n; i++) hist[filtered[i]!]!++;
    let sumAll = 0;
    for (let i = 0; i < 256; i++) sumAll += i * hist[i]!;
    let sumB = 0;
    let wB = 0;
    let maxVar = 0;
    let threshold = 127;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]!;
      if (wB === 0) continue;
      const wF = n - wB;
      if (wF === 0) break;
      sumB += t * hist[t]!;
      const mB = sumB / wB;
      const mF = (sumAll - sumB) / wF;
      const varBetween = wB * wF * (mB - mF) * (mB - mF);
      if (varBetween > maxVar) {
        maxVar = varBetween;
        threshold = t;
      }
    }
    for (let i = 0; i < n; i++) {
      out[i] = filtered[i]! > threshold ? 255 : 0;
    }
  } else if (kind === 'sharp') {
    // توضيح خفيف (unsharp mask) بعد التنعيم — يستعيد حواف الأرقام المفقودة
    // بسبب الضبابية الناتجة عن الحركة أو البعد البؤري عند الإمساك باليد.
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const center = filtered[idx]!;
        // نواة laplace تقريبية
        const lap =
          -filtered[(y - 1) * w + x]! -
          filtered[y * w + (x - 1)]! +
          5 * center -
          filtered[y * w + (x + 1)]! -
          filtered[(y + 1) * w + x]!;
        // مزج: 70% أصل + 30% توضيح
        const v = Math.round(center * 0.55 + lap * 0.45);
        out[idx] = Math.max(0, Math.min(255, v));
      }
    }
    // حواف الصورة
    for (let x = 0; x < w; x++) {
      out[x] = filtered[x]!;
      out[(h - 1) * w + x] = filtered[(h - 1) * w + x]!;
    }
    for (let y = 0; y < h; y++) {
      out[y * w] = filtered[y * w]!;
      out[y * w + (w - 1)] = filtered[y * w + (w - 1)]!;
    }
  } else if (kind.startsWith('thresh')) {
    const t = kind === 'thresh100' ? 100 : kind === 'thresh130' ? 130 : 160;
    for (let i = 0; i < n; i++) {
      out[i] = filtered[i]! >= t ? 255 : 0;
    }
  } else {
    // gray
    out.set(filtered);
  }

  for (let i = 0; i < n; i++) {
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = out[i]!;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ====== نظام ROI ديناميكي ======

type RowBand = { startRow: number; endRow: number; score: number };

// FIX ROI-SPLIT-01: كانت الدالة تبحث عن *شريط نص واحد* فقط (أعلى نافذة 1-3
// صفوف من حيث edgeScore × coverageAvg)، ثم تقتصّ الحقلين (username/password
// أو name/phone) كنسبتين ثابتتين (أعلى 45% / أسفل 45%) من *نفس* الشريط.
// هذا الافتراض يفشل حين يكون السطر الثاني (كلمة السر) أقصر وأخف كثافة
// بكثير من الأول (اسم المستخدم) — تحقّقنا فعليًا على بطاقة حقيقية: اسم
// المستخدم "445282914562" (12 خانة تملأ عرض الحقل) مقابل كلمة السر "168135"
// (6 خانات فقط، تغطية أعمدة أقل بكثير). البحث كان يختار شريط اسم المستخدم
// في كلا الاستدعاءين (لأنه الأعلى تغطية عبر كل الصفوف)، فينتج القصّان
// (username split top-45% / password split bottom-55%) شريحتين من نفس سطر
// اسم المستخدم فقط — كلمة السر الحقيقية أسفل الصورة لم تُقتصّ إطلاقًا.
//
// الحل: البحث عن *شريطين* نصّيين مستقلّين غير متداخلين (لا شريط واحد
// يُقسَّم بنسبة ثابتة) — كل شريط يُقيَّم بمعزل عن الآخر، فلا يُقصي الشريط
// الأعرض/الأكثف الشريطَ الأضيق. يُرتَّبان حسب الموضع الرأسي: الأعلى = خانة
// الاسم/المستخدم، الأسفل = خانة كلمة السر/الهاتف. إن تعذّر إيجاد شريط ثانٍ
// موثوق (بطاقة بسطر واحد فعليًا)، نرجع لتقسيم الشريط الواحد كخيار احتياطي
// بدل إفشال القصّ بالكامل.
const roiBandCache = new WeakMap<HTMLCanvasElement, { band1: RowBand; band2: RowBand | null; rows: number; rowHeight: number } | null>();

function findRowBand(
  edgeSumPerRow: number[],
  coveragePerRow: number[],
  rows: number,
  exclude: RowBand | null,
): RowBand {
  let bestStartRow = 0, bestEndRow = 0, bestScore = -1;
  for (let i = 0; i < rows; i++) {
    for (let j = i; j < Math.min(i + 3, rows); j++) {
      if (exclude && i <= exclude.endRow + 1 && j >= exclude.startRow - 1) continue; // تجنّب التداخل مع هامش صف واحد
      let edgeScore = 0;
      let coverageAvg = 0;
      for (let k = i; k <= j; k++) {
        edgeScore += edgeSumPerRow[k]!;
        coverageAvg += coveragePerRow[k]!;
      }
      coverageAvg /= (j - i + 1);
      // ضرب الحواف بالتغطية يعاقب صفوفًا عالية-الحدة لكن ضيقة الامتداد (أيقونات/دوائر)
      // لصالح صفوف نص أقل حدّة لكن ممتدة عبر عرض الحقل
      const score = edgeScore * coverageAvg;
      if (score > bestScore) {
        bestScore = score;
        bestStartRow = i;
        bestEndRow = j;
      }
    }
  }
  return { startRow: bestStartRow, endRow: bestEndRow, score: bestScore };
}

function computeTextLineBands(src: HTMLCanvasElement) {
  const cached = roiBandCache.get(src);
  if (cached !== undefined) return cached;

  const ctx = src.getContext('2d');
  if (!ctx) {
    roiBandCache.set(src, null);
    return null;
  }
  const gray = new Uint8ClampedArray(src.width * src.height);
  const data = ctx.getImageData(0, 0, src.width, src.height).data;
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!);
  }

  const rows = 10;
  const rowHeight = Math.floor(src.height / rows);
  const edgeSumPerRow = new Array(rows).fill(0);
  // حواف كل عمود ضمن كل صف — تُستخدم لتمييز سطر نص (حواف موزّعة على عرض الحقل)
  // عن عنصر رسومي مضغوط كأيقونة الواي فاي أو دائرة السعر/الساعة (حواف مركّزة في نطاق ضيق من العرض)
  const colEdgePerRow: number[][] = [];
  for (let r = 0; r < rows; r++) {
    const colSum = new Array(src.width).fill(0);
    for (let y = r * rowHeight; y < (r + 1) * rowHeight; y++) {
      for (let x = 1; x < src.width - 1; x++) {
        const gx = gray[y * src.width + x - 1]! - gray[y * src.width + x + 1]!;
        const gy = gray[(y - 1) * src.width + x]! - gray[(y + 1) * src.width + x]!;
        const mag = Math.abs(gx) + Math.abs(gy);
        colSum[x]! += mag;
        edgeSumPerRow[r] += mag;
      }
    }
    colEdgePerRow.push(colSum);
  }

  // نسبة الأعمدة "الفعّالة" (حوافها أعلى من 40% من متوسط الصف) لكل صف — مرتفعة لسطر نص، منخفضة لعنصر مضغوط
  const coveragePerRow = colEdgePerRow.map((colSum) => {
    const mean = colSum.reduce((a, b) => a + b, 0) / colSum.length || 0;
    const threshold = mean * 0.4;
    const above = colSum.filter((v) => v > threshold).length;
    return above / colSum.length;
  });

  const first = findRowBand(edgeSumPerRow, coveragePerRow, rows, null);
  let second: RowBand | null = findRowBand(edgeSumPerRow, coveragePerRow, rows, first);
  // شريط ثانٍ ضعيف جدًا (مثلاً <15% من قوة الأول) على الأرجح ضجيج/خلفية لا
  // سطر نص حقيقي — أفضل الرجوع لتقسيم الشريط الواحد بدل قصّ منطقة فارغة.
  if (second.score <= 0 || second.score < first.score * 0.15) second = null;

  let band1 = first;
  let band2 = second;
  if (band2 && band2.startRow < band1.startRow) {
    // رتّب رأسيًا: الشريط الأعلى دائمًا "الأول" (اسم المستخدم/الاسم)
    const tmp = band1;
    band1 = band2;
    band2 = tmp;
  }

  const result = { band1, band2, rows, rowHeight };
  roiBandCache.set(src, result);
  return result;
}

function dynamicCropRoi(src: HTMLCanvasElement, field: 'username' | 'password' | 'name' | 'phone'): HTMLCanvasElement {
  const bands = computeTextLineBands(src);
  if (!bands) return src;
  const { band1, band2, rowHeight } = bands;
  const isSecondField = field === 'password' || field === 'phone';

  let finalY: number;
  let finalH: number;

  if (band2) {
    // شريطان مستقلّان: كل حقل يأخذ شريطه الخاص كاملًا (مع هامش أوسع)
    // لتفادي قصّ أطراف الأرقام عند الإمساك باليد أو الميل الخفيف.
    const band = isSecondField ? band2 : band1;
    const padRows = 0.35;
    finalY = Math.round((band.startRow - padRows) * rowHeight);
    finalH = Math.round((band.endRow - band.startRow + 1 + padRows * 2) * rowHeight);
  } else {
    // احتياطي: لم يُعثر على شريط ثانٍ موثوق — نرجع لتقسيم الشريط الوحيد
    // لكن بهامش رأسي أوسع قليلًا لتقليل فقدان الأرقام الطويلة.
    const top = band1.startRow * rowHeight;
    const height = (band1.endRow - band1.startRow + 1) * rowHeight;
    if (!isSecondField) {
      finalY = Math.max(0, top - Math.round(height * 0.1));
      finalH = Math.round(height * 0.55);
    } else {
      finalY = top + Math.round(height * 0.45);
      finalH = Math.round(height * 0.55);
    }
  }

  // هامش أفقي أضيق (4% بدل 8%) — اسم المستخدم الطويل (12 خانة) يملأ العرض
  // وقد كانت الحواف تُقصّ أول/آخر رقم عند الإمساك باليد أو عدم التوسيط المثالي.
  const x = Math.round(src.width * 0.03);
  const cropW = Math.round(src.width * 0.94);
  finalY = Math.max(0, Math.min(finalY, src.height - 1));
  finalH = Math.max(1, Math.min(finalH, src.height - finalY));

  const c = document.createElement('canvas');
  c.width = Math.max(1, cropW);
  c.height = Math.max(1, finalH);
  const octx = c.getContext('2d');
  if (!octx) return src;
  octx.drawImage(src, x, finalY, cropW, finalH, 0, 0, c.width, c.height);
  return c;
}

// ====== أنواع التحضير ======
// أُضيف adaptive (عتبة تكيفية) و sharp (توضيح بعد تنعيم) لمقاومة الضجيج
// والانعكاسات والبطاقة الممسوكة باليد.
type PrepKind =
  | 'gray'
  | 'contrast'
  | 'thresh100'
  | 'thresh130'
  | 'thresh160'
  | 'adaptive'
  | 'sharp'
  | 'otsu';

// نسخ معالجة متنوعة — تغطي إضاءة غير متساوية، انعكاسات، وضبابية خفيفة.
// المسار الحي السريع (3 معالجات) — توازن دقة/سرعة
const PREP_VARIANTS_FAST: PrepKind[] = ['contrast', 'adaptive', 'gray'];
// المسار الكامل (دقة أعلى) — يُستخدم عند الحاجة أو كاحتياط
const PREP_VARIANTS_NAME_FAST: PrepKind[] = ['contrast', 'adaptive', 'gray'];

// ====== دوال التطبيع والتحقق ======

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EN_DIGITS = '0123456789';

export function normalizeCardDigits(raw: string): string {
  const s = raw
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

// لا حدود طول — أي رقم غير فارغ مقبول شكليًا (انظر FIX LEN-BOUND-01 أعلاه).
// الحارس الوحيد المتبقّي: رفض السلاسل الطويلة جدًا (25+ خانة) التي لا يمكن
// أن تكون كودًا حقيقيًا مطبوعًا على بطاقة — عمليًا ناتج التصاق سطرين OCR
// بالخطأ (مثال واقعي رأيناه: دمج اسم المستخدم وكلمة السر في سلسلة واحدة)،
// وليس افتراضًا عن طول أي تنسيق بطاقة بعينه.
const CARD_DIGITS_SANITY_MAX = 25;

export function isValidCardUsername(digits: string): boolean {
  return digits.length > 0 && digits.length <= CARD_DIGITS_SANITY_MAX;
}

export function isValidCardPassword(digits: string): boolean {
  return digits.length > 0 && digits.length <= CARD_DIGITS_SANITY_MAX;
}

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
  // FIX LEN-BOUND-01: أُزيل تفضيل صريح كان هنا لأطوال "شائعة" (12 لاسم
  // المستخدم، 6 لكلمة السر) خاصة بمزوّد واحد — كان يعاقب فعليًا أي بطاقة
  // بتنسيق آخر (تحقّقنا: بطاقة حقيقية بكود مستخدم من 6 خانات لم تكن لتحصل
  // على أي تفضيل، بل تُهزم أمام مرشّح ضجيج بطول 12 خطأً). تفضيل "الأطول
  // بين مرشّحين متداخلين" ما زال قائمًا (السطر التالي) لأنه ليس افتراضًا
  // عن تنسيق بعينه، بل معالجة معروفة لقراءات OCR الجزئية (تُفقد الخانات
  // من جهة اليسار غالبًا عند قصّ حواف اليد على البطاقة) — انظر توثيق الدالة.
  return (ok ? 50 : 0) + digits.length * 2;
}

/**
 * دمج مرشّحات رقمية جزئية: إذا ظهر مرشّح كسلسلة جزئية من آخر أطول،
 * فضّل الأطول (يستعيد الأرقام المفقودة من الحواف عند الإمساك باليد).
 * مثال: "528261456" ⊆ "445282914562" → اختر الأطول.
 */
function fuseDigitCandidates(candidates: string[], field: 'username' | 'password'): string {
  const normalized = candidates
    .map(normalizeCardDigits)
    .filter((c) => c.length > 0 && c.length <= CARD_DIGITS_SANITY_MAX);
  if (normalized.length === 0) return '';

  // عدّ مرات الظهور (تصويت موزون بالتكرار)
  const counts = new Map<string, number>();
  for (const c of normalized) {
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }

  const uniq = Array.from(counts.keys());
  if (uniq.length === 1) return uniq[0]!;

  // رتّب بالتكرار أولاً، ثم بدرجة scoreDigitRun، ثم بالطول
  uniq.sort((a, b) => {
    const ca = counts.get(a) ?? 0;
    const cb = counts.get(b) ?? 0;
    if (cb !== ca) return cb - ca;
    const sa = scoreDigitRun(a, field);
    const sb = scoreDigitRun(b, field);
    if (sb !== sa) return sb - sa;
    return b.length - a.length;
  });

  // إذا كان أقصر مرشّح سلسلة جزئية من أطول مرشّح صالح، فضّل الأطول
  const longestValid = uniq.find((c) =>
    field === 'username' ? isValidCardUsername(c) : isValidCardPassword(c),
  );
  if (longestValid) {
    const shorterIsSubstring = uniq.some(
      (c) => c !== longestValid && c.length >= 4 && longestValid.includes(c),
    );
    if (shorterIsSubstring || uniq[0] === longestValid) return longestValid;
  }

  // تصويت على مستوى الخانة للمرشّحات المتقاربة الطول (±2)
  const refLen = uniq[0]!.length;
  const close = uniq.filter((c) => Math.abs(c.length - refLen) <= 2 && c.length >= 4);
  if (close.length >= 2) {
    const maxLen = Math.max(...close.map((c) => c.length));
    let fused = '';
    for (let i = 0; i < maxLen; i++) {
      const chCounts = new Map<string, number>();
      for (const c of close) {
        // محاذاة من اليمين (الأرقام المفقودة غالبًا من اليسار)
        const idx = i - (maxLen - c.length);
        if (idx >= 0 && idx < c.length) {
          const ch = c[idx]!;
          // وزن إضافي حسب تكرار المرشّح الأصلي
          const weight = counts.get(c) ?? 1;
          chCounts.set(ch, (chCounts.get(ch) ?? 0) + weight);
        }
      }
      let bestCh = '0';
      let bestN = -1;
      for (const [ch, n] of chCounts) {
        if (n > bestN) {
          bestN = n;
          bestCh = ch;
        }
      }
      if (bestN > 0) fused += bestCh;
    }
    if (field === 'username' ? isValidCardUsername(fused) : isValidCardPassword(fused)) {
      return fused;
    }
  }

  return uniq[0]!;
}

function bestDigitCandidate(text: string, field: 'username' | 'password'): string {
  const normalized = normalizeCardDigits(text);
  if (!normalized) return '';
  const runs = (text.match(/\d{4,}/g) ?? []).map(normalizeCardDigits).filter(Boolean);
  if (runs.length === 0) runs.push(normalized);

  // أضف النص الكامل كمرشّح إن كان صالح الطول
  if (normalized.length >= 4 && !runs.includes(normalized)) runs.push(normalized);

  return fuseDigitCandidates(runs, field);
}

// دالة تحقق سريعة (تمريرة واحدة فقط) — تُستخدم للتحقق المستقل الثاني في
// مسارات "القص الضيق" (tight-crop)، حيث المطلوب رأي ثانٍ سريع للمقارنة،
// وليس استخراجًا كاملًا. استخدام ocrDigitsOnCanvas (3 تمريرات معالجة
// متسلسلة) هنا كان يضاعف زمن الفحص ~3× لكل حقل فوق زمن التمريرة الأساسية —
// راجع FIX OCR-PERF-01 عند نقاط الاستدعاء.
async function ocrDigitsQuickCheck(
  canvas: HTMLCanvasElement,
  field: 'username' | 'password',
  poolIndex = 0,
): Promise<string> {
  try {
    const worker = await getWorker(poolIndex);
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789',
      tessedit_pageseg_mode: '7',
    });
    const scaled = upscaleCanvas(canvas, canvas.width < 400 ? 2.8 : 2.1);
    // جرّب معالجتين سريعتين واختر الأفضل — adaptive أفضل مع الانعكاسات
    const candidates: string[] = [];
    for (const kind of ['adaptive', 'contrast'] as PrepKind[]) {
      try {
        const prepped = preprocessAdvanced(scaled, kind);
        const { data } = await withTimeout(worker.recognize(prepped), RECOGNIZE_TIMEOUT_MS, 'OCR');
        const dig = bestDigitCandidate(data.text || '', field);
        if (dig) candidates.push(dig);
      } catch {
        /* next */
      }
    }
    return fuseDigitCandidates(candidates, field);
  } catch {
    return '';
  }
}

// ====== دالة OCR للأرقام ======

async function ocrDigitsOnCanvas(
  canvas: HTMLCanvasElement,
  field: 'username' | 'password',
  poolIndex = 0,
): Promise<{ digits: string; votes: number }> {
  const worker = await getWorker(poolIndex);
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789',
    tessedit_pageseg_mode: '7',
  });

  // FIX OCR-SPEED-01: مقياس واحد في المسار الحي + معالجات FAST فقط.
  // كان سابقاً مقياسَين × 6 معالجات = حتى 12 تعرف متسلسل (بطيء جداً).
  const scale = canvas.width < 280 ? 3.2 : canvas.width < 450 ? 2.8 : 2.2;
  const tallies = new Map<string, number>();
  const allCandidates: string[] = [];
  const scaled = upscaleCanvas(canvas, scale);

  for (const kind of PREP_VARIANTS_FAST) {
    const prepped = preprocessAdvanced(scaled, kind);
    try {
      const { data } = await withTimeout(
        worker.recognize(prepped),
        RECOGNIZE_TIMEOUT_MS,
        'OCR',
      );
      const digits = bestDigitCandidate(data.text || '', field);
      if (!digits) continue;
      allCandidates.push(digits);
      const bonus = scoreDigitRun(digits, field) > 50 ? 2 : scoreDigitRun(digits, field) > 30 ? 1 : 0;
      const votes = (tallies.get(digits) ?? 0) + 1 + bonus;
      tallies.set(digits, votes);
      // إيقاف مبكر: مرشّح صالح حصل على أصوات كافية
      if (
        votes >= 3 &&
        (field === 'username' ? isValidCardUsername(digits) : isValidCardPassword(digits))
      ) {
        break;
      }
    } catch {
      /* try next prep */
    }
  }

  // دمج المرشّحات الجزئية قبل اختيار الفائز بالتصويت
  const fused = fuseDigitCandidates(allCandidates, field);
  if (fused) {
    tallies.set(fused, (tallies.get(fused) ?? 0) + 3);
  }

  let best = '';
  let bestVotes = 0;
  for (const [d, v] of tallies) {
    if (
      v > bestVotes ||
      (v === bestVotes && scoreDigitRun(d, field) > scoreDigitRun(best, field)) ||
      (v === bestVotes && d.length > best.length)
    ) {
      best = d;
      bestVotes = v;
    }
  }
  return { digits: best, votes: bestVotes };
}

// ====== دوال OCR للبطاقات ======

export interface CardOcrFields {
  username: string;
  password: string;
  confidence: number;
  verified: boolean;
  raw: string;
}

async function ocrCardFieldsFromGuideAt(guideCanvas: HTMLCanvasElement): Promise<CardOcrFields> {
  // FIX DESKEW-DUP-01: دسكو الصورة كاملة مرة واحدة هنا (بدل الاعتماد على
  // deskewCanvas الداخلي المُزال من preprocessAdvanced) — إعطاء الخوارزمية
  // البطاقة كاملة بدل قصاصة ROI ضيقة يمنحها أدلة حواف أكثر بكثير لتقدير
  // ميل موثوق (نفس نمط ocrCardFieldsFromTightCrop).
  const deskewedGuide = deskewCanvas(guideCanvas);
  const userRoi = dynamicCropRoi(deskewedGuide, 'username');
  const passRoi = dynamicCropRoi(deskewedGuide, 'password');

  const [userRes, passRes] = await Promise.all([
    ocrDigitsOnCanvas(userRoi, 'username', 0),
    ocrDigitsOnCanvas(passRoi, 'password', 1),
  ]);

  let username = userRes.digits;
  let password = passRes.digits;

  const needFullFallback =
    !username || !password ||
    !isValidCardUsername(username) || !isValidCardPassword(password) ||
    userRes.votes < 2 || passRes.votes < 2;

  let fullText = '';
  if (needFullFallback) {
    try {
      const fullScaled = upscaleCanvas(deskewedGuide, deskewedGuide.width < 500 ? 3 : 2.2);
      const worker = await getWorker(0);
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: '6',
      });
      // عدة معالجات على الصورة الكاملة لاستعادة أرقام الحواف المفقودة
      const fallbackCandidatesUser: string[] = [];
      const fallbackCandidatesPass: string[] = [];
      // FIX PREP-DEAD-01: 'thresh160' مُنفَّذ فعليًا في preprocessAdvanced لكنه
      // لم يكن مُدرجًا في أي مصفوفة معالجات مستخدَمة فعليًا في كل الأنبوب —
      // كود ميت. تحقّقنا على بطاقة حقيقية (كود 6 خانات، إضاءة/تباين مختلفين
      // عن العيّنات المعتادة): thresh160 أعطى قراءة مطابقة تمامًا ("724156")
      // بينما فشلت كل المعالجات الأربع الأخرى في نفس التمريرة. أضيف هنا (مسار
      // الاحتياط، غير حرج للأداء الحي) لا في PREP_VARIANTS (المسار الحي لكل
      // إطار كاميرا) لتفادي تكلفة تمريرة OCR إضافية على كل إطار دون مبرر كافٍ بعد.
      const fbPreps: PrepKind[] = ['contrast', 'adaptive', 'sharp', 'thresh130', 'thresh160'];
      for (const kind of fbPreps) {
        try {
          const prepped = preprocessAdvanced(fullScaled, kind);
          const { data } = await withTimeout(worker.recognize(prepped), RECOGNIZE_TIMEOUT_MS, 'OCR');
          const t = data.text || '';
          fullText = fullText || t;
          const extracted = extractOrderedDigitFields(t);
          if (extracted.username) fallbackCandidatesUser.push(extracted.username);
          if (extracted.password) fallbackCandidatesPass.push(extracted.password);
        } catch {
          /* next */
        }
      }
      if (fallbackCandidatesUser.length) {
        const fusedU = fuseDigitCandidates(
          [...fallbackCandidatesUser, ...(username ? [username] : [])],
          'username',
        );
        if (fusedU && (!username || fusedU.length >= username.length)) username = fusedU;
      }
      if (fallbackCandidatesPass.length) {
        const fusedP = fuseDigitCandidates(
          [...fallbackCandidatesPass, ...(password ? [password] : [])],
          'password',
        );
        if (fusedP && (!password || isValidCardPassword(fusedP))) password = fusedP;
      }
    } catch {
      fullText = '';
    }
  }

  if (needFullFallback && fullText && (!isValidCardUsername(username) || !isValidCardPassword(password))) {
    const extracted = extractOrderedDigitFields(
      fullText,
      isValidCardUsername(username) && userRes.votes >= 2 ? username : '',
      isValidCardPassword(password) && passRes.votes >= 2 ? password : '',
    );
    if (!isValidCardUsername(username) && extracted.username) username = extracted.username;
    if (!isValidCardPassword(password) && extracted.password) password = extracted.password;
  }

  if (username && password && username === password) {
    password = passRes.digits !== username ? passRes.digits : '';
  }

  const userOk = isValidCardUsername(username);
  const passOk = isValidCardPassword(password);
  const votes = userRes.votes + passRes.votes;
  // عتبة تصويت أعلى قليلًا لأننا نستخدم المزيد من المقاييس/المعالجات
  const confidence = Math.min(1, (votes / 20) * 0.55 + (userOk ? 0.25 : 0) + (passOk ? 0.2 : 0));
  const verified = userOk && passOk && userRes.votes >= 3 && passRes.votes >= 2;

  return {
    username,
    password,
    confidence,
    verified,
    raw: [username, password].filter(Boolean).join('\n') || fullText,
  };
}

/** يختار الأفضل بين نتيجتين: verified يفوز أولًا، ثم confidence الأعلى. */
function pickBetterCardResult(a: CardOcrFields, b: CardOcrFields): CardOcrFields {
  if (a.verified !== b.verified) return a.verified ? a : b;
  return b.confidence > a.confidence ? b : a;
}

export async function ocrCardFieldsFromGuide(guideCanvas: HTMLCanvasElement): Promise<CardOcrFields> {
  const candidates = detectQuarterRotationCandidates(guideCanvas);
  let best: CardOcrFields | null = null;
  for (const q of candidates) {
    const rotated = rotateCanvasQuarter(guideCanvas, q);
    const r = await ocrCardFieldsFromGuideAt(rotated);
    best = best ? pickBetterCardResult(best, r) : r;
    if (best.verified) break; // نتيجة مؤكّدة — لا داعٍ لتجربة الاتجاهات الأخرى
  }
  return best ?? { username: '', password: '', confidence: 0, verified: false, raw: '' };
}

async function ocrCardFieldsFromTightCropAt(cropCanvas: HTMLCanvasElement): Promise<CardOcrFields> {
  const deskewed = deskewCanvas(cropCanvas);
  const scaled = upscaleCanvas(deskewed, deskewed.width < 500 ? 3.2 : 2.2);
  // FIX PREP-DEAD-01 (انظر التوثيق في ocrCardFieldsFromGuideAt): thresh160
  // مضاف هنا أيضًا — هذا مسار القص اليدوي/رفع الملف، ليس حلقة الكاميرا الحيّة.
  const preps: PrepKind[] = ['contrast', 'adaptive', 'sharp', 'thresh130', 'thresh160'];

  const results = await Promise.all(
    preps.map(async (kind, i) => {
      try {
        const worker = await getWorker(i);
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789',
          tessedit_pageseg_mode: '6',
        });
        const prepped = preprocessAdvanced(scaled, kind);
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

  // FIX OCR-VERIFY-01: التصويت أعلاه بين preps.length نسخ معالجة (contrast/
  // thresh130/gray) كلها مشتقّة من *نفس* صورة القص — أخطاء قراءة منهجية
  // (رقم غير واضح بسبب إضاءة/تشويش) قد تتكرر بنفس الشكل الخاطئ في نسختين
  // من الثلاث، فتفوز بالتصويت وتُعلَّم verified=true رغم كونها خاطئة —
  // تحقّقنا من هذا فعليًا: قراءة تجريبية لرقم مستخدم حقيقي (12 خانة) أنتجت
  // نتيجة "صالحة الطول" لكن خاطئة المحتوى (خانتان أوليان مختلفتان)، وكانت
  // ستُقبل بصمت لأن التحقق السابق فحص الطول فقط دون محتوى مستقل.
  // الحل: تحقق مستقل ثانٍ عبر مسار OCR مختلف فعليًا — قص ROI منفصل لكل
  // حقل (dynamicCropRoi، نفس أسلوب ocrCardFieldsFromGuide) بوضع psm 7
  // (سطر واحد) بدل psm 6 (كتلة متعددة الأسطر) على نفس صورة القص. طريقتا
  // القراءة تعالجان بكسلات مختلفة (كتلة كاملة مقابل منطقة سطر واحد) بمعالجة
  // مختلفة، فاحتمال تكرار نفس الخطأ في الاثنتين معًا أقل بكثير من تكراره
  // بين نسختي معالجة لنفس القص. verified لا يُمنح إلا عند توافق المسارين.
  //
  // FIX OCR-PERF-01: التحقق هنا كان يستخدم ocrDigitsOnCanvas، التي تُجري 3
  // تمريرات معالجة متسلسلة لكل حقل (لأنها مصمّمة للاستخراج الأساسي في مسار
  // الكاميرا الحي، حيث الدقة أهم). كتحقق ثانٍ فقط (مقارنة قيمة واحدة بقيمة
  // أخرى) هذا مبالغ فيه ويضاعف زمن الفحص كاملًا تقريبًا 3× لكل حقل. استُبدلت
  // بـ ocrDigitsQuickCheck (تمريرة واحدة) — يحافظ على نفس خاصية "مسار OCR
  // ومعالجة مختلفة فعليًا عن التصويت الأساسي" (وهي الأساس الذي يمنع تكرار
  // الخطأ في الاثنين معًا)، بدون تكرار المعالجة 3 مرات لغرض لا يحتاجها.
  const userRoi = dynamicCropRoi(scaled, 'username');
  const passRoi = dynamicCropRoi(scaled, 'password');
  const [roiUserDigits, roiPassDigits] = await Promise.all([
    ocrDigitsQuickCheck(userRoi, 'username', 0),
    ocrDigitsQuickCheck(passRoi, 'password', 1),
  ]);
  const roiUser = { digits: roiUserDigits };
  const roiPass = { digits: roiPassDigits };

  // احتياطي: لو فشل التصويت الأساسي بإيجاد قيمة صالحة، اقبل قيمة الـROI
  // المستقلة إن كانت صالحة الشكل — أفضل من عدم وجود نتيجة إطلاقًا.
  if ((!username || !isValidCardUsername(username)) && isValidCardUsername(roiUser.digits)) {
    username = roiUser.digits;
  }
  if ((!password || !isValidCardPassword(password)) && isValidCardPassword(roiPass.digits)) {
    password = roiPass.digits;
  }
  if (username && password && username === password) {
    password = '';
  }

  const userOk = isValidCardUsername(username);
  const passOk = isValidCardPassword(password);
  const userAgrees = !!roiUser.digits && roiUser.digits === username;
  const passAgrees = !!roiPass.digits && roiPass.digits === password;

  const confidence = Math.min(
    1,
    (u.votes / preps.length) * 0.4 + (p.votes / preps.length) * 0.4 +
      (userOk ? 0.1 : 0) + (passOk ? 0.1 : 0) +
      (userAgrees ? 0.1 : 0) + (passAgrees ? 0.1 : 0),
  );
  // verified يتطلب الآن: طول صالح + أغلبية تصويت + توافق مسار OCR مستقل ثانٍ.
  const verified =
    userOk && passOk && u.votes >= 2 && p.votes >= 2 && userAgrees && passAgrees;

  return {
    username,
    password,
    confidence,
    verified,
    raw: [username, password].filter(Boolean).join('\n') || results.map((r) => `${r.username} ${r.password}`).join('\n'),
  };
}

export async function ocrCardFieldsFromTightCrop(cropCanvas: HTMLCanvasElement): Promise<CardOcrFields> {
  const candidates = detectQuarterRotationCandidates(cropCanvas);
  let best: CardOcrFields | null = null;
  for (const q of candidates) {
    const rotated = rotateCanvasQuarter(cropCanvas, q);
    const r = await ocrCardFieldsFromTightCropAt(rotated);
    best = best ? pickBetterCardResult(best, r) : r;
    if (best.verified) break;
  }
  return best ?? { username: '', password: '', confidence: 0, verified: false, raw: '' };
}

export function consensusCardFields(
  samples: Array<{ username: string; password: string }>,
): { username: string; password: string; verified: boolean; agreement: number } {
  const count = (key: 'username' | 'password') => {
    const m = new Map<string, number>();
    const all: string[] = [];
    for (const s of samples) {
      const v = s[key];
      if (!v) continue;
      all.push(v);
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    // دمج المرشّحات الجزئية عبر الإطارات قبل اختيار الأكثر تكرارًا
    const fused = fuseDigitCandidates(all, key);
    let best = fused;
    let n = fused ? (m.get(fused) ?? 0) : 0;
    // إذا كان المدمج جديدًا، امنحه أصوات المرشّحات التي هو امتداد لها
    if (fused) {
      for (const [v, c] of m) {
        if (v !== fused && (fused.includes(v) || v.includes(fused))) n += c;
      }
    }
    for (const [v, c] of m) {
      if (c > n || (c === n && v.length > best.length)) {
        best = v;
        n = c;
      }
    }
    // فضّل المدمج إذا كان أطول وصالحًا ويغطي أغلب الأصوات
    if (
      fused &&
      fused !== best &&
      fused.length > best.length &&
      (key === 'username' ? isValidCardUsername(fused) : isValidCardPassword(fused))
    ) {
      best = fused;
    }
    return { value: best, n };
  };
  const u = count('username');
  const p = count('password');
  const need = Math.max(2, Math.ceil(samples.length * 0.45));
  const verified =
    u.n >= need &&
    p.n >= need &&
    isValidCardUsername(u.value) &&
    isValidCardPassword(p.value);
  return {
    username: u.value,
    password: p.value,
    verified,
    agreement: samples.length ? (u.n + p.n) / (2 * samples.length) : 0,
  };
}

export async function ocrCardMultiFrame(
  capture: () => HTMLCanvasElement | null,
  frames = 3,
  delayMs = 80,
): Promise<CardOcrFields> {
  const samples: Array<{ username: string; password: string; verified: boolean }> = [];
  let lastRaw = '';

  for (let i = 0; i < frames; i++) {
    const canvas = capture();
    if (canvas) {
      try {
        const r = await ocrCardFieldsFromGuide(canvas);
        if (r.username || r.password) {
          samples.push({ username: r.username, password: r.password, verified: r.verified });
          lastRaw = r.raw;
        }
      } catch {
        /* frame failed */
      }
    }
    // إيقاف مبكر عند تطابق إطارين متتاليين بصيغة صالحة
    // FIX OCR-CONSENSUS-01: تطابق إطارين متتاليين على نفس القيمة لا يثبت
    // صحّتها بمفرده — تحقّقنا فعليًا على بطاقة حقيقية: خطأ منهجي في تحديد
    // موضع سطري اسم المستخدم/كلمة السر (dynamicCropRoi يلتقط شريط العنوان/
    // الأيقونة بدل سطر الأرقام الفعلي) يجعل ocrCardFieldsFromGuide يسقط
    // لمسار الاحتياط (OCR كامل البطاقة بقناع أرقام فقط)، وهذا المسار عرضة
    // لقراءة حواف الحروف العربية/الأيقونات كأرقام plausible الطول لكنها
    // خاطئة المحتوى. بما أن معالجة الصورة حتمية (نفس البكسلات ⇐ نفس
    // الخطأ)، إطاران متتاليان من كاميرا شبه ثابتة يعيدان غالبًا *نفس* القيمة
    // الخاطئة، فيجتازان شرط "تطابق + طول صالح" رغم كونهما خاطئين معًا. طلب
    // اجتياز أحد الإطارين المتوافقين لتحقّق ocrCardFieldsFromGuide الداخلي
    // المستقل (r.verified — تصويت ≥3/≥2 عبر عدة معالجات ومقاييس منفصلة،
    // وليس فقط طول صالح) يمنع اعتماد إجماع بين إطارين اثنين لم يجتز أيّهما
    // أي تحقّق مستقل أصلًا.
    if (samples.length >= 2) {
      const a = samples[samples.length - 1]!;
      const b = samples[samples.length - 2]!;
      if (
        a.username === b.username &&
        a.password === b.password &&
        isValidCardUsername(a.username) &&
        isValidCardPassword(a.password) &&
        (a.verified || b.verified)
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
  // نفس أساس FIX OCR-CONSENSUS-01: إجماع الأغلبية بين الإطارات (consensusCardFields)
  // وحده لا يكفي لمنح verified=true إن لم يجتز أي إطار من عيّنات الإجماع
  // تحقّقه الداخلي المستقل أصلًا — وإلا يمكن لخطأ منهجي متكرر عبر كل
  // الإطارات (نفس الفشل الموصوف أعلاه) أن يُعلَّم "مؤكد" رغم عدم اجتياز أي
  // مسار OCR مستقل له فعليًا.
  const anyFrameVerified = samples.some((s) => s.verified);
  return {
    username: c.username,
    password: c.password,
    confidence: Math.min(1, c.agreement + (c.verified ? 0.15 : 0)),
    verified: c.verified && anyFrameVerified,
    raw: lastRaw || `${c.username}\n${c.password}`,
  };
}

// ====== دوال الدفع ======

export function normalizePayPhone(raw: string): string {
  let n = normalizeCardDigits(raw);
  if (/^5[69]\d{7}$/.test(n)) n = '0' + n;
  return n;
}

export function isValidPayPhone(value: string): boolean {
  return /^(059|056)\d{7}$/.test(value);
}

export function normalizePayName(raw: string): string {
  let name = raw
    .replace(/[\u064B-\u065F\u0670]/g, '') // إزالة التشكيل
    .replace(/\u0640/g, '') // إزالة التطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    // تصحيحات OCR شائعة
    .replace(/[|]/g, 'ا')
    .replace(/[^\p{L}\p{N}\s.'\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // إزالة الأرقام المنفردة في بداية/نهاية الاسم (ضجيج شائع)
  name = name.replace(/^\d+\s+/, '').replace(/\s+\d+$/, '');
  return name;
}

export function scorePayNameQuality(name: string): number {
  if (!name) return 0;
  const letters = (name.match(/\p{L}/gu) ?? []).length;
  if (letters < 2) return 0;

  const words = name.split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w));
  let s = Math.min(40, letters * 2) + Math.min(30, words.length * 12);

  // طول منطقي لاسم شخص
  if (name.length >= 4 && name.length <= 48) s += 15;
  if (name.length >= 6 && name.length <= 30) s += 8;

  // أسماء عربية شائعة جزئياً (مكافأة خفيفة)
  if (/[اأإآبتثجحخدذرزسشصضطظعغفقكلمنهويى]/u.test(name)) s += 10;

  // كلمتان أو ثلاث كلمات = شكل اسم طبيعي
  if (words.length >= 2 && words.length <= 4) s += 12;

  // عقوبات
  if (/\d{3,}/.test(name)) s -= 30; // أرقام كثيرة = غالباً خلط مع رقم جوال
  if (words.length === 0) s -= 20;
  if (name.length > 55) s -= 15;
  // نسبة الحروف إلى الطول الكلي
  const letterRatio = letters / Math.max(1, name.length);
  if (letterRatio < 0.55) s -= 15;

  return Math.max(0, Math.min(100, s));
}

export function cropPayFieldRoi(
  src: HTMLCanvasElement,
  field: 'name' | 'phone',
): HTMLCanvasElement {
  return dynamicCropRoi(src, field);
}

async function ocrPayPhoneOnCanvas(canvas: HTMLCanvasElement, poolIndex = 1): Promise<{ phone: string; votes: number }> {
  const worker = await getWorker(poolIndex);
  await worker.setParameters({
    tessedit_char_whitelist: '0123456789',
    tessedit_pageseg_mode: '7',
  });
  // FIX OCR-SPEED-01: upscale أخف + FAST preps + early exit عند رقم صالح
  const scaled = upscaleCanvas(canvas, canvas.width < 350 ? 2.8 : 2.3);
  const tallies = new Map<string, number>();

  for (const kind of PREP_VARIANTS_FAST) {
    const prepped = preprocessAdvanced(scaled, kind);
    try {
      const { data } = await withTimeout(worker.recognize(prepped), RECOGNIZE_TIMEOUT_MS, 'OCR');
      const phone = normalizePayPhone(data.text || '');
      const candidates = new Set<string>();
      if (isValidPayPhone(phone)) candidates.add(phone);
      const loose = (data.text || '').replace(/\D/g, '');
      for (let i = 0; i + 10 <= loose.length; i++) {
        const slice = loose.slice(i, i + 10);
        const n = normalizePayPhone(slice);
        if (isValidPayPhone(n)) candidates.add(n);
      }
      if (/^5[69]\d{7}$/.test(loose.slice(0, 9))) {
        const n = '0' + loose.slice(0, 9);
        if (isValidPayPhone(n)) candidates.add(n);
      }
      for (const c of candidates) {
        const v = (tallies.get(c) ?? 0) + 2;
        tallies.set(c, v);
      }
      if (!candidates.size && phone.length >= 9) {
        tallies.set(phone, (tallies.get(phone) ?? 0) + 1);
      }
      // إيقاف مبكر إذا ظهر رقم جوال فلسطيني صالح بأصوات كافية
      const topValid = [...tallies.entries()].find(([p, v]) => isValidPayPhone(p) && v >= 2);
      if (topValid) break;
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
  // لا نقيّد الأحرف بقوة (العربية تحتاج نطاق واسع)، نعتمد على التطبيع + تقييم الجودة
  await worker.setParameters({
    tessedit_char_whitelist: '',
    tessedit_pageseg_mode: '7', // سطر واحد — مناسب للأسماء
  });
  // FIX OCR-SPEED-01: upscale أخف + 3 معالجات سريعة + early exit
  const scaled = upscaleCanvas(canvas, canvas.width < 400 ? 2.8 : 2.2);
  const tallies = new Map<string, number>();

  for (const kind of PREP_VARIANTS_NAME_FAST) {
    const prepped = preprocessAdvanced(scaled, kind);
    try {
      const { data } = await withTimeout(worker.recognize(prepped), RECOGNIZE_TIMEOUT_MS, 'OCR');
      const name = normalizePayName(data.text || '');
      const q = scorePayNameQuality(name);
      if (q < 20) continue;
      const weight = 1 + (q > 50 ? 1 : 0) + (q > 70 ? 1 : 0);
      const votes = (tallies.get(name) ?? 0) + weight;
      tallies.set(name, votes);
      // إيقاف مبكر عند اسم بجودة عالية وتكرار
      if (q >= 55 && votes >= 2) break;
    } catch {
      /* next */
    }
  }

  let best = '';
  let bestVotes = 0;
  let bestQ = -1;
  for (const [n, v] of tallies) {
    const q = scorePayNameQuality(n);
    if (v > bestVotes || (v === bestVotes && q > bestQ)) {
      best = n;
      bestVotes = v;
      bestQ = q;
    }
  }
  return { name: best, votes: bestVotes };
}

// نسخ سريعة (تمريرة واحدة) من فحص الهاتف/الاسم — لنفس سبب ocrDigitsQuickCheck:
// التحقق المستقل لا يحتاج نفس شمولية الاستخراج الأساسي (3 preps للهاتف،
// 2 للاسم)، ويكفيه رأي ثانٍ سريع بمعالجة/psm مختلفين فعليًا عن preps الأساسية.
async function ocrPayPhoneQuickCheck(canvas: HTMLCanvasElement, poolIndex = 1): Promise<string> {
  try {
    const worker = await getWorker(poolIndex);
    await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '7' });
    const scaled = upscaleCanvas(canvas, canvas.width < 350 ? 3 : 2.5);
    const prepped = preprocessAdvanced(scaled, 'contrast');
    const { data } = await withTimeout(worker.recognize(prepped), RECOGNIZE_TIMEOUT_MS, 'OCR');
    return extractPayPhoneFromText(data.text || '');
  } catch {
    return '';
  }
}

async function ocrPayNameQuickCheck(canvas: HTMLCanvasElement, poolIndex = 0): Promise<string> {
  try {
    const worker = await getWorker(poolIndex);
    await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '7' });
    const scaled = upscaleCanvas(canvas, canvas.width < 400 ? 2.8 : 2.2);
    // جرب contrast ثم adaptive كرأي ثانٍ أسرع وأدق من gray وحده
    for (const kind of ['contrast', 'adaptive'] as PrepKind[]) {
      const prepped = preprocessAdvanced(scaled, kind);
      const { data } = await withTimeout(worker.recognize(prepped), RECOGNIZE_TIMEOUT_MS, 'OCR');
      const name = normalizePayName(data.text || '');
      if (scorePayNameQuality(name) >= 25) return name;
    }
    return '';
  } catch {
    return '';
  }
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
  // FIX DESKEW-DUP-01: انظر نفس الإصلاح في ocrCardFieldsFromGuide
  const deskewedGuide = deskewCanvas(guideCanvas);
  const nameRoi = dynamicCropRoi(deskewedGuide, 'name');
  const phoneRoi = dynamicCropRoi(deskewedGuide, 'phone');

  const [nameRes, phoneRes] = await Promise.all([
    ocrPayNameOnCanvas(nameRoi),
    ocrPayPhoneOnCanvas(phoneRoi),
  ]);

  let phone = phoneRes.phone;
  if (!isValidPayPhone(phone)) {
    const full = upscaleCanvas(deskewedGuide, 2);
    const fullPhone = await ocrPayPhoneOnCanvas(full);
    if (isValidPayPhone(fullPhone.phone)) phone = fullPhone.phone;
  }

  const name = nameRes.name;
  const phoneOk = isValidPayPhone(phone);
  const nameOk = scorePayNameQuality(name) >= 25;

  return {
    name,
    phone: phoneOk ? phone : phone,
    nameConfidence: Math.min(1, nameRes.votes / 4 + (nameOk ? 0.3 : 0)),
    phoneConfidence: Math.min(1, phoneRes.votes / 8 + (phoneOk ? 0.4 : 0)),
    verified: phoneOk && nameOk && phoneRes.votes >= 2,
    raw: `${name}\n${phone}`.trim(),
  };
}

export async function ocrPayFieldsFromTightCrop(cropCanvas: HTMLCanvasElement): Promise<PayOcrFields> {
  const deskewed = deskewCanvas(cropCanvas);
  const scaled = upscaleCanvas(deskewed, deskewed.width < 500 ? 3 : 2);
  const preps: PrepKind[] = ['contrast', 'thresh130', 'gray'];

  const results = await Promise.all(
    preps.map(async (kind, i) => {
      try {
        const worker = await getWorker(i);
        await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '6' });
        const prepped = preprocessAdvanced(scaled, kind);
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
  let name = n.value;
  let phone = p.value;

  // FIX OCR-VERIFY-02: نفس فئة الخطأ في OCR-VERIFY-01 (ocrCardFieldsFromTightCrop) —
  // preps الثلاثة هنا مشتقة من *نفس* صورة القص، فخطأ قراءة منهجي في خانة من
  // خانات الهاتف قد يتكرر بنفس الشكل الخاطئ في نسختين من الثلاث ويفوز
  // بالتصويت رغم كونه خاطئًا. رقم الهاتف تحديدًا حرج ماليًا (وجهة تحويل) —
  // قبوله دون تحقق مستقل يعني احتمال قبول رقم خاطئ بصمت وتحويل مبلغ لجهة
  // غير صحيحة. نطبّق نفس حل الحقول: قص ROI مستقل لكل حقل (dynamicCropRoi)
  // مع OCR بوضع psm 7 (نفس الدالتين المستخدمتين أصلًا في ocrPayFieldsFromGuide)
  // على صورة مختلفة معالجةً عن preps أعلاه. verified للهاتف الآن يتطلب توافق
  // المسارين، وليس فقط أغلبية تصويت بين نسخ معالجة لنفس القص. الاسم أُبقي
  // على تحقق أقل صرامة (fallback فقط) لأن تشابه الأسماء العربية بين مسارين
  // مختلفين حساس لفروق تشكيل/حروف لا تُغيّر الهوية فعليًا، وليس حقلاً ماليًا حرجًا.
  // FIX OCR-PERF-01 (نفس الإصلاح المطبّق على البطاقات): تحقق بتمريرة واحدة
  // بدل إعادة استخدام ocrPayNameOnCanvas/ocrPayPhoneOnCanvas الكاملتين
  // (3+2 preps متسلسلة) هنا، لأن هذا مجرد رأي ثانٍ للمقارنة لا استخراج أساسي.
  const nameRoi = dynamicCropRoi(scaled, 'name');
  const phoneRoi = dynamicCropRoi(scaled, 'phone');
  const [roiNameText, roiPhoneText] = await Promise.all([
    ocrPayNameQuickCheck(nameRoi, 0),
    ocrPayPhoneQuickCheck(phoneRoi, 1),
  ]);

  if ((!phone || !isValidPayPhone(phone)) && isValidPayPhone(roiPhoneText)) {
    phone = roiPhoneText;
  }
  if ((!name || scorePayNameQuality(name) < 25) && scorePayNameQuality(roiNameText) >= 25) {
    name = roiNameText;
  }

  const phoneOk = isValidPayPhone(phone);
  const nameOk = scorePayNameQuality(name) >= 25;
  const phoneAgrees = !!roiPhoneText && roiPhoneText === phone;

  return {
    name,
    phone,
    nameConfidence: Math.min(1, n.votes / preps.length + (nameOk ? 0.3 : 0)),
    phoneConfidence: Math.min(
      1,
      p.votes / preps.length + (phoneOk ? 0.4 : 0) + (phoneAgrees ? 0.1 : 0),
    ),
    verified: phoneOk && nameOk && p.votes >= 2 && phoneAgrees,
    raw: `${name}\n${phone}`.trim(),
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
  delayMs = 80,
): Promise<PayOcrFields> {
  const samples: Array<{ name: string; phone: string; verified: boolean }> = [];
  let last: PayOcrFields | null = null;

  for (let i = 0; i < frames; i++) {
    const canvas = capture();
    if (canvas) {
      try {
        const r = await ocrPayFieldsFromGuide(canvas);
        if (r.name || r.phone) {
          samples.push({ name: r.name, phone: r.phone, verified: r.verified });
          last = r;
        }
      } catch {
        /* frame fail */
      }
    }
    // FIX OCR-CONSENSUS-01: نفس إصلاح ocrCardMultiFrame — تطابق إطارين على
    // نفس رقم الجوال لا يثبت صحّته إن كان الاثنان ناتجين عن نفس الخطأ
    // المنهجي (معالجة صورة حتمية على كاميرا شبه ثابتة). رقم الجوال هنا
    // وجهة تحويل مالي، فقبوله بصمت بمجرد تكراره أخطر من حقل بطاقة نت.
    // نطلب اجتياز أحد الإطارين لتحقّق ocrPayFieldsFromGuide الداخلي.
    if (samples.length >= 2) {
      const a = samples[samples.length - 1]!;
      const b = samples[samples.length - 2]!;
      if (a.phone === b.phone && a.name === b.name && isValidPayPhone(a.phone) && (a.verified || b.verified)) break;
    }
    if (i < frames - 1) await new Promise((r) => setTimeout(r, delayMs));
  }

  if (!samples.length) {
    return { name: '', phone: '', nameConfidence: 0, phoneConfidence: 0, verified: false, raw: '' };
  }

  const c = consensusPayFields(samples);
  const anyFrameVerified = samples.some((s) => s.verified);
  return {
    name: c.name,
    phone: c.phone,
    nameConfidence: last?.nameConfidence ?? c.agreement,
    phoneConfidence: isValidPayPhone(c.phone) ? Math.max(0.7, c.agreement) : c.agreement * 0.5,
    verified: c.verified && anyFrameVerified,
    raw: `${c.name}\n${c.phone}`.trim(),
  };
}

// ====== دوال عامة ======

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
  // FIX DESKEW-DUP-01: دسكو صريح هنا بدل الاعتماد على preprocessAdvanced
  const deskewed = deskewCanvas(canvas);
  const scaled = upscaleCanvas(deskewed, scale);
  const prepped = preprocessAdvanced(scaled, 'contrast');

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

// ====== تصدير الدوال الجديدة ======
export { deskewCanvas, preprocessAdvanced, dynamicCropRoi };



