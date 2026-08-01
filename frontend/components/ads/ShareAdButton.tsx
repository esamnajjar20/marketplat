/**
 * ShareAdButton — share an ad via WhatsApp, Telegram, or a copied link.
 *
 * WhatsApp is the dominant sharing channel for classifieds in Gaza, so it
 * gets top billing over the generic Web Share API. We still keep a native
 * share entry point on platforms that support it (mainly mobile Safari),
 * but as one option in the dropdown rather than the only path — the old
 * behavior tried `navigator.share` first and only fell back to copy-link,
 * which meant desktop users (no navigator.share) got copy-link and never
 * saw the WhatsApp/Telegram deep links that actually drive traffic here.
 */
'use client';

import { useState } from 'react';
import { Share2, MessageCircle, Send, Link2, Check } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/shared/ui/DropdownMenu';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  /** Absolute URL to share. Falls back to the current page URL if omitted. */
  url?: string;
  variant?: 'icon' | 'button';
  className?: string;
}

export function ShareAdButton({ title, url, variant = 'icon', className }: Props) {
  const [copied, setCopied] = useState(false);

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
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('تعذّر نسخ الرابط');
    }
  }

  async function handleNativeShare() {
    const shareUrl = getUrl();
    try {
      await navigator.share({ title, url: shareUrl });
    } catch {
      // User cancelled the native share sheet — no error toast needed.
    }
  }

  const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
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
  );
}
