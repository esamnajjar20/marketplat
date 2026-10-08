'use client';

/**
 * ShareAdButton — مشاركة عبر واتساب / تيليجرام / نسخ الرابط.
 *
 * الاسم الموحّد عبر المنصة: استورد `ShareButton` من
 * `@/components/shared/ShareButton` (يعيد تصدير هذا المكوّن).
 * يُستخدم للإعلانات والمنتجات والخدمات والمتاجر.
 *
 * WhatsApp is the dominant sharing channel for classifieds in Gaza, so it
 * gets top billing over the generic Web Share API. We still keep a native
 * share entry point on platforms that support it (mainly mobile Safari),
 * but as one option in the dropdown rather than the only path — the old
 * behavior tried `navigator.share` first and only fell back to copy-link,
 * which meant desktop users (no navigator.share) got copy-link and never
 * saw the WhatsApp/Telegram deep links that actually drive traffic here.
 */

import { useEffect, useRef, useState } from 'react';
import { Share2, MessageCircle, Send, Link2, Check, QrCode } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/shared/ui/DropdownMenu';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { nativeShare, canNativeShare } from '@/lib/capacitor/nativeShare';
import { ShareAdQrDialog } from './ShareAdQrDialog';
import type { SharedPayload } from '@/lib/shareQr';

interface Props {
  title: string;
  /** Absolute URL to share. Falls back to the current page URL if omitted. */
  url?: string;
  variant?: 'icon' | 'button';
  className?: string;
  /**
   * SHARE-QR-MENU-01: optional ad payload. When present, the menu
   * gains a 'مشاركة QR (بدون نت)' entry that opens a scannable code
   * with the data packed into the URL fragment. Callers that only
   * share a link (product/store headers etc.) can omit it.
   */
  qrPayload?: SharedPayload;
}

export function ShareAdButton({ title, url, variant = 'icon', className, qrPayload }: Props) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  function getUrl() {
    return url ?? (typeof window !== 'undefined' ? window.location.href : '');
  }

  function handleWhatsApp() {
    const shareUrl = getUrl();
    const text = encodeURIComponent(`${title}\n${shareUrl}`);
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  }

  function handleTelegram() {
    const shareUrl = getUrl();
    const params = new URLSearchParams({ url: shareUrl, text: title });
    window.open(`https://t.me/share/url?${params.toString()}`, '_blank', 'noopener,noreferrer');
  }

  async function handleCopyLink() {
    const shareUrl = getUrl();
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('تم نسخ الرابط');
      // track + clear on unmount.
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('تعذّر نسخ الرابط');
    }
  }

  async function handleNativeShare() {
    // NEW: goes through @capacitor/share inside the native shell (see
    // lib/capacitor/nativeShare.ts's header for why navigator.share
    // alone isn't reliable in an Android WebView), falls back to
    // navigator.share on plain web — same silent-cancel behavior as
    // before either way.
    await nativeShare({ title, url: getUrl() });
  }

  // NEW: async because it now also checks Capacitor.isNativePlatform();
  // starts hidden and reveals itself once resolved, instead of the
  // previous synchronous navigator.share check.
  const [hasNativeShare, setHasNativeShare] = useState(false);
  useEffect(() => {
    void canNativeShare()
      .then(setHasNativeShare)
      .catch(() => { /* UNHANDLED-CATCH-FIX — capability probe; fallback to web share */ });
  }, []);

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'icon' ? (
          <Button variant="ghost" size="icon" aria-label="مشاركة" className={className}>
            <Share2 className="h-5 w-5" />
          </Button>
        ) : (
          <Button variant="outline" className={cn('gap-2', className)}>
            <Share2 className="h-4 w-4" /> مشاركة
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {qrPayload && (
          <DropdownMenuItem
            onClick={() => setQrOpen(true)}
            className="gap-2 cursor-pointer"
          >
            <QrCode className="h-4 w-4 text-primary" /> مشاركة QR (بدون نت)
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleWhatsApp} className="gap-2 cursor-pointer">
          <MessageCircle className="h-4 w-4 text-[#25D366]" /> واتساب
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleTelegram} className="gap-2 cursor-pointer">
          <Send className="h-4 w-4 text-[#26A5E4]" /> تيليجرام
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopyLink} className="gap-2 cursor-pointer">
          {copied ? <Check className="h-4 w-4 text-success" /> : <Link2 className="h-4 w-4" />}
          نسخ الرابط
        </DropdownMenuItem>
        {hasNativeShare && (
          <DropdownMenuItem onClick={handleNativeShare} className="gap-2 cursor-pointer">
            <Share2 className="h-4 w-4" /> مشاركة عبر...
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
    {qrPayload && (
      <ShareAdQrDialog open={qrOpen} onOpenChange={setQrOpen} payload={qrPayload} />
    )}
    </>
  );
}

/** @deprecated استخدم ShareButton من shared — نفس المكوّن */
export { ShareAdButton as ShareButton };
