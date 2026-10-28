/**
 * BroadcastNotificationButton — admin bulk notification.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { BroadcastNotificationButton } from '@/components/admin/BroadcastNotificationButton';
import { useAdminBroadcastNotification } from '@/hooks/mutations/useAdminMutations';
import { toast } from 'sonner';

vi.mock('@/hooks/mutations/useAdminMutations', () => ({
  useAdminBroadcastNotification: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockMutate = vi.fn();

describe('BroadcastNotificationButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAdminBroadcastNotification).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as never);
  });

  it('opens the form dialog', async () => {
    const user = setupUser();
    render(<BroadcastNotificationButton />);
    await user.click(screen.getByRole('button', { name: /إرسال إشعار جماعي/ }));
    expect(screen.getByText(/سيصل هذا الإشعار إلى جميع المستخدمين/)).toBeInTheDocument();
  });

  it('toasts when title is empty', async () => {
    const user = setupUser();
    render(<BroadcastNotificationButton />);
    await user.click(screen.getByRole('button', { name: /إرسال إشعار جماعي/ }));
    await user.click(screen.getByRole('button', { name: /إرسال|متابعة|تأكيد/i }));
    expect(toast.error).toHaveBeenCalledWith('عنوان الإشعار مطلوب');
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('opens confirm after valid title and body', async () => {
    const user = setupUser();
    render(<BroadcastNotificationButton />);
    await user.click(screen.getByRole('button', { name: /إرسال إشعار جماعي/ }));
    const inputs = screen.getAllByRole('textbox');
    await user.type(inputs[0]!, 'عنوان تجريبي');
    await user.type(inputs[1]!, 'نص الإشعار هنا');
    // Submit form (exact "إرسال" in dialog footer — not the outer trigger)
    const submitButtons = screen.getAllByRole('button', { name: 'إرسال' });
    await user.click(submitButtons[submitButtons.length - 1]!);
    expect(screen.getByText('تأكيد الإرسال')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إرسال للجميع' })).toBeInTheDocument();
  });
});
