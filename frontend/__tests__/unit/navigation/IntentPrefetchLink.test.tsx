import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';

const NO_PREFETCH = false;

vi.mock('next/link', async () => {
  const React = await import('react');
  type MockProps = ComponentProps<'a'> & { prefetch?: boolean | null };
  const MockNextLink = React.forwardRef<HTMLAnchorElement, MockProps>(
    function MockNextLink({ prefetch, ...props }, ref) {
      const value = prefetch === undefined ? 'default' : String(prefetch);
      return <a {...props} ref={ref} data-prefetch={value} />;
    },
  );
  return { default: MockNextLink };
});

describe('IntentPrefetchLink', () => {
  it('does not prefetch a disabled link until pointer hover', () => {
    render(
      <IntentPrefetchLink href="/target" prefetch={NO_PREFETCH}>
        Target
      </IntentPrefetchLink>,
    );

    const link = screen.getByRole('link', { name: 'Target' });
    expect(link).toHaveAttribute('data-prefetch', 'false');

    fireEvent.mouseEnter(link);
    expect(link).toHaveAttribute('data-prefetch', 'null');
  });

  it('enables prefetch when a keyboard user focuses the link', () => {
    render(
      <IntentPrefetchLink href="/target" prefetch={NO_PREFETCH}>
        Target
      </IntentPrefetchLink>,
    );

    const link = screen.getByRole('link', { name: 'Target' });
    fireEvent.focus(link);
    expect(link).toHaveAttribute('data-prefetch', 'null');
  });

  it('preserves consumer mouse-enter and focus callbacks', () => {
    const onMouseEnter = vi.fn();
    const onFocus = vi.fn();
    render(
      <IntentPrefetchLink
        href="/target"
        prefetch={NO_PREFETCH}
        onMouseEnter={onMouseEnter}
        onFocus={onFocus}
      >
        Target
      </IntentPrefetchLink>,
    );

    const link = screen.getByRole('link', { name: 'Target' });
    fireEvent.mouseEnter(link);
    fireEvent.focus(link);

    expect(onMouseEnter).toHaveBeenCalledOnce();
    expect(onFocus).toHaveBeenCalledOnce();
    expect(link).toHaveAttribute('data-prefetch', 'null');
  });

  it('does not prefetch links that open another browsing context', () => {
    render(
      <IntentPrefetchLink href="/target" target="_blank" prefetch={NO_PREFETCH}>
        External context
      </IntentPrefetchLink>,
    );

    const link = screen.getByRole('link', { name: 'External context' });
    fireEvent.mouseEnter(link);
    expect(link).toHaveAttribute('data-prefetch', 'false');
  });

  it('does not activate intent prefetch for downloads or non-navigation schemes', () => {
    const { rerender } = render(
      <IntentPrefetchLink href="/file" download prefetch={NO_PREFETCH}>
        Download
      </IntentPrefetchLink>,
    );
    let link = screen.getByRole('link', { name: 'Download' });
    fireEvent.mouseEnter(link);
    expect(link).toHaveAttribute('data-prefetch', 'false');

    rerender(
      <IntentPrefetchLink href="mailto:help@example.com" prefetch={NO_PREFETCH}>
        Email
      </IntentPrefetchLink>,
    );
    link = screen.getByRole('link', { name: 'Email' });
    fireEvent.mouseEnter(link);
    expect(link).toHaveAttribute('data-prefetch', 'false');

    rerender(
      <IntentPrefetchLink href="#details" prefetch={NO_PREFETCH}>
        Details
      </IntentPrefetchLink>,
    );
    link = screen.getByRole('link', { name: 'Details' });
    fireEvent.mouseEnter(link);
    expect(link).toHaveAttribute('data-prefetch', 'false');
  });

  it('does not carry hover intent across a changed href', () => {
    const { rerender } = render(
      <IntentPrefetchLink href="/first" prefetch={NO_PREFETCH}>
        Destination
      </IntentPrefetchLink>,
    );

    const link = screen.getByRole('link', { name: 'Destination' });
    fireEvent.mouseEnter(link);
    expect(link).toHaveAttribute('data-prefetch', 'null');

    rerender(
      <IntentPrefetchLink href="/second" prefetch={NO_PREFETCH}>
        Destination
      </IntentPrefetchLink>,
    );
    expect(screen.getByRole('link', { name: 'Destination' })).toHaveAttribute('data-prefetch', 'false');
  });

  it('preserves the standard Next.js default for links without an explicit opt-out', () => {
    render(<IntentPrefetchLink href="/default">Default</IntentPrefetchLink>);
    expect(screen.getByRole('link', { name: 'Default' })).toHaveAttribute('data-prefetch', 'default');
  });
});
