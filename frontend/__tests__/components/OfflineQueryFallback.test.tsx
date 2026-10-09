import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { OfflineQueryFallback } from '@/components/shared/feedback/OfflineQueryFallback';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: vi.fn(() => true) }));

afterEach(() => { cleanup(); vi.mocked(useOnlineStatus).mockReturnValue(true); });

describe('OfflineQueryFallback', () => {
  it('keeps the normal fallback while online', () => {
    render(<OfflineQueryFallback fallback={<div>Loading skeleton</div>} />);
    expect(screen.getByText('Loading skeleton')).toBeInTheDocument();
    expect(screen.queryByText('هذه البيانات غير متاحة دون اتصال')).not.toBeInTheDocument();
  });

  it('replaces an endless loading fallback with a clear offline explanation', () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    render(<OfflineQueryFallback fallback={<div>Loading skeleton</div>} title="لا توجد نسخة محفوظة" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('لا توجد نسخة محفوظة')).toBeInTheDocument();
    expect(screen.queryByText('Loading skeleton')).not.toBeInTheDocument();
  });
});
