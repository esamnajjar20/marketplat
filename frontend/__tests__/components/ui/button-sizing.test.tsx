import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Button sizing contract', () => {
  it('uses shared design tokens for standard, compact, large and icon targets', () => {
    const { container } = render(
      <>
        <Button>Standard</Button>
        <Button size="sm">Compact</Button>
        <Button size="lg">Large</Button>
        <Button size="icon" aria-label="Close">×</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Standard' }).className).toContain('var(--control-height)');
    expect(screen.getByRole('button', { name: 'Compact' }).className).toContain('max-sm:min-h-[var(--control-height)]');
    expect(screen.getByRole('button', { name: 'Large' }).className).toContain('var(--control-height-lg)');
    expect(screen.getByRole('button', { name: 'Close' }).className).toContain('var(--touch-target)');
    expect(container.querySelectorAll('button')).toHaveLength(4);
  });
});
