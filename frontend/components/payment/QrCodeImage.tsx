'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  data: string;
  size?: number;
  className?: string;
  alt?: string;
}

/**
 * عرض QR بطريقتين متزامنتين لضمان الظهور داخل التطبيق:
 * 1) صورة مباشرة من خدمة مسموحة في CSP (api.qrserver.com)
 * 2) رسم محلي على Canvas كتعزيز / احتياطي
 */
export function QrCodeImage({
  data,
  size = 240,
  className,
  alt = 'رمز QR',
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgOk, setImgOk] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [canvasOk, setCanvasOk] = useState(false);

  const text = useMemo(() => (data ?? '').trim(), [data]);

  const imgSrc = useMemo(() => {
    if (!text) return null;
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(text)}`;
  }, [text, size]);

  const imgSrcAlt = useMemo(() => {
    if (!text) return null;
    return `https://quickchart.io/qr?text=${encodeURIComponent(text)}&size=${size}&margin=2`;
  }, [text, size]);

  // رسم محلي — لا يمنع ظهور صورة الـ img
  useEffect(() => {
    let cancelled = false;
    setCanvasOk(false);

    if (!text) return;

    let attempts = 0;

    const tryDraw = async () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        if (attempts++ < 30 && !cancelled) {
          requestAnimationFrame(() => {
            void tryDraw();
          });
        }
        return;
      }

      try {
        const mod = await import('@/lib/vendor/qrcode-generator.js');
        const qrcode = (mod as { default?: QrFactory }).default ?? (mod as unknown as QrFactory);
        if (typeof qrcode !== 'function') return;

        if (qrcode.stringToBytesFuncs?.['UTF-8']) {
          qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
        }

        let qr: QrInstance | null = null;
        for (const typeNum of [4, 5, 6, 8, 10, 12, 16, 20, 25, 30, 40]) {
          try {
            const c = qrcode(typeNum, 'M');
            c.addData(text, 'Byte');
            c.make();
            qr = c;
            break;
          } catch {
            /* try larger version */
          }
        }
        if (!qr || cancelled) return;

        const count = qr.getModuleCount();
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        const pixelSize = Math.max(size, Math.floor(size * dpr));
        canvas.width = pixelSize;
        canvas.height = pixelSize;
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pixelSize, pixelSize);
        const unit = pixelSize / count;
        ctx.fillStyle = '#0f172a';
        for (let row = 0; row < count; row++) {
          for (let col = 0; col < count; col++) {
            if (qr.isDark(row, col)) {
              ctx.fillRect(
                Math.floor(col * unit),
                Math.floor(row * unit),
                Math.ceil(unit) + 0.5,
                Math.ceil(unit) + 0.5,
              );
            }
          }
        }
        if (!cancelled) setCanvasOk(true);
      } catch {
        /* الصورة الاحتياطية تكفي */
      }
    };

    void tryDraw();
    return () => {
      cancelled = true;
    };
  }, [text, size]);

  useEffect(() => {
    setImgOk(false);
    setImgFailed(false);
  }, [imgSrc]);

  if (!text) {
    return (
      <p className="text-center text-xs text-muted-foreground">
        أدخل الاسم والرقم ليظهر رمز QR
      </p>
    );
  }

  const showCanvas = canvasOk;
  const showImg = !showCanvas && Boolean(imgSrc);

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      {/* محلي إن نجح */}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={alt}
        className={cn(
          'rounded-xl border border-border bg-white p-1 shadow-sm',
          !showCanvas && 'hidden',
        )}
        style={{ width: size, height: size, maxWidth: 'min(100%, 280px)' }}
      />

      {/* صورة مسموحة في CSP — تظهر فورًا إن فشل المحلي أو أثناء التحميل */}
      {showImg && imgSrc && !imgFailed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={imgSrc}
          src={imgSrc}
          width={size}
          height={size}
          alt={alt}
          className="rounded-xl border border-border bg-white p-2 shadow-sm"
          style={{ width: size, height: size, maxWidth: 'min(100%, 280px)' }}
          onLoad={() => setImgOk(true)}
          onError={() => {
            if (imgSrcAlt && imgSrc !== imgSrcAlt) {
              // سينتقل للمتصفح عبر استبدال src أدناه بمفتاح جديد
              setImgFailed(true);
            } else {
              setImgFailed(true);
            }
          }}
        />
      )}

      {showImg && imgFailed && imgSrcAlt && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgSrcAlt}
          width={size}
          height={size}
          alt={alt}
          className="rounded-xl border border-border bg-white p-2 shadow-sm"
          style={{ width: size, height: size, maxWidth: 'min(100%, 280px)' }}
          onLoad={() => setImgOk(true)}
        />
      )}

      {!showCanvas && !imgOk && !imgFailed && (
        <p className="text-xs text-muted-foreground">جاري إنشاء رمز QR…</p>
      )}
    </div>
  );
}

type QrInstance = {
  addData: (data: string, mode?: string) => void;
  make: () => void;
  getModuleCount: () => number;
  isDark: (row: number, col: number) => boolean;
};

type QrFactory = {
  (typeNumber: number, errorCorrectionLevel: string): QrInstance;
  stringToBytesFuncs: Record<string, (s: string) => number[]>;
  stringToBytes: (s: string) => number[];
};
