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
import { signalNavigationStart } from '@/components/shared/NavigationProgress';
import { toast } from 'sonner';
import { SuccessCard } from '@/components/shared/feedback/SuccessCard';

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
  const [sent, setSent] = useState(false);
  const [details, setDetails] = useState('');
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const user = useAuthStore(selectUser);
  const router = useRouter();
  const createRequest = useCreateServiceRequest();

  if (user?.id === providerUserId) return null;

  if (providerAvailability === 'UNAVAILABLE') {
    return (
      <div className="rounded-2xl border border-[#EBD7A8] bg-[#FBF0D9] px-4 py-3.5" role="status">
        <p className="text-[14px] font-extrabold text-[#5A3705]">مقدم الخدمة غير متاح حاليًا</p>
        <p className="mt-1 text-[12px] leading-relaxed text-[#5A3705]/90">
          يمكنك حفظ الخدمة والعودة إليها لاحقًا عندما يصبح متاحًا.
        </p>
      </div>
    );
  }

  function handleOpen() {
    if (!isAuthenticated) {
      // see StickyContactBar's identical fix —
      // LoginForm reads `?from=`, not `?next=`.
      signalNavigationStart(`${ROUTES.login}?from=${encodeURIComponent(ROUTES.serviceDetail(listingId))}`);
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
          setDetails('');
          setSent(true);
          toast.success('تم إرسال الطلب', {
            description: 'تابع حالته من «طلباتي».',
            action: {
              label: 'طلباتي',
              onClick: () => {
                signalNavigationStart(ROUTES.myServiceRequests);
                router.push(ROUTES.myServiceRequests);
              },
            },
          });
        },
      },
    );
  }

  return (
    <>
      <Button onClick={handleOpen} className="h-11 w-full gap-1.5 rounded-xl text-sm font-bold">
        <MessageSquarePlus className="h-4 w-4" />
        إرسال طلب لمقدم الخدمة
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSent(false); }}>
        <DialogContent className="rounded-2xl border border-[#EAE3D6] bg-[#FBF9F4] p-0 gap-0 overflow-hidden sm:max-w-md">
          <DialogHeader className="px-4 pt-4 pb-0">
            <DialogTitle className="text-[17px] font-extrabold text-[#2A241D]">
              {sent ? 'تم إرسال الطلب' : 'إرسال طلب خدمة'}
            </DialogTitle>
          </DialogHeader>
          {sent ? (
            <div className="px-4 pb-4 pt-2">
              <SuccessCard
                title="تم إرسال الطلب"
                description="تابع حالته من «طلباتي»."
                singleAction
                primaryAction={
                  <Button
                    className="h-11 w-full rounded-xl font-bold"
                    onClick={() => {
                      setOpen(false);
                      setSent(false);
                      signalNavigationStart(ROUTES.myServiceRequests);
                      router.push(ROUTES.myServiceRequests);
                    }}
                  >
                    طلباتي
                  </Button>
                }
              />
            </div>
          ) : (
          <div className="space-y-3.5 px-4 pb-4 pt-2">
            <p className="text-[12px] leading-relaxed text-[#6B6459]">
              المسار: طلب ← رد المقدّم ← (اختياري) موعد ← اكتمال الخدمة
            </p>
            <ul className="space-y-1 text-[12px] leading-relaxed text-[#4A433A]">
              <li>• صف احتياجك بوضوح (مكان، وقت، تفاصيل).</li>
              <li>• المقدّم يرد بالقبول أو الرفض أو عرض سعر.</li>
              <li>• يمكنك متابعة الحالة من صفحة طلباتي.</li>
            </ul>

            <div className="space-y-1.5">
              <label htmlFor="request-details" className="text-[13px] font-bold text-[#2A241D]">
                وصّف اللي محتاجه بالتفصيل
              </label>
              <textarea
                id="request-details"
                rows={4}
                maxLength={MAX_DETAILS_LENGTH}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="مثال: بدي تصليح تسريب مي بالمطبخ، متوفر أيام الجمعة بعد الظهر..."
                className="w-full rounded-xl border border-[#D9D1C3] bg-white px-3.5 py-2.5 text-[13px] leading-relaxed text-[#2A241D] shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#397F56]/30 resize-none"
              />
            </div>

            <Link
              href={ROUTES.myServiceRequests}
              className="inline-block text-[13px] font-bold text-[#397F56] hover:underline"
              onClick={() => setOpen(false)}
            >
              عرض طلباتي السابقة
            </Link>

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                className="h-11 flex-1 rounded-xl border-[#EAE3D6] font-bold"
              >
                إلغاء
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={details.trim().length < MIN_DETAILS_LENGTH}
                loading={createRequest.isPending}
                loadingText="جارٍ الإرسال…"
                className="h-11 flex-[1.4] rounded-xl font-bold"
              >
                إرسال الطلب
              </Button>
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
