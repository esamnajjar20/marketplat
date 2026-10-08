'use client';
import { reportBackgroundFailure } from '../../lib/backgroundTask';

/**
 * components/ads/ShareAdQrDialog.tsx
 *
 * Modal that renders a scannable QR holding the ad payload — the
 * receiving device opens /shared-ad offline and the data comes from
 * the URL fragment, no network on either side.
 *
 * Canvas is used (not SVG, not img) because the `qrcode` library's
 * toCanvas path is the most widely tested across Android WebView.
 * Rendering is async (library loads then paints); a spinner covers
 * the space until then so the modal doesn't jump.
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Copy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/shared/ui/Dialog';
import { Button } from '@/components/shared/ui/Button';
import {
  encodeSharedAd,
  buildSharedAdUrl,
  type SharedPayload,
} from '@/lib/shareQr';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: SharedPayload;
}

/** QR spec caps — beyond this, error correction M and a scannable
 *  width become mutually incompatible. Our caps in shareQr.ts keep
 *  the real payload well under this, but the check is here so a
 *  future shape change can't silently produce an unscannable code. */
const MAX_QR_CHARS = 2000;

export function ShareAdQrDialog({ open, onOpenChange, payload }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(false);
  const [tooLong, setTooLong] = useState(false);
  const [encoded, setEncoded] = useState('');
  // SHARE-QR-GUARD-01: surface render failures instead of a blank box.
  const [qrError, setQrError] = useState<string | null>(null);

  // Warm the qrcode chunk on mount so the first dialog open is instant
  // and never falls into a lazy-import race after a deploy.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    import('qrcode').catch((error) => reportBackgroundFailure('frontend/components/ads/ShareAdQrDialog.tsx', error));
  }, []);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    let cancelled = false;
    setBusy(true);
    setTooLong(false);
    setQrError(null);

    (async () => {
      try {
        const enc = encodeSharedAd(payload);
        if (cancelled) return;
        setEncoded(enc);

        const url = buildSharedAdUrl(
          typeof window !== 'undefined' ? window.location.origin : 'https://marketplat.example',
          enc,
        );
        if (url.length > MAX_QR_CHARS) {
          setTooLong(true);
          setBusy(false);
          return;
        }

        const QRCode = (await import('qrcode')).default;
        if (cancelled || !canvasRef.current) return;
        await QRCode.toCanvas(canvasRef.current, url, {
          errorCorrectionLevel: 'M',
          width: 260,
          margin: 2,
          color: { dark: '#111827', light: '#ffffff' },
        });
      } catch (err) {
        console.warn('[share-qr] render failed:', err);
        if (!cancelled) {
          setQrError(
            'تعذّر توليد الرمز — افتح التطبيق مرة أونلاين لتحديث الملفات',
          );
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, payload]);

  async function handleCopyLink() {
    try {
      const url = buildSharedAdUrl(
        typeof window !== 'undefined' ? window.location.origin : '',
        encoded,
      );
      await navigator.clipboard.writeText(url);
      toast.success('تم نسخ رابط المشاركة');
    } catch {
      toast.error('تعذّر نسخ الرابط');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>مشاركة بدون إنترنت</DialogTitle>
          <DialogDescription>
            اطلب من الشخص الآخر فتح الكاميرا أو تطبيق مسح الرموز، ثم توجيهها نحو هذا الرمز.
            لا يحتاج أي منكما اتصالاً بالإنترنت لفتح الإعلان.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          <div className="relative flex h-[280px] w-[280px] items-center justify-center rounded-xl border bg-white">
            {busy && (
              <span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </span>
            )}
            {qrError && !busy && (
              <span className="p-4 text-center text-xs text-destructive">
                {qrError}
              </span>
            )}
            {tooLong && !busy && (
              <span className="p-4 text-center text-xs text-destructive">
                الإعلان أطول من أن يُختصر في رمز QR. جرّب نسخ الرابط.
              </span>
            )}
            <canvas
              ref={canvasRef}
              width={260}
              height={260}
              className={busy || tooLong ? 'invisible' : 'block'}
            />
          </div>

          <p className="text-center text-xs text-muted-foreground">
            {encoded.length > 0 ? `${encoded.length} حرف` : '—'}
            {' · يعمل هذا الرمز حتى بدون إنترنت'}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full gap-1.5"
          onClick={handleCopyLink}
          disabled={!encoded}
        >
          <Copy className="h-4 w-4" />
          نسخ الرابط
        </Button>
      </DialogContent>
    </Dialog>
  );
}
