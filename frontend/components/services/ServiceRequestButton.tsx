'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import { useCreateServiceRequest } from '@/hooks/mutations/useServiceRequestMutations';
import { useAuthStore, selectIsAuthenticated, selectUser } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import { toast } from 'sonner';

interface Props {
  listingId: string;
  providerAvailability?: 'AVAILABLE' | 'BUSY' | 'UNAVAILABLE';
  /** Owning provider's userId — used only to hide the button on one's own listing. */
  providerUserId: string;
}

const MIN_DETAILS_LENGTH = 10;
const MAX_DETAILS_LENGTH = 1000;

/**
 * Customer CTA: request a service. S3 clarifies the path (login → describe → track).
 */
export function ServiceRequestButton({ listingId, providerUserId, providerAvailability = 'AVAILABLE' }: Props) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState('');
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const user = useAuthStore(selectUser);
  const router = useRouter();
  const createRequest = useCreateServiceRequest();

  if (user?.id === providerUserId) return null;

  if (providerAvailability === 'UNAVAILABLE') {
    return (
      <div className="rounded-xl border border-border/80 bg-muted/40 px-4 py-3 text-center" role="status">
        <p className="text-sm font-semibold">مقدم الخدمة غير متاح حاليًا</p>
        <p className="mt-1 text-xs text-muted-foreground">يمكنك حفظ الخدمة والعودة إليها لاحقًا عندما يصبح متاحًا.</p>
      </div>
    );
  }

  function handleOpen() {
    if (!isAuthenticated) {
      // SW-FIX-LOGIN-PARAM: see StickyContactBar's identical fix —
      // LoginForm reads `?from=`, not `?next=`.
      router.push(`${ROUTES.login}?from=${encodeURIComponent(ROUTES.serviceDetail(listingId))}`);
      return;
    }
    setOpen(true);
  }

  function handleSubmit() {
    if (details.trim().length < MIN_DETAILS_LENGTH) {
      toast.error(`الرجاء إدخال ${MIN_DETAILS_LENGTH} أحرف على الأقل`);
      return;
    }
    createRequest.mutate(
      { listingId, details: details.trim() },
      {
        onSuccess: () => {
          setOpen(false);
          setDetails('');
          toast.success('تم إرسال الطلب — تابع حالته من «طلباتي»', {
            action: {
              label: 'طلباتي',
              onClick: () => router.push(ROUTES.myServiceRequests),
            },
          });
        },
      },
    );
  }

  return (
    <>
      <Button onClick={handleOpen} className="w-full gap-1.5">
        <MessageSquarePlus className="h-4 w-4" />
        إرسال طلب لمقدم الخدمة
      </Button>
      <p className="text-2xs-tight text-muted-foreground text-center leading-relaxed">
        المسار: طلب → رد المقدّم → (اختياري) موعد → اكتمال الخدمة
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إرسال طلب خدمة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <ol className="list-decimal ps-4 text-xs text-muted-foreground space-y-1">
              <li>صف احتياجك بوضوح (مكان، وقت، تفاصيل).</li>
              <li>المقدّم يرد بالقبول أو الرفض أو عرض سعر.</li>
              <li>يمكنك متابعة الحالة من صفحة طلباتي.</li>
            </ol>

            <div className="space-y-1.5">
              <label htmlFor="request-details" className="text-sm font-medium">
                وصّف اللي محتاجه بالتفصيل
              </label>
              <textarea
                id="request-details"
                rows={5}
                maxLength={MAX_DETAILS_LENGTH}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="مثال: بدي تصليح تسريب مي بالمطبخ، متوفر أيام الجمعة بعد الظهر..."
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
              <p className="text-xs text-muted-foreground text-end">
                {details.length}/{MAX_DETAILS_LENGTH}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={ROUTES.myServiceRequests}
                className="text-xs text-primary hover:underline"
                onClick={() => setOpen(false)}
              >
                عرض طلباتي السابقة
              </Link>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  إلغاء
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={details.trim().length < MIN_DETAILS_LENGTH || createRequest.isPending}
                >
                  {createRequest.isPending ? 'جارٍ الإرسال…' : 'إرسال الطلب'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
