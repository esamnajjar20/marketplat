'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import { useCreateServiceReview } from '@/hooks/mutations/useServiceReviewMutations';
import { cn } from '@/lib/utils';

interface Props {
  requestId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown for context, e.g. the listing title being reviewed. */
  listingTitle: string;
}

/**
 * ReviewServiceRequestDialog — Epic 3.2/3.3, modeled directly on
 * RateSellerDialog (same star-picker + optional-comment shape). Only
 * ever rendered for a request the caller owns as customer and that is
 * COMPLETED — see canReview in MyServiceRequestsList, which mirrors
 * service-reviews.service.ts's own guard (customer-only, COMPLETED-only,
 * once-only).
 */
export function ReviewServiceRequestDialog({ requestId, open, onOpenChange, listingTitle }: Props) {
  const [score, setScore] = useState(0);
  const [hoverScore, setHoverScore] = useState(0);
  const [comment, setComment] = useState('');
  const createReview = useCreateServiceReview();

  function handleSubmit() {
    if (score < 1) return;
    createReview.mutate(
      { requestId, score: score as 1 | 2 | 3 | 4 | 5, comment: comment.trim() || undefined },
      {
        onSuccess: () => {
          onOpenChange(false);
          setScore(0);
          setComment('');
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تقييم الخدمة</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground line-clamp-1">{listingTitle}</p>

          <div className="flex items-center justify-center gap-1" dir="ltr">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} نجوم`}
                onClick={() => setScore(n)}
                onMouseEnter={() => setHoverScore(n)}
                onMouseLeave={() => setHoverScore(0)}
                className="p-1"
              >
                <Star
                  className={cn(
                    'h-7 w-7 transition-colors',
                    n <= (hoverScore || score)
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-muted-foreground'
                  )}
                />
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="review-comment" className="text-sm font-medium">
              تعليق (اختياري)
            </label>
            <textarea
              id="review-comment"
              rows={3}
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="شاركنا تجربتك مع هذه الخدمة..."
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
            <p className="text-xs text-muted-foreground text-end">{comment.length}/500</p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSubmit} disabled={score < 1 || createReview.isPending}>
              {createReview.isPending ? 'جارٍ الإرسال…' : 'إرسال التقييم'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
