'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import { useCreateSellerRating } from '@/hooks/mutations/useSellerMutations';
import { cn } from '@/lib/utils';

interface Props {
  sellerProfileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RateSellerDialog({ sellerProfileId, open, onOpenChange }: Props) {
  const [score, setScore] = useState(0);
  const [hoverScore, setHoverScore] = useState(0);
  const [comment, setComment] = useState('');
  const createRating = useCreateSellerRating(sellerProfileId);

  function handleSubmit() {
    if (score < 1) return;
    createRating.mutate(
      { score: score as 1 | 2 | 3 | 4 | 5, comment: comment.trim() || undefined },
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
          <DialogTitle>تقييم البائع</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center justify-center gap-1" dir="ltr">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                aria-label={`${n} نجوم`}
                onClick={() => setScore(n)}
                onMouseEnter={() => setHoverScore(n)}
                onMouseLeave={() => setHoverScore(0)}
                className="p-2.5"
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
            <label htmlFor="rating-comment" className="text-sm font-medium">
              تعليق (اختياري)
            </label>
            <textarea
              id="rating-comment"
              rows={3}
              maxLength={500}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="شاركنا تجربتك مع هذا البائع..."
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
            <p className="text-xs text-muted-foreground text-end">{comment.length}/500</p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSubmit} disabled={score < 1 || createRating.isPending}>
              {createRating.isPending ? 'جارٍ الإرسال…' : 'إرسال التقييم'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
