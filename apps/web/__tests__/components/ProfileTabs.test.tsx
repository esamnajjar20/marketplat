/**
 * ProfileTabs — unified profile tab list.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { ProfileTabs } from '@/components/profile/ProfileTabs';

describe('ProfileTabs', () => {
  const available = [
    { value: 'overview' as const, label: 'نظرة عامة' },
    { value: 'ads' as const, label: 'الإعلانات' },
    { value: 'ratings' as const, label: 'التقييمات' },
  ];

  it('renders only the available tabs', () => {
    render(<ProfileTabs value="overview" onChange={vi.fn()} available={available} />);
    expect(screen.getByRole('tab', { name: 'نظرة عامة' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'الإعلانات' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'المتجر' })).not.toBeInTheDocument();
  });

  it('marks the active tab with aria-selected', () => {
    render(<ProfileTabs value="ads" onChange={vi.fn()} available={available} />);
    expect(screen.getByRole('tab', { name: 'الإعلانات' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'نظرة عامة' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('calls onChange with the tab value', async () => {
    const onChange = vi.fn();
    const user = setupUser();
    render(<ProfileTabs value="overview" onChange={onChange} available={available} />);
    await user.click(screen.getByRole('tab', { name: 'التقييمات' }));
    expect(onChange).toHaveBeenCalledWith('ratings');
  });
});
