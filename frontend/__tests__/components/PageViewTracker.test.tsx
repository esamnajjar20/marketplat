import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { PageViewTracker } from '@/components/shared/PageViewTracker';
const track = vi.fn();
vi.mock('@/lib/analytics', () => ({ track: (...a: unknown[]) => track(...a) }));
const usePathname = vi.fn();
vi.mock('next/navigation', () => ({ usePathname: () => usePathname(), useRouter: () => ({}), useSearchParams: () => new URLSearchParams(), redirect: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
describe('PageViewTracker', () => {
  it('tracks public paths', () => { usePathname.mockReturnValue('/ads/1'); render(<PageViewTracker />); expect(track).toHaveBeenCalledWith('PAGE_VIEW'); });
  it('skips admin', () => { usePathname.mockReturnValue('/admin/x'); render(<PageViewTracker />); expect(track).not.toHaveBeenCalled(); });
});
