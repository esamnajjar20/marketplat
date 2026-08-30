// lib/ocrCardScan.ts (نسخة محسنة كاملة)

'use client';

/**
 * OCR لبطاقات النت الصغيرة (اسم مستخدم + كلمة سر — أرقام فقط في هذا المشروع).
 *
 * Pipeline:
 *   frame/guide crop → Deskew → Preprocess (CLAHE + Median Filter) → ROI ديناميكي
 *   → upscale 3× → Tesseract (digits only) → تطبيع → validation → توافق إطارات
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
const RECOGNIZE_TIMEOUT_MS = 25000;
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
  return resolvedPathsPromise;
}

// أطوال البطاقات
export const CARD_USER_LEN = { min: 8, max: 16 } as const;
export const CARD_PASS_LEN = { min: 4, max: 10 } as const;

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

  return loadPromise;
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
  for (const angle in angleVotes) {
    const a = parseInt(angle);
    const deviation = Math.abs(a) % 90;
    if (deviation > 5 && deviation < 85) {
      if ((angleVotes[a] ?? 0) > maxVotes) {
        maxVotes = angleVotes[a] ?? 0;
        bestAngle = a;
      }
    }
  }

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
 * معالجة مسبقة بمعادلة التباين التكيفي (CLAHE) و مرشح متوسط.
 */
function preprocessAdvanced(src: HTMLCanvasElement, kind: PrepKind): HTMLCanvasElement {
  const deskewed = deskewCanvas(src);
  const c = cloneCanvas(deskewed);
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;

  const gray = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!);
  }

  const filtered = new Uint8ClampedArray(gray.length);
  const kernelSize = 3;
  const half = Math.floor(kernelSize / 2);
  for (let y = half; y < c.height - half; y++) {
    for (let x = half; x < c.width - half; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < c.height && nx >= 0 && nx < c.width) {
            sum += gray[ny * c.width + nx]!;
            count++;
          }
        }
      }
      filtered[y * c.width + x] = Math.round(sum / count);
    }
  }

  if (kind === 'contrast') {
    const blockSize = 64;
    for (let by = 0; by < c.height; by += blockSize) {
      for (let bx = 0; bx < c.width; bx += blockSize) {
        let minVal = 255, maxVal = 0;
        for (let y = by; y < Math.min(by + blockSize, c.height); y++) {
          for (let x = bx; x < Math.min(bx + blockSize, c.width); x++) {
            const p = filtered[y * c.width + x]!;
            if (p < minVal) minVal = p;
            if (p > maxVal) maxVal = p;
          }
        }
        const range = maxVal - minVal;
        if (range > 20) {
          for (let y = by; y < Math.min(by + blockSize, c.height); y++) {
            for (let x = bx; x < Math.min(bx + blockSize, c.width); x++) {
              const idx = y * c.width + x;
              filtered[idx] = Math.round((filtered[idx]! - minVal) * (255 / range));
            }
          }
        }
      }
    }
  } else if (kind.startsWith('thresh')) {
    const t = kind === 'thresh100' ? 100 : kind === 'thresh130' ? 130 : 160;
    for (let i = 0; i < filtered.length; i++) {
      filtered[i] = filtered[i]! >= t ? 255 : 0;
    }
  }

  for (let i = 0; i < filtered.length; i++) {
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = filtered[i]!;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ====== نظام ROI ديناميكي ======

function dynamicCropRoi(src: HTMLCanvasElement, field: 'username' | 'password' | 'name' | 'phone'): HTMLCanvasElement {
  const gray = new Uint8ClampedArray(src.width * src.height);
  const ctx = src.getContext('2d');
  if (!ctx) return src;
  const data = ctx.getImageData(0, 0, src.width, src.height).data;
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!);
  }

  const rows = 10;
  const rowHeight = Math.floor(src.height / rows);
  const edgeSumPerRow = new Array(rows).fill(0);
  for (let r = 0; r < rows; r++) {
    for (let y = r * rowHeight; y < (r + 1) * rowHeight; y++) {
      for (let x = 1; x < src.width - 1; x++) {
        const gx = gray[y * src.width + x - 1]! - gray[y * src.width + x + 1]!;
        const gy = gray[(y - 1) * src.width + x]! - gray[(y + 1) * src.width + x]!;
        edgeSumPerRow[r] += Math.abs(gx) + Math.abs(gy);
      }
    }
  }

  let bestStartRow = 0, bestEndRow = 0, bestScore = -1;
  for (let i = 0; i < rows; i++) {
    for (let j = i; j < Math.min(i + 3, rows); j++) {
      let score = 0;
      for (let k = i; k <= j; k++) score += edgeSumPerRow[k];
      if (score > bestScore) {
        bestScore = score;
        bestStartRow = i;
        bestEndRow = j;
      }
    }
  }

  const top = bestStartRow * rowHeight;
  const height = (bestEndRow - bestStartRow + 1) * rowHeight;

  let finalY: number;
  let finalH: number;
  if (field === 'username') {
    finalY = top;
    finalH = Math.round(height * 0.45);
  } else if (field === 'password') {
    finalY = top + Math.round(height * 0.55);
    finalH = Math.round(height * 0.45);
  } else if (field === 'name') {
    finalY = top;
    finalH = Math.round(height * 0.5);
  } else { // phone
    finalY = top + Math.round(height * 0.5);
    finalH = Math.round(height * 0.5);
  }

  const x = Math.round(src.width * 0.08);
  const cropW = Math.round(src.width * 0.84);
  finalY = Math.max(0, Math.min(finalY, src.height - finalH));
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
type PrepKind = 'gray' | 'contrast' | 'thresh100' | 'thresh130' | 'thresh160';

