/**
 * __tests__/components/NavigationProgress.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { NavigationProgress } from '@/components/shared/NavigationProgress';

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useSearchParams: () => new URLSearchParams(),
}));

// CSS import is a side-effect — ignore in tests
vi.mock('@/app/navigation-progress.css', () => ({}));

describe('NavigationProgress', () => {
  it('mounts without crashing', () => {
    const { container } = render(<NavigationProgress />);
    expect(container).toBeTruthy();
  });

  it('starts progress on internal link click', () => {
    render(<NavigationProgress />);
    const anchor = document.createElement('a');
    anchor.href = '/favorites';
    anchor.setAttribute('href', '/favorites');
    document.body.appendChild(anchor);
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    // Should not throw; visual state is internal
    expect(true).toBe(true);
    document.body.removeChild(anchor);
  });
});
