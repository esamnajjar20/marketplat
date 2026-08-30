'use client';

/**
 * كشف تلقائي لمنطقة المحتوى (بطاقة/نص) داخل صورة أو إطار كاميرا،
 * بالاعتماد على كثافة الحواف (Edge Density) على شبكة تحليل صغيرة —
 * دون الحاجة لأي تدخل يدوي من المستخدم لتحديد المنطقة.
 *
 * الفكرة: نص/بطاقة على خلفية (طاولة، يد، إلخ) ينتج تركّز أعلى بكثير
 * للحواف (تباين حاد بين الحروف/الأرقام والخلفية) مقارنة بمناطق الخلفية
 * الأكثر تجانسًا. نبحث عن أصغر مستطيل يحيط بخلايا الشبكة عالية الحواف.
 */

export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DetectRegionOptions {
  /** أقصى بعد (طول/عرض) تُصغَّر إليه الصورة أثناء التحليل، لتسريع الحساب */
  maxAnalysisDim?: number;
  /** عدد أعمدة شبكة تحليل الحواف */
  gridCols?: number;
  /** عدد صفوف شبكة تحليل الحواف */
  gridRows?: number;
  /** نسبة حشو تُضاف حول المنطقة المكتشفة (لتفادي قص أطراف النص) */
  padding?: number;
  /** أقصى نسبة من مساحة الصورة يمكن اعتبارها "منطقة محتوى" — تفاديًا لاعتبار خلفية كاملة مشوشة كمحتوى */
  maxAreaRatio?: number;
  /** أقل نسبة من مساحة الصورة لازمة لاعتبار الكشف موثوقًا */
  minAreaRatio?: number;
}

const DEFAULTS: Required<DetectRegionOptions> = {
  maxAnalysisDim: 360,
  gridCols: 24,
  gridRows: 24,
  padding: 0.12,
  maxAreaRatio: 0.85,
  minAreaRatio: 0.03,
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** يرسم الصورة على قماش أصغر (للسرعة) ويحسب قيم التدرج الرمادي */
function downscaleToGray(
  source: HTMLCanvasElement,
  maxDim: number,
): { gray: Float32Array; w: number; h: number } {
  const scale = Math.min(1, maxDim / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { gray: new Float32Array(w * h), w, h };
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
  }
  return { gray, w, h };
}

/**
 * يكشف منطقة المحتوى (بطاقة/نص) داخل صورة عبر تحليل كثافة الحواف على شبكة.
 * يعيد مستطيلًا طبيعيًا (نسب 0..1 من أبعاد الصورة) أو null إن لم يُعثر على
 * منطقة موثوقة (خلفية متجانسة تمامًا، أو خلفية مشوشة بالكامل).
 */
export function detectContentRegion(
  source: HTMLCanvasElement,
  opts: DetectRegionOptions = {},
): NormRect | null {
  const o: Required<DetectRegionOptions> = { ...DEFAULTS, ...opts };
  if (source.width < 4 || source.height < 4) return null;

  const { gray, w, h } = downscaleToGray(source, o.maxAnalysisDim);
  if (w < 4 || h < 4) return null;

  const cols = Math.max(1, Math.min(o.gridCols, w - 2));
  const rows = Math.max(1, Math.min(o.gridRows, h - 2));
  const cellW = w / cols;
  const cellH = h / rows;
  const grid = new Float32Array(cols * rows);

  for (let y = 1; y < h - 1; y++) {
    const gridRow = Math.min(rows - 1, Math.floor(y / cellH));
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const gx = gray[idx + 1]! - gray[idx - 1]!;
      const gy = gray[idx + w]! - gray[idx - w]!;
      const mag = Math.abs(gx) + Math.abs(gy);
      const gridCol = Math.min(cols - 1, Math.floor(x / cellW));
      const gi = gridRow * cols + gridCol;
      grid[gi] = (grid[gi] ?? 0) + mag;
    }
  }

  let total = 0;
  let max = 0;
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i]!;
    total += v;
    if (v > max) max = v;
  }
  if (max <= 0) return null;
  const mean = total / grid.length;
  const threshold = Math.max(mean * 1.4, max * 0.12);

  let minCol = cols;
  let maxCol = -1;
  let minRow = rows;
  let maxRow = -1;
  let activeCells = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r * cols + c]! >= threshold) {
        activeCells++;
        if (c < minCol) minCol = c;
        if (c > maxCol) maxCol = c;
        if (r < minRow) minRow = r;
        if (r > maxRow) maxRow = r;
      }
    }
  }

  if (maxCol < 0 || maxRow < 0) return null;

  const areaRatio = activeCells / (cols * rows);
  // خلفية مشوشة بالكامل (خدوش/نقوش) — لا يمكن تمييز البطاقة بثقة، أفضل عدم الكشف
  if (areaRatio > o.maxAreaRatio) return null;
  // لا يوجد محتوى كافٍ (ربما لا يوجد نص واضح بعد) — لا نخاطر بكشف غير موثوق
  if (areaRatio < o.minAreaRatio) return null;

  let x0 = minCol / cols;
  let y0 = minRow / rows;
  let x1 = (maxCol + 1) / cols;
  let y1 = (maxRow + 1) / rows;

  const padX = (x1 - x0) * o.padding;
  const padY = (y1 - y0) * o.padding;
  x0 = clamp01(x0 - padX);
  y0 = clamp01(y0 - padY);
  x1 = clamp01(x1 + padX);
  y1 = clamp01(y1 + padY);

  const rectW = x1 - x0;
  const rectH = y1 - y0;
  if (rectW <= 0 || rectH <= 0) return null;

  return { x: x0, y: y0, w: rectW, h: rectH };
}
