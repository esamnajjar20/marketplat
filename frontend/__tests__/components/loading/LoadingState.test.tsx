import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingState } from '@/components/shared/feedback/LoadingState';
import { RouteLoadingState } from '@/components/shared/RouteLoadingState';

describe('LoadingState', () => {
  it('provides one accessible status region for page loading', () => {
    render(<LoadingState variant="page" label="جارٍ فتح الصفحة…" description="نجهّز المحتوى…" />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByText('جارٍ فتح الصفحة…')).toBeInTheDocument();
    expect(screen.getByText('نجهّز المحتوى…')).toBeInTheDocument();
  });

  it('supports inline loading with a single accessible status region', () => {
    render(<LoadingState variant="inline" label="جارٍ الحفظ…" />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByText('جارٍ الحفظ…')).toBeInTheDocument();
  });

  it('keeps the accessible label when the visible label is hidden', () => {
    render(<LoadingState variant="inline" label="جارٍ التحديث…" hideLabel />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'جارٍ التحديث…');
    expect(screen.queryByText('جارٍ التحديث…')).not.toBeInTheDocument();
  });
});

describe('RouteLoadingState', () => {
  it('uses the shared page loading presentation', () => {
    render(<RouteLoadingState />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByText('جارٍ فتح الصفحة…')).toBeInTheDocument();
  });
});
