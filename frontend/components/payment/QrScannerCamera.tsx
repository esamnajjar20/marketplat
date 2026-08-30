'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Camera, CameraOff, Loader2, ImagePlus, Sparkles } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { cn } from '@/lib/utils';
import {
  smartParsePay,
  smartParseCard,
  looksLikeCard,
  type PayParseResult,
  type CardParseResult,
} from '@/lib/smartScanParse';
import {
  ocrCardTextChecked,
  ocrCardMultiFrame,
  ocrCardFieldsFromGuide,
  ocrCardFieldsFromTightCrop,
  ocrPayMultiFrame,
  ocrPayFieldsFromGuide,
  ocrPayFieldsFromTightCrop,
  looksLikeOcrCard,
  isValidPayPhone,
} from '@/lib/ocrCardScan';

interface Props {
  onScan: (text: string, verified?: boolean, fieldDiff?: string | null) => void;
  onPayParsed?: (result: PayParseResult, verified: boolean) => void;
  onCardParsed?: (result: CardParseResult, verified: boolean) => void;
  prefer?: 'pay' | 'card' | 'auto';
  className?: string;
  stopOnScan?: boolean;
}

type JsQRFn = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts?: { inversionAttempts?: string },
) => { data: string } | null;

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

function getBarcodeDetector(): BarcodeDetectorLike | null {
  if (typeof window === 'undefined') return null;
  const BD = (window as unknown as {
    BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike;
  }).BarcodeDetector;
  if (!BD) return null;
  try {
    return new BD({ formats: ['qr_code', 'aztec', 'data_matrix'] });
  } catch {
    try {
      return new BD({ formats: ['qr_code'] });
    } catch {
      return null;
    }
  }
}

