import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DevErrorBoundary } from '@/components/shared/DevErrorBoundary';

function ThrowingComponent(): never {
  throw new Error('private error details');
}

describe('DevErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('shows a generic recovery message without sending or rendering error details', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <DevErrorBoundary label="public content">
        <ThrowingComponent />
      </DevErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('تعذّر تحميل هذا الجزء من الصفحة');
    expect(screen.queryByText('private error details')).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
