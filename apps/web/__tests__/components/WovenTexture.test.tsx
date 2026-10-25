import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { WovenTexture } from '@/components/shared/ui/WovenTexture';

describe('WovenTexture', () => {
  it('renders aria-hidden decorative overlay', () => {
    const { container } = render(<WovenTexture opacity={0.07} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el.style.opacity || el.getAttribute('style')).toBeTruthy();
  });

  it('accepts 0.06 opacity and custom className', () => {
    const { container } = render(<WovenTexture opacity={0.06} className="extra" />);
    expect(container.firstElementChild?.className).toContain('extra');
  });
});