// ثلاث نسخ معالجة
const PREP_VARIANTS: PrepKind[] = ['gray', 'contrast', 'thresh130'];

// ====== دوال التطبيع والتحقق ======

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EN_DIGITS = '0123456789';

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
  if (field === 'username' && digits.length >= 10 && digits.length <= 13) score += 20;
  if (field === 'password' && digits.length >= 5 && digits.length <= 8) score += 20;
  return score;
}

function bestDigitCandidate(text: string, field: 'username' | 'password'): string {
  const normalized = normalizeCardDigits(text);
  if (!normalized) return '';
  if (scoreDigitRun(normalized, field) > 0) {
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
    const fullSc = scoreDigitRun(normalized, field);
    if (fullSc >= bestScore) return normalized.length <= (field === 'username' ? CARD_USER_LEN.max : CARD_PASS_LEN.max)
      ? normalized
      : best || normalized.slice(0, field === 'username' ? CARD_USER_LEN.max : CARD_PASS_LEN.max);
    return best;
  }
  return normalized;
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

  const scaled = upscaleCanvas(canvas, canvas.width < 400 ? 3 : 2);
  const tallies = new Map<string, number>();

  for (const kind of PREP_VARIANTS) {
    const prepped = preprocessAdvanced(scaled, kind);
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

// ====== دوال OCR للبطاقات ======

export interface CardOcrFields {
  username: string;
  password: string;
  confidence: number;
  verified: boolean;
  raw: string;
}

export async function ocrCardFieldsFromGuide(guideCanvas: HTMLCanvasElement): Promise<CardOcrFields> {
  const userRoi = dynamicCropRoi(guideCanvas, 'username');
  const passRoi = dynamicCropRoi(guideCanvas, 'password');

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
      const fullScaled = upscaleCanvas(guideCanvas, guideCanvas.width < 500 ? 2.5 : 2);
      const worker = await getWorker(0);
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: '6',
      });
      const gray = preprocessAdvanced(fullScaled, 'contrast');
      const { data } = await withTimeout(worker.recognize(gray), RECOGNIZE_TIMEOUT_MS, 'OCR');
      fullText = data.text || '';
    } catch {
      fullText = '';
    }
  }

  if (needFullFallback && fullText) {
    const extracted = extractOrderedDigitFields(
      fullText,
      isValidCardUsername(username) && userRes.votes >= 2 ? username : '',
      isValidCardPassword(password) && passRes.votes >= 2 ? password : '',
    );
    username = extracted.username;
    password = extracted.password;
  }

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

export async function ocrCardFieldsFromTightCrop(cropCanvas: HTMLCanvasElement): Promise<CardOcrFields> {
  const deskewed = deskewCanvas(cropCanvas);
  const scaled = upscaleCanvas(deskewed, deskewed.width < 500 ? 3 : 2);
  const preps: PrepKind[] = ['contrast', 'thresh130', 'gray'];

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
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[^\p{L}\p{N}\s.'\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  name = name.replace(/\u0640/g, '');
  name = name.replace(/[أإآ]/g, 'ا');
  name = name.replace(/ى/g, 'ي');
  name = name.replace(/ة/g, 'ه');
  return name;
}

export function scorePayNameQuality(name: string): number {
  if (!name) return 0;
  const letters = (name.match(/\p{L}/gu) ?? []).length;
  if (letters < 2) return 0;
  const words = name.split(/\s+/).filter((w) => w.length >= 2);
  let s = Math.min(40, letters * 2) + Math.min(30, words.length * 12);
  if (name.length >= 4 && name.length <= 48) s += 15;
  if (/\d{4,}/.test(name)) s -= 25;
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
  const scaled = upscaleCanvas(canvas, canvas.width < 350 ? 3 : 2.5);
  const tallies = new Map<string, number>();

  for (const kind of PREP_VARIANTS) {
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
  await worker.setParameters({
    tessedit_char_whitelist: '',
    tessedit_pageseg_mode: '7',
  });
  const scaled = upscaleCanvas(canvas, canvas.width < 400 ? 3 : 2);
  const tallies = new Map<string, number>();

  for (const kind of ['gray', 'contrast'] as PrepKind[]) {
    const prepped = preprocessAdvanced(scaled, kind);
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
  const nameRoi = dynamicCropRoi(guideCanvas, 'name');
  const phoneRoi = dynamicCropRoi(guideCanvas, 'phone');

  const [nameRes, phoneRes] = await Promise.all([
    ocrPayNameOnCanvas(nameRoi),
    ocrPayPhoneOnCanvas(phoneRoi),
  ]);

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
  const scaled = upscaleCanvas(canvas, scale);
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
