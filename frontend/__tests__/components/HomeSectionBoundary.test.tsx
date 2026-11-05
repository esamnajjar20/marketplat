import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { HomeSectionBoundary } from '@/components/home/HomeSectionBoundary';
import { reportClientError } from '@/lib/errorReporter';

vi.mock('@/lib/errorReporter', () => ({
  reportClientError: vi.fn(),
}));

function BrokenSection(): never {
  throw Object.assign(new Error('Failed to fetch dynamically imported module'), {
    name: 'ChunkLoadError',
  });
}

describe('HomeSectionBoundary', () => {
  const reload = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/', reload },
    });
  });

  it('contains a failed lazy section without replacing the homepage', () => {
    render(
      <>
        <div>بقية الصفحة</div>
        <HomeSectionBoundary>
          <BrokenSection />
        </HomeSectionBoundary>
      </>,
    );

    expect(screen.getByText('بقية الصفحة')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('تعذّر تحميل هذا القسم')).toBeInTheDocument();
    expect(reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ChunkLoadError' }),
      expect.objectContaining({ boundary: 'ErrorBoundary' }),
    );
  });

  it('reloads only after the visitor explicitly requests it', async () => {
    const user = setupUser();
    render(
      <HomeSectionBoundary>
        <BrokenSection />
      </HomeSectionBoundary>,
    );

    expect(reload).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'إعادة تحميل الصفحة' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
