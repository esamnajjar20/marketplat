/**
 * __tests__/components/SkipLink.test.tsx
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkipLink } from '@/components/shared/a11y/SkipLink';

describe('SkipLink', () => {
  it('renders a skip-to-content link targeting #main-content', () => {
    render(<SkipLink />);

    const link = screen.getByRole('link', { name: 'تخطي إلى المحتوى الرئيسي' });
    expect(link).toHaveAttribute('href', '#main-content');
  });
});
