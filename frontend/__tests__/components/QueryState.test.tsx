/**
 * __tests__/components/QueryState.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { QueryState } from '@/components/shared/feedback/QueryState';

describe('QueryState', () => {
  it('shows loading spinner by default', () => {
    render(
      <QueryState isLoading>
        <p>content</p>
      </QueryState>,
    );
    expect(screen.queryByText('content')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/جارٍ التحميل/)).toBeInTheDocument();
  });

  it('shows custom loading fallback', () => {
    render(
      <QueryState isLoading loadingFallback={<div>skeleton</div>}>
        <p>content</p>
      </QueryState>,
    );
    expect(screen.getByText('skeleton')).toBeInTheDocument();
  });

  it('shows error with retry', async () => {
    const onRetry = vi.fn();
    const user = setupUser();
    render(
      <QueryState isError onRetry={onRetry}>
        <p>content</p>
      </QueryState>,
    );

    expect(screen.getByText('حدث خطأ')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /إعادة المحاولة/ }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('shows empty state', () => {
    render(
      <QueryState isEmpty emptyTitle="فارغ" emptyDescription="لا شيء هنا">
        <p>content</p>
      </QueryState>,
    );
    expect(screen.getByText('فارغ')).toBeInTheDocument();
    expect(screen.getByText('لا شيء هنا')).toBeInTheDocument();
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('renders children when healthy', () => {
    render(
      <QueryState>
        <p>hello</p>
      </QueryState>,
    );
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});
