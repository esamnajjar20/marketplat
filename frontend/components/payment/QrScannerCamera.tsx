'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

interface Props {
  onScan: (text: string) => void;
  /** عند نجاح تحليل ذكي للدفع */
  onPayParsed?: (result: PayParseResult) => void;
  /** عند نجاح تحليل ذكي للبطاقة */
  onCardParsed?: (result: CardParseResult) => void;
  /** تفضيل نوع التحليل */
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

/**
 * مسح أذكى: jsQR + BarcodeDetector + تحليل نص ذكي للاسم/الرقم/البطاقة.
 */
export function QrScannerCamera({
  onScan,
  onPayParsed,
  onCardParsed,
  prefer = 'auto',
  className,
  stopOnScan = true,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const lastScanRef = useRef('');
  const jsQRRef = useRef<JsQRFn | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [hint, setHint] = useState('وجّه الكاميرا نحو الرمز');
  const [scannedOnce, setScannedOnce] = useState(false);

  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  // تحميل jsQR مسبقًا
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
    (text: string) => {
      const t = text.trim();
      if (!t || t === lastScanRef.current) return;
      lastScanRef.current = t;
      setScannedOnce(true);
      setHint('تم القراءة — جاري التحليل الذكي…');

      onScan(t);

      const asCard =
        prefer === 'card' || (prefer === 'auto' && looksLikeCard(t));
      if (asCard && onCardParsed) {
        onCardParsed(smartParseCard(t));
      } else if (onPayParsed) {
        onPayParsed(smartParsePay(t));
      } else if (onCardParsed && asCard) {
        onCardParsed(smartParseCard(t));
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
    // 1) BarcodeDetector
    const detector = getBarcodeDetector();
    if (detector) {
      try {
        const codes = await detector.detect(ctx.canvas);
        if (codes[0]?.rawValue) return codes[0].rawValue;
      } catch {
        /* continue */
      }
    }
    // 2) jsQR على بيانات البكسل
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

  async function start() {
    setError(null);
    setStarting(true);
    setScannedOnce(false);
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
      setHint('ثبّت الرمز داخل الإطار');

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let frames = 0;

      const tick = async () => {
        if (!streamRef.current || !videoRef.current || !ctx) return;
        const v = videoRef.current;
        if (v.readyState >= 2) {
          const w = v.videoWidth || 640;
          const h = v.videoHeight || 480;
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(v, 0, 0, w, h);

          // كل إطارين لتقليل الحمل
          frames += 1;
          if (frames % 2 === 0) {
            const decoded = await decodeCanvas(ctx, w, h);
            if (decoded) {
              emitDecoded(decoded);
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

  async function onFile(file: File | null) {
    if (!file) return;
    setError(null);
    setHint('جاري قراءة الصورة…');
    try {
      const bmp = await createImageBitmap(file);
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

      // محاولة OCR خفيفة عبر قراءة نص بديلة غير متوفرة — نطلب صورة أوضح
      setError(
        'لم يُعثر على QR في الصورة. استخدم رمزًا أوضح أو تأكد من الإضاءة.',
      );
      setHint('حاول صورة أوضح');
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
              <div className="h-48 w-48 animate-pulse rounded-2xl border-2 border-emerald-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            <p className="absolute inset-x-0 bottom-2 text-center text-xs text-white drop-shadow">
              {hint}
            </p>
          </>
        )}
      </div>

      {error && <p className="text-center text-xs text-destructive">{error}</p>}
      {scannedOnce && (
        <p className="text-center text-xs font-medium text-emerald-600">
          تم المسح والتحليل الذكي
        </p>
      )}

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
    </div>
  );
}

// إعادة تصدير المحلّلات للتوافق مع الاستيرادات القديمة
export { smartParsePay as parsePayScan, smartParseCard as parseCardScan } from '@/lib/smartScanParse';
export type { PayParseResult, CardParseResult } from '@/lib/smartScanParse';
