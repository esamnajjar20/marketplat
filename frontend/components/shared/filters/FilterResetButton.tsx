'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';

interface FilterResetButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}

/** Shared reset action for desktop filter panels and mobile sheets. */
export function FilterResetButton({ onClick, disabled = false, label = 'إعادة تعيين الفلاتر' }: FilterResetButtonProps) {
  return (
    <Button type="button" variant="outline" className="w-full text-sm" onClick={onClick} disabled={disabled}>
      <RotateCcw className="me-2 h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Button>
  );
}
