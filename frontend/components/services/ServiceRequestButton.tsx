'use client';

import { useState } from 'react';
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
  /** Owning provider's userId — used only to hide the button on one's own listing. */
  providerUserId: string;
}

const MIN_DETAILS_LENGTH = 10;
const MAX_DETAILS_LENGTH = 1000;

/**
 * ServiceRequestButton — Epic 3.1. Was previously just a comment on
 * services/[id]/page.tsx ("سيُضاف في المرحلة 3"); the API client
 * (serviceRequestsApi) already existed and matched the backend exactly,
 * so this wires that client to real UI for the first time.
 */
export function ServiceRequestButton({ listingId, providerUserId }: Props) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState('');
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const user = useAuthStore(selectUser);
  const router = useRouter();
  const createRequest = useCreateServiceRequest();

  // A provider can't send a request to their own listing.
  if (user?.id === providerUserId) return null;

  function handleOpen() {
    if (!isAuthenticated) {
      router.push(`${ROUTES.login}?next=${encodeURIComponent(ROUTES.serviceDetail(listingId))}`);
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
        },
      }
    );
  }

  return (
    <>
      <Button onClick={handleOpen} className="w-full gap-1.5">
        <MessageSquarePlus className="h-4 w-4" />
        إرسال طلب لمقدم الخدمة
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إرسال طلب خدمة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
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

            <div className="flex justify-end gap-2">
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
        </DialogContent>
      </Dialog>
    </>
  );
}
