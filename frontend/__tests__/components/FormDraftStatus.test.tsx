import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormDraftStatus } from '@/components/shared/forms/FormDraftStatus';

describe('FormDraftStatus attachment retry', () => {
  it('offers an explicit retry when attachment persistence failed', () => {
    const onRetry = vi.fn();
    render(<FormDraftStatus savedAt={null} saveError="تعذّر حفظ الصور محليًا" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'إعادة حفظ الصور' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not show retry when no retry callback is provided', () => {
    render(<FormDraftStatus savedAt={null} saveError="تعذّر حفظ المسودة" />);
    expect(screen.queryByRole('button', { name: 'إعادة حفظ الصور' })).not.toBeInTheDocument();
  });
});
