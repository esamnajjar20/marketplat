import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { OfflineStaleDataNotice } from '@/components/shared/feedback/OfflineStaleDataNotice';

describe('OfflineStaleDataNotice', () => {
  it('explains that the visible data may be stale', () => {
    render(<OfflineStaleDataNotice />);
    expect(screen.getByRole('status')).toHaveTextContent('تعذّر تحديث البيانات');
    expect(screen.getByRole('status')).toHaveTextContent('قد لا تكون الأحدث');
  });

  it('allows a manual retry and disables it while fetching', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<OfflineStaleDataNotice onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(<OfflineStaleDataNotice onRetry={onRetry} isFetching />);
    expect(screen.getByRole('button', { name: 'جارٍ التحديث…' })).toBeDisabled();
  });
});
