'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';

export default function ProductDetailError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="container mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center">
      <AlertTriangle className="h-10 w-10 text-muted-foreground" />
      <h1 className="text-lg font-semibold">حدث خطأ أثناء عرض المنتج</h1>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={reset}>
          إعادة المحاولة
        </Button>
        <Button asChild>
          <Link href={ROUTES.home}>الرئيسية</Link>
        </Button>
      </div>
    </div>
  );
}
