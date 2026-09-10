/**
 * __tests__/components/CopyField.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { CopyField } from '@/components/payment/CopyField';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('CopyField', () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it('renders the value', () => {
    render(<CopyField value="0599000000" label="الجوال" />);
    expect(screen.getByText('0599000000')).toBeInTheDocument();
    expect(screen.getByText('الجوال')).toBeInTheDocument();
  });

  it('copies value to clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    // Prefer spy on existing clipboard if present; otherwise define it
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText);
    } else {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });
    }

    const user = setupUser();
    render(<CopyField value="secret-code" label="الرمز" />);

    await user.click(screen.getByLabelText('نسخ الرمز'));

    // Success path: toast + visual check mark (lucide-check)
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('تم النسخ');
    });
    // Button still present; icon switches to check
    expect(screen.getByLabelText('نسخ الرمز').querySelector('.text-green-600')).toBeTruthy();
  });

  it('shows error toast when clipboard fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText);
    } else {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });
    }

    const user = setupUser();
    render(<CopyField value="x" label="حقل" />);

    await user.click(screen.getByLabelText('نسخ حقل'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
