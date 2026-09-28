/**
 * __tests__/components/HomeTrustStrip.test.tsx
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeTrustStrip } from '@/components/home/HomeTrustStrip';

describe('HomeTrustStrip', () => {
  it('renders the three trust points', () => {
    render(<HomeTrustStrip />);
    expect(screen.getByText('محلي')).toBeInTheDocument();
    expect(screen.getByText('مباشر')).toBeInTheDocument();
    expect(screen.getByText('آمن')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('is labelled with the site name, not the latin brand', () => {
    render(<HomeTrustStrip />);
    expect(screen.getByRole('region', { name: 'لماذا سوق غزة' })).toBeInTheDocument();
  });
});