export function QrScannerCamera({
  onScan,
  onPayParsed,
  onCardParsed,
  prefer = 'auto',
  className,
  stopOnScan = true,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const lastScanRef = useRef('');
  const jsQRRef = useRef<JsQRFn | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [hint, setHint] = useState('وجّه الكاميرا نحو الرمز');
  const [scannedOnce, setScannedOnce] = useState(false);
  const [ocrUnverified, setOcrUnverified] = useState(false);
  const [ocrFieldDiff, setOcrFieldDiff] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [showOcrOption, setShowOcrOption] = useState(false);
  const noMatchFramesRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // إضافات جديدة
  const [qualityHint, setQualityHint] = useState<string | null>(null);
  const [autoCapture, setAutoCapture] = useState(false);
  const lastBlurRef = useRef(100);

  // --- قص يدوي لصورة مرفوعة ---
  const cropContainerRef = useRef<HTMLDivElement | null>(null);
  const cropCanvasSourceRef = useRef<HTMLCanvasElement | null>(null);
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [showCropUI, setShowCropUI] = useState(false);
  const [cropBusy, setCropBusy] = useState(false);
  const [cropRect, setCropRect] = useState({ x: 0.1, y: 0.35, w: 0.8, h: 0.3 });
  type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';
  const dragStateRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    startRect: { x: number; y: number; w: number; h: number };
  } | null>(null);

  const allowOcr = true;
  const preferPay = prefer === 'pay';
  const surfaceLabel = preferPay ? 'الورقة/الإيصال' : 'البطاقة';
  const useWideGuide = prefer === 'card' || prefer === 'pay';

  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
    setShowOcrOption(false);
    noMatchFramesRef.current = 0;
    setAutoCapture(false);
    setQualityHint(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    void import('@/lib/vendor/jsQR.js')
      .then((mod) => {
        const fn = (mod as { default?: JsQRFn }).default ?? (mod as unknown as JsQRFn);
        if (typeof fn === 'function') jsQRRef.current = fn;
      })
      .catch(() => {
        /* BarcodeDetector قد يكفي */
      });
  }, []);

  const emitDecoded = useCallback(
    (text: string, verified: boolean = true, alt?: string) => {
      const t = text.trim();
      if (!t || t === lastScanRef.current) return;
      lastScanRef.current = t;
      setScannedOnce(true);
      setOcrUnverified(!verified);

      const asCard =
        prefer === 'card' || (prefer === 'auto' && looksLikeCard(t));

      let fieldDiff: string | null = null;
      if (!verified && alt) {
        if (asCard) {
          const pA = smartParseCard(t);
          const pB = smartParseCard(alt);
          const diffs: string[] = [];
          if (pA.username !== pB.username) diffs.push(`اسم المستخدم: ${pA.username || '—'} أو ${pB.username || '—'}`);
          if (pA.password !== pB.password) diffs.push(`كلمة السر: ${pA.password || '—'} أو ${pB.password || '—'}`);
          fieldDiff = diffs.length ? diffs.join(' — ') : null;
        } else {
          const pA = smartParsePay(t);
          const pB = smartParsePay(alt);
          const diffs: string[] = [];
          if (pA.name !== pB.name) diffs.push(`الاسم: ${pA.name || '—'} أو ${pB.name || '—'}`);
          if (pA.number !== pB.number) diffs.push(`الرقم: ${pA.number || '—'} أو ${pB.number || '—'}`);
          fieldDiff = diffs.length ? diffs.join(' — ') : null;
        }
      }
      setOcrFieldDiff(fieldDiff);

      setHint(
        verified
          ? 'تم القراءة — جاري التحليل الذكي…'
          : 'تم القراءة لكن بتيقّن أقل — راجع البيانات مع الأصل',
      );

      onScan(t, verified, fieldDiff);

      if (asCard && onCardParsed) {
        onCardParsed(smartParseCard(t), verified);
      } else if (onPayParsed) {
        onPayParsed(smartParsePay(t), verified);
      }

      if (stopOnScan) stop();
    },
    [onScan, onPayParsed, onCardParsed, prefer, stop, stopOnScan],
  );

  async function decodeCanvas(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ): Promise<string | null> {
    const detector = getBarcodeDetector();
    if (detector) {
      try {
        const codes = await detector.detect(ctx.canvas);
        if (codes[0]?.rawValue) return codes[0].rawValue;
      } catch {
        /* continue */
      }
    }
    const jsQR = jsQRRef.current;
    if (jsQR) {
      try {
        const img = ctx.getImageData(0, 0, w, h);
        const r =
          jsQR(img.data, img.width, img.height, {
            inversionAttempts: 'attemptBoth',
          }) ??
          null;
        if (r?.data) return r.data;
      } catch {
        /* continue */
      }
    }
    return null;
  }

  type OcrOutcome =
    | { ok: true }
    | { ok: false; reason: 'unavailable'; message: string }
    | { ok: false; reason: 'no-match' };

  async function runOcr(canvas: HTMLCanvasElement, manualCrop = false): Promise<OcrOutcome> {
    setOcrBusy(true);
    setHint(
      preferPay
        ? 'لا يوجد رمز — جاري قراءة الاسم والرقم من الصورة…'
        : 'جاري قراءة البطاقة (عدة إطارات + مناطق الحقول)…',
    );
    try {
      if (manualCrop) {
        if (preferPay) {
          const once = await ocrPayFieldsFromTightCrop(canvas);
          if (!once.name && !once.phone) return { ok: false, reason: 'no-match' };
          emitDecoded(`${once.name}\n${once.phone}`.trim(), once.verified);
          return { ok: true };
        }
        const once = await ocrCardFieldsFromTightCrop(canvas);
        if (!once.username && !once.password) return { ok: false, reason: 'no-match' };
        emitDecoded(`${once.username}\n${once.password}`.trim(), once.verified);
        return { ok: true };
      }

      if (preferPay) {
        const fields = await ocrPayMultiFrame(
          () => captureGuideCropToCanvas() ?? canvas,
          3,
          100,
        );
        let name = fields.name;
        let phone = fields.phone;
        let verified = fields.verified;
        if (!name && !isValidPayPhone(phone)) {
          const once = await ocrPayFieldsFromGuide(canvas);
          name = once.name;
          phone = once.phone;
          verified = once.verified;
        }
        if (!name && !phone) {
          const { text, verified: v2, alt } = await ocrCardTextChecked(canvas, {
            whitelist: null,
          });
          if (text && looksLikeOcrCard(text)) {
            emitDecoded(text, v2, alt);
            return { ok: true };
          }
          return { ok: false, reason: 'no-match' };
        }
        const text = `${name}\n${phone}`.trim();
        emitDecoded(text, verified || isValidPayPhone(phone));
        return { ok: true };
      }

      const fields = await ocrCardMultiFrame(
        () => captureGuideCropToCanvas() ?? canvas,
        3,
        100,
      );
      let username = fields.username;
      let password = fields.password;
      let verified = fields.verified;
      if (!username && !password) {
        const once = await ocrCardFieldsFromGuide(canvas);
        username = once.username;
        password = once.password;
        verified = once.verified;
      }
      if (!username && !password) {
        return { ok: false, reason: 'no-match' };
      }
      const text = `${username}\n${password}`.trim();
      if (looksLikeOcrCard(text) || username || password) {
        emitDecoded(text, verified);
        return { ok: true };
      }
      return { ok: false, reason: 'no-match' };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'تعذّر تشغيل قارئ النص';
      return { ok: false, reason: 'unavailable', message };
    } finally {
      setOcrBusy(false);
    }
  }

  function applyOcrFailure(outcome: Extract<OcrOutcome, { ok: false }>) {
    if (outcome.reason === 'unavailable') {
      setError(`تعذّر تشغيل قارئ النص (OCR): ${outcome.message}`);
      setHint('تعذّر تشغيل قارئ النص — تحقق من الاتصال أو أدخل البيانات يدويًا');
    } else {
      setError(
        `لم أستطع قراءة بيانات واضحة من الصورة. قرّب الكاميرا أكثر من ${surfaceLabel} وتأكد من الإضاءة، أو أدخل البيانات يدويًا.`,
      );
      setHint('حاول تقريب الصورة أو الإدخال اليدوي');
    }
  }

  function captureFrameToCanvas(): HTMLCanvasElement | null {
    const v = videoRef.current;
    if (!v || v.readyState < 2) return null;
    const canvas = canvasRef.current ?? document.createElement('canvas');
    canvasRef.current = canvas;
    canvas.width = v.videoWidth || 640;
    canvas.height = v.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function captureGuideCropToCanvas(): HTMLCanvasElement | null {
    const v = videoRef.current;
    const guide = guideRef.current;
    if (!v || !guide || v.readyState < 2) return captureFrameToCanvas();

    const nativeW = v.videoWidth || 640;
    const nativeH = v.videoHeight || 480;
    const vRect = v.getBoundingClientRect();
    const gRect = guide.getBoundingClientRect();
    if (vRect.width <= 0 || vRect.height <= 0) return captureFrameToCanvas();

    const scale = Math.max(vRect.width / nativeW, vRect.height / nativeH);
    const renderedW = nativeW * scale;
    const renderedH = nativeH * scale;
    const offsetX = (renderedW - vRect.width) / 2;
    const offsetY = (renderedH - vRect.height) / 2;

    const guideLeftInContainer = gRect.left - vRect.left;
    const guideTopInContainer = gRect.top - vRect.top;

    const sx = Math.round((guideLeftInContainer + offsetX) / scale);
    const sy = Math.round((guideTopInContainer + offsetY) / scale);
    const sw = Math.round(gRect.width / scale);
    const sh = Math.round(gRect.height / scale);

    const clampedX = Math.max(0, Math.min(sx, nativeW - 1));
    const clampedY = Math.max(0, Math.min(sy, nativeH - 1));
    const clampedW = Math.max(1, Math.min(sw, nativeW - clampedX));
    const clampedH = Math.max(1, Math.min(sh, nativeH - clampedY));

    const canvas = document.createElement('canvas');
    canvas.width = clampedW;
    canvas.height = clampedH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return captureFrameToCanvas();
    ctx.drawImage(v, clampedX, clampedY, clampedW, clampedH, 0, 0, clampedW, clampedH);
    return canvas;
  }

  function analyzeFrameQuality(v: HTMLVideoElement): { brightness: number; blur: number } {
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth || 640;
    canvas.height = v.videoHeight || 480;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { brightness: 128, blur: 100 };
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

    let totalBrightness = 0;
    let edgeStrength = 0;
    const sampleStep = 4;
    let sampleCount = 0;
    for (let i = 0; i < data.length; i += sampleStep * 4) {
      totalBrightness += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      sampleCount++;
    }
    const brightness = totalBrightness / sampleCount;

    for (let y = 0; y < canvas.height; y += sampleStep) {
      for (let x = 0; x < canvas.width; x += sampleStep) {
        const idx = (y * canvas.width + x) * 4;
        const nextIdx = ((y + sampleStep) * canvas.width + x) * 4;
        const prevIdx = (y * canvas.width + (x + sampleStep)) * 4;
        edgeStrength += Math.abs(data[idx]! - data[nextIdx]!) + Math.abs(data[idx]! - data[prevIdx]!);
      }
    }
    const blur = edgeStrength / ((canvas.width * canvas.height) / (sampleStep * sampleStep));

    return { brightness, blur };
  }

  async function onManualOcr() {
    const canvas = captureGuideCropToCanvas();
    if (!canvas) return;
    const outcome = await runOcr(canvas);
    if (!outcome.ok) applyOcrFailure(outcome);
  }

  async function start() {
    setError(null);
    setStarting(true);
    setScannedOnce(false);
    setOcrUnverified(false);
    setOcrFieldDiff(null);
    lastScanRef.current = '';
    setHint('جاري تشغيل الكاميرا…');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('المتصفح لا يدعم الكاميرا');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('عنصر الفيديو غير جاهز');
      video.srcObject = stream;
      await video.play();
      setActive(true);
      setStarting(false);
      const skipQrSearch = prefer !== 'auto';
      setHint(
        skipQrSearch
          ? `لا يوجد رمز QR على ${surfaceLabel} — اضغط "قراءة النص" أدناه`
          : useWideGuide
            ? `ضع ${surfaceLabel} داخل الإطار`
            : 'ثبّت الرمز داخل الإطار',
      );
      setShowOcrOption(skipQrSearch && allowOcr);
      noMatchFramesRef.current = 0;
      setAutoCapture(false);
      setQualityHint(null);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let frames = 0;

      const tick = async () => {
        if (!streamRef.current || !videoRef.current || !ctx) return;
        const v = videoRef.current;
        if (v.readyState >= 2) {
          if (frames % 10 === 0) {
            const { brightness, blur } = analyzeFrameQuality(v);
            lastBlurRef.current = blur;
            if (brightness < 60) {
              setQualityHint('الإضاءة ضعيفة — حاول زيادة الإضاءة أو الاقتراب من البطاقة');
            } else if (blur > 30) {
              setQualityHint('الصورة غير واضحة — أثبّت الكاميرا وحاول التقريب');
            } else {
              setQualityHint(null);
            }
          }

          if (!skipQrSearch) {
            const w = v.videoWidth || 640;
            const h = v.videoHeight || 480;
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(v, 0, 0, w, h);

            frames += 1;
            if (frames % 2 === 0) {
              const decoded = await decodeCanvas(ctx, w, h);
              if (decoded) {
                emitDecoded(decoded);
                return;
              }
              noMatchFramesRef.current += 1;
              if (allowOcr && noMatchFramesRef.current === 45) {
                setShowOcrOption(true);
                setHint(`لا يوجد رمز QR على ${surfaceLabel}؟ اضغط "قراءة النص" أدناه`);
              }
            }
          } else {
            if (autoCapture && lastBlurRef.current < 15 && !ocrBusy) {
              setAutoCapture(false);
              void onManualOcr();
              return;
            }
          }
        }
        rafRef.current = requestAnimationFrame(() => {
          void tick();
        });
      };
      rafRef.current = requestAnimationFrame(() => {
        void tick();
      });
    } catch (e) {
      setStarting(false);
      setActive(false);
      const msg =
        e instanceof Error
          ? e.name === 'NotAllowedError'
            ? 'يرجى السماح بالوصول إلى الكاميرا'
            : e.message
          : 'تعذّر تشغيل الكاميرا';
      setError(msg);
      setHint('تعذّر فتح الكاميرا');
    }
  }

  function clamp01(n: number) {
    return Math.max(0, Math.min(1, n));
  }

  function cropSourceToCanvas(
    source: HTMLCanvasElement,
    rect: { x: number; y: number; w: number; h: number },
  ): HTMLCanvasElement | null {
    const sx = Math.round(rect.x * source.width);
    const sy = Math.round(rect.y * source.height);
    const sw = Math.max(1, Math.round(rect.w * source.width));
    const sh = Math.max(1, Math.round(rect.h * source.height));
    const out = document.createElement('canvas');
    out.width = sw;
    out.height = sh;
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    return out;
  }

  function pointerToNormalized(e: ReactPointerEvent) {
    const el = cropContainerRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: clamp01((e.clientX - r.left) / r.width),
      y: clamp01((e.clientY - r.top) / r.height),
    };
  }

  function onCropPointerDown(mode: DragMode, e: ReactPointerEvent) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = pointerToNormalized(e);
    dragStateRef.current = { mode, startX: p.x, startY: p.y, startRect: cropRect };
  }

  function onCropPointerMove(e: ReactPointerEvent) {
    const drag = dragStateRef.current;
    if (!drag) return;
    const p = pointerToNormalized(e);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    const s = drag.startRect;
    const minSize = 0.08;

    if (drag.mode === 'move') {
      const x = Math.max(0, Math.min(1 - s.w, s.x + dx));
      const y = Math.max(0, Math.min(1 - s.h, s.y + dy));
      setCropRect({ ...s, x, y });
      return;
    }

    let left = s.x;
    let top = s.y;
    let right = s.x + s.w;
    let bottom = s.y + s.h;
    if (drag.mode === 'nw') {
      left = clamp01(s.x + dx);
      top = clamp01(s.y + dy);
    } else if (drag.mode === 'ne') {
      right = clamp01(s.x + s.w + dx);
      top = clamp01(s.y + dy);
    } else if (drag.mode === 'sw') {
      left = clamp01(s.x + dx);
      bottom = clamp01(s.y + s.h + dy);
    } else if (drag.mode === 'se') {
      right = clamp01(s.x + s.w + dx);
      bottom = clamp01(s.y + s.h + dy);
    }
    if (right - left < minSize) {
      if (drag.mode === 'nw' || drag.mode === 'sw') left = right - minSize;
      else right = left + minSize;
    }
    if (bottom - top < minSize) {
      if (drag.mode === 'nw' || drag.mode === 'ne') top = bottom - minSize;
      else bottom = top + minSize;
    }
    setCropRect({ x: left, y: top, w: right - left, h: bottom - top });
  }

  function onCropPointerUp() {
    dragStateRef.current = null;
  }

  function cancelCrop() {
    setShowCropUI(false);
    setCropUrl(null);
    cropCanvasSourceRef.current = null;
    setError(null);
    setHint('اختر صورة أخرى أو افتح الكاميرا');
  }

  async function confirmCrop() {
    const source = cropCanvasSourceRef.current;
    if (!source) return;
    setCropBusy(true);
    try {
      const cropped = cropSourceToCanvas(source, cropRect);
      if (!cropped) {
        setError('تعذّر قص الصورة');
        return;
      }
      setHint('جاري قراءة النص من المنطقة المحددة…');
      const outcome = await runOcr(cropped, true);
      if (outcome.ok) {
        setShowCropUI(false);
        setCropUrl(null);
        cropCanvasSourceRef.current = null;
        return;
      }
      applyOcrFailure(outcome);
    } finally {
      setCropBusy(false);
    }
  }

  async function onFile(file: File | null) {
    if (!file) return;
    setError(null);
    setHint('جاري قراءة الصورة…');
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas');
      ctx.drawImage(bmp, 0, 0);

      const decoded = await decodeCanvas(ctx, canvas.width, canvas.height);
      if (decoded) {
        emitDecoded(decoded);
        return;
      }

      if (!allowOcr) {
        setError(`لم أجد رمز QR في الصورة. أدخل البيانات يدويًا.`);
        setHint('حاول صورة أوضح أو الإدخال اليدوي');
        return;
      }

      cropCanvasSourceRef.current = canvas;
      setCropRect({ x: 0.1, y: 0.35, w: 0.8, h: 0.3 });
      setCropUrl(canvas.toDataURL('image/jpeg', 0.92));
      setShowCropUI(true);
      setError(null);
      setHint(`لا يوجد رمز QR على ${surfaceLabel} — حدّد منطقة النص ثم اضغط "قص وقراءة"`);
    } catch {
      setError('تعذّر قراءة الملف');
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-center gap-1.5 text-xs text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        <span>مسح ذكي — QR + تحليل الاسم والرقم تلقائيًا</span>
      </div>

      {showCropUI && cropUrl ? (
        <div className="space-y-2">
          <p className="text-center text-xs font-medium text-primary">
            حدّد منطقة النص/الأرقام على {surfaceLabel} — اسحب الصندوق أو زواياه
          </p>
          <div
            ref={cropContainerRef}
            className="relative aspect-[3/4] max-h-[360px] w-full touch-none select-none overflow-hidden rounded-xl border bg-black"
            onPointerMove={onCropPointerMove}
            onPointerUp={onCropPointerUp}
            onPointerCancel={onCropPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cropUrl}
              alt="الصورة المرفوعة"
              className="absolute inset-0 h-full w-full object-contain"
              draggable={false}
            />
            <div className="pointer-events-none absolute inset-x-0 top-0 bg-black/55" style={{ height: `${cropRect.y * 100}%` }} />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55" style={{ height: `${(1 - cropRect.y - cropRect.h) * 100}%` }} />
            <div className="pointer-events-none absolute left-0 bg-black/55" style={{ top: `${cropRect.y * 100}%`, width: `${cropRect.x * 100}%`, height: `${cropRect.h * 100}%` }} />
            <div className="pointer-events-none absolute right-0 bg-black/55" style={{ top: `${cropRect.y * 100}%`, width: `${(1 - cropRect.x - cropRect.w) * 100}%`, height: `${cropRect.h * 100}%` }} />

            <div
              className="absolute cursor-move border-2 border-emerald-400"
              style={{
                left: `${cropRect.x * 100}%`,
                top: `${cropRect.y * 100}%`,
                width: `${cropRect.w * 100}%`,
                height: `${cropRect.h * 100}%`,
              }}
              onPointerDown={(e) => onCropPointerDown('move', e)}
            >
              {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                <div
                  key={corner}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onCropPointerDown(corner, e);
                  }}
                  className={cn(
                    'absolute h-6 w-6 rounded-full border-2 border-emerald-400 bg-white shadow',
                    corner === 'nw' && '-left-3 -top-3 cursor-nwse-resize',
                    corner === 'ne' && '-right-3 -top-3 cursor-nesw-resize',
                    corner === 'sw' && '-left-3 -bottom-3 cursor-nesw-resize',
                    corner === 'se' && '-right-3 -bottom-3 cursor-nwse-resize',
                  )}
                />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={cancelCrop} disabled={cropBusy}>
              إلغاء
            </Button>
            <Button type="button" className="flex-1 gap-2" onClick={() => void confirmCrop()} disabled={cropBusy}>
              {cropBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {cropBusy ? 'جاري القراءة…' : 'قص وقراءة'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="relative aspect-[3/4] max-h-[360px] overflow-hidden rounded-xl border bg-black">
          <video
            ref={videoRef}
            className={cn('h-full w-full object-cover', !active && 'opacity-0')}
            playsInline
            muted
            autoPlay
          />
          {!active && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/90 p-4 text-center">
              <Camera className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{hint}</p>
            </div>
          )}
          {active && (
            <>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  ref={guideRef}
                  className={cn(
                    'animate-pulse rounded-2xl border-2 border-emerald-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]',
                    useWideGuide ? 'h-28 w-[85%]' : 'h-48 w-48',
                  )}
                />
              </div>
              <p className="absolute inset-x-0 bottom-2 text-center text-xs text-white drop-shadow">
                {hint}
              </p>
              {qualityHint && (
                <p className="absolute inset-x-0 top-2 text-center text-xs text-yellow-300 drop-shadow">
                  {qualityHint}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {error && <p className="text-center text-xs text-destructive">{error}</p>}
      {scannedOnce && !ocrUnverified && (
        <p className="text-center text-xs font-medium text-emerald-600">
          تم المسح والتحليل الذكي
        </p>
      )}
      {scannedOnce && ocrUnverified && (
        <p className="text-center text-xs font-medium text-amber-600">
          {ocrFieldDiff
            ? `⚠️ اختلفت القراءتان بهذا الحقل تحديدًا — تحقق من البطاقة: ${ocrFieldDiff}`
            : `⚠️ القراءة غير مؤكدة (اختلفت بين محاولتين) — قارن الأرقام يدويًا مع ${surfaceLabel} قبل الحفظ`}
        </p>
      )}

      {active && showOcrOption && (
        <div className="space-y-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full gap-2"
            onClick={() => void onManualOcr()}
            disabled={ocrBusy}
          >
            {ocrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {ocrBusy ? 'جاري قراءة النص…' : `لا يوجد رمز على ${surfaceLabel} — قراءة النص`}
          </Button>
          {prefer !== 'auto' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setAutoCapture(!autoCapture)}
              disabled={ocrBusy}
            >
              {autoCapture ? 'إيقاف الالتقاط التلقائي' : 'تفعيل الالتقاط التلقائي (عند ثبات الصورة)'}
            </Button>
          )}
        </div>
      )}

      {!showCropUI && (
        <div className="flex flex-wrap gap-2">
          {!active ? (
            <Button
              type="button"
              className="flex-1 gap-2"
              onClick={() => void start()}
              disabled={starting}
            >
              {starting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
              {starting ? 'جاري الفتح…' : 'فتح الكاميرا — مسح ذكي'}
            </Button>
          ) : (
            <Button type="button" variant="outline" className="flex-1 gap-2" onClick={stop}>
              <CameraOff className="h-4 w-4" />
              إيقاف
            </Button>
          )}
          <label className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-muted">
            <ImagePlus className="h-4 w-4" />
            من صورة
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      )}
    </div>
  );
}

export { smartParsePay as parsePayScan, smartParseCard as parseCardScan } from '@/lib/smartScanParse';
export type { PayParseResult, CardParseResult } from '@/lib/smartScanParse';
