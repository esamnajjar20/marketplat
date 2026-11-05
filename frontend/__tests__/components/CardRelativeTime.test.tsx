import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { formatRelativeTime } from '@/lib/formatters';
import { useNowAfterMount } from '@/components/shared/cards/useNowAfterMount';
import { CardRelativeTime } from '@/components/shared/cards/CardRelativeTime';

vi.mock('@/components/shared/cards/useNowAfterMount', () => ({
  useNowAfterMount: vi.fn(() => null),
}));

describe('CardRelativeTime', () => {
  beforeEach(() => {
    vi.mocked(useNowAfterMount).mockReturnValue(null);
  });

  it('renders the hydration-safe placeholder before the browser clock is available', () => {
    const { container } = render(<CardRelativeTime date="2026-01-01T00:00:00.000Z" />);
    expect(container.textContent).toBe('\u00A0');
  });

  it('renders the relative label once the shared browser clock is available', () => {
    const date = '2026-01-01T00:00:00.000Z';
    const now = Date.parse('2026-01-01T00:05:00.000Z');
    vi.mocked(useNowAfterMount).mockReturnValue(now);

    const { container } = render(<CardRelativeTime date={date} />);
    expect(container.textContent).toContain(formatRelativeTime(date, now));
  });
});
