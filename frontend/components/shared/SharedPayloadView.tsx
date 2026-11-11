'use client';

/**
 * components/shared/SharedPayloadView.tsx
 *
 * Reads the shared payload from `location.hash`, decodes it, and
 * renders a compact card. Works offline — the page is warmed in
 * CORE_ROUTES, no network is touched for the payload.
 */
import { useEffect, useState } from 'react';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { AlertTriangle, MapPin, Package, Store, Tag, Wrench } from 'lucide-react';
import type { Home } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import {
  decodeSharedPayload,
  readEncodedFromHash,
  KIND_LABEL,
  type SharedPayload,
  type SharedKind,
} from '@/lib/shareQr';
import { formatPrice } from '@/lib/formatters';

const KIND_ICON: Record<SharedKind, typeof Home> = {
  ad: Tag,
  product: Package,
  service: Wrench,
  store: Store,
};

type State =
  | { status: 'loading' }
  | { status: 'ok'; payload: SharedPayload }
  | { status: 'empty' }
  | { status: 'invalid' };

export function SharedPayloadView() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const enc = readEncodedFromHash(window.location.hash);
    if (!enc) {
      setState({ status: 'empty' });
      return;
    }
    const payload = decodeSharedPayload(enc);
    if (!payload) {
      setState({ status: 'invalid' });
      return;
    }
    setState({ status: 'ok', payload });
  }, []);

  if (state.status === 'loading') {
    return <p className="py-12 text-center text-sm text-muted-foreground">جارٍ الفتح…</p>;
  }

  if (state.status === 'empty') {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="font-medium">لا توجد بيانات في هذا الرابط</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          هذا الرابط لا يحتوي على رمز QR لمشاركة إعلان أو منتج.
          اطلب من المرسل إعادة المشاركة.
        </p>
        <Button asChild variant="outline">
          <IntentPrefetchLink href="/" prefetch={false}>الرئيسية</IntentPrefetchLink>
        </Button>
      </div>
    );
  }

  if (state.status === 'invalid') {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <p className="font-medium text-destructive">تعذّر قراءة الرمز</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          قد يكون الرمز تالفاً أو صُنع بنسخة أحدث من التطبيق.
          اطلب من المرسل إعادة توليد الرمز.
        </p>
        <Button asChild variant="outline">
          <IntentPrefetchLink href="/" prefetch={false}>الرئيسية</IntentPrefetchLink>
        </Button>
      </div>
    );
  }

  const { payload } = state;
  const Icon = KIND_ICON[payload.kind];

  return (
    <div className="space-y-4">
      <div role="note" aria-label="بطاقة غير موثّقة" className="flex items-start gap-2 rounded-xl border border-warning/35 bg-warning-soft px-3 py-3 text-sm text-warning-strong dark:text-warning">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
        <p>بطاقة غير موثّقة وقابلة للتزوير. العنوان والسعر والتفاصيل مصدرها رمز QR ويمكن تعديلها؛ لا تتواصل مع أي طرف ولا تدفع بناءً عليها. افتح الإعلان الأصلي من السوق للتحقق.</p>
      </div>

      <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <Badge variant="outline" className="text-xs">
              {KIND_LABEL[payload.kind]}
            </Badge>
          </div>
        </div>

        <h1 className="text-xl font-bold leading-snug">{payload.title}</h1>

        {payload.price != null && (
          <p className="text-2xl font-bold text-muted-foreground">
            <span className="mb-1 block text-xs font-semibold text-warning-strong dark:text-warning">سعر غير موثّق</span>
            {formatPrice(payload.price)}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          {payload.city && (
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {payload.city}
            </span>
          )}
          {payload.extra && <span>{payload.extra}</span>}
        </div>

        {payload.desc && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {payload.desc}
          </p>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        الصور وتفاصيل إضافية متاحة عند فتح الإعلان الأصلي مع اتصال بالإنترنت.
      </p>

      <Button asChild variant="outline" className="w-full">
        <IntentPrefetchLink href="/" prefetch={false}>تصفّح السوق</IntentPrefetchLink>
      </Button>
    </div>
  );
}
