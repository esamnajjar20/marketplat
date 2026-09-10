/**
 * __tests__/components/DataSaverToggle.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { DataSaverToggle } from '@/components/shared/DataSaverToggle';
import { useDataSaver } from '@/hooks/useDataSaver';

vi.mock('@/hooks/useDataSaver', () => ({
  useDataSaver: vi.fn(),
}));

describe('DataSaverToggle', () => {
  const setEnabled = vi.fn();

  beforeEach(() => {
    setEnabled.mockReset();
    vi.mocked(useDataSaver).mockReturnValue({
      enabled: false,
      setEnabled,
    });
  });

  it('renders label and description', () => {
    render(<DataSaverToggle />);
    expect(screen.getByText('توفير البيانات')).toBeInTheDocument();
    expect(screen.getByText(/صور أصغر/)).toBeInTheDocument();
  });

  it('reflects aria-checked from enabled state', () => {
    render(<DataSaverToggle />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('toggles on click', async () => {
    const user = setupUser();
    render(<DataSaverToggle />);
    await user.click(screen.getByRole('switch'));
    expect(setEnabled).toHaveBeenCalledWith(true);
  });

  it('shows checked when enabled', () => {
    vi.mocked(useDataSaver).mockReturnValue({ enabled: true, setEnabled });
    render(<DataSaverToggle />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });
});
