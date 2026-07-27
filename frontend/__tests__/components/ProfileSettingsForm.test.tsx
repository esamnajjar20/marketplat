/**
 * __tests__/components/ProfileSettingsForm.test.tsx
 *
 * Coverage targets (avatar upload section — report item #8):
 *  - Renders the current avatar and a "تغيير الصورة" button
 *  - Clicking the button opens the hidden file picker
 *  - Selecting a valid image file calls uploadAvatar.mutate with that file
 *  - Selecting an invalid file type shows an error toast, does NOT call mutate
 *  - Selecting an oversized file shows an error toast, does NOT call mutate
 *  - Button shows "جارٍ الرفع…" and is disabled while uploadAvatar is pending
 *  - Profile fields: name required validation, submit calls updateProfile.mutate
 *
 * FIX BUG-05: bio/phone now load from useMe() (GET /users/me) instead
 * of always starting blank — covered below alongside the pre-existing
 * name-only coverage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileSettingsForm } from '@/components/profile/ProfileSettingsForm';
import { useUpdateProfile, useUploadAvatar } from '@/hooks/mutations/useUpdateProfile';
import { useMe } from '@/hooks/queries/useAuth';
import { useAuthStore } from '@/store/auth.store';
import { toast } from 'sonner';
import type { User } from '@/types/user.types';

vi.mock('@/hooks/mutations/useUpdateProfile', () => ({
  useUpdateProfile: vi.fn(),
  useUploadAvatar: vi.fn(),
}));

vi.mock('@/hooks/queries/useAuth', () => ({
  useMe: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

const baseMe: User = {
  id: 'u1', name: 'أحمد', email: 'a@a.com', phone: null, city: null, bio: null,
  avatarUrl: null, role: 'USER', isActive: true,
  notificationPreferences: { newMessage: true, adViews: false, favAdUpdated: true, promotions: false },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockUpdateMutate = vi.fn();
const mockUploadMutate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (useUpdateProfile as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: mockUpdateMutate, isPending: false });
  (useUploadAvatar as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: mockUploadMutate, isPending: false });
  (useMe as ReturnType<typeof vi.fn>).mockReturnValue({ data: baseMe, isLoading: false });
  useAuthStore.getState().setAuth(
    { id: 'u1', name: 'أحمد', email: 'a@a.com', role: 'USER' },
    { accessToken: 'a' }, // PROD-FIX-15: refreshToken removed from AuthTokens
  );
});

describe('ProfileSettingsForm — avatar upload', () => {
  it('renders the "تغيير الصورة" button', () => {
    render(<ProfileSettingsForm />);
    expect(screen.getByRole('button', { name: 'تغيير الصورة' })).toBeInTheDocument();
  });

  it('clicking the button triggers the hidden file input', async () => {
    const user = userEvent.setup();
    const { container } = render(<ProfileSettingsForm />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');

    await user.click(screen.getByRole('button', { name: 'تغيير الصورة' }));
    expect(clickSpy).toHaveBeenCalled();
  });

  it('calls uploadAvatar.mutate with a valid JPEG file', async () => {
    const { container } = render(<ProfileSettingsForm />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = makeFile('photo.jpg', 'image/jpeg', 1024);

    fireEvent.change(input, { target: { files: [file] } });

    expect(mockUploadMutate).toHaveBeenCalledWith(file);
  });

  it('calls uploadAvatar.mutate with a valid WEBP file', async () => {
    const { container } = render(<ProfileSettingsForm />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = makeFile('photo.webp', 'image/webp', 1024);

    fireEvent.change(input, { target: { files: [file] } });

    expect(mockUploadMutate).toHaveBeenCalledWith(file);
  });

  it('rejects an unsupported file type with an error toast', async () => {
    const { container } = render(<ProfileSettingsForm />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = makeFile('document.pdf', 'application/pdf', 1024);

    fireEvent.change(input, { target: { files: [file] } });

    expect(toast.error).toHaveBeenCalledWith('نوع الصورة غير مدعوم (JPG، PNG، أو WEBP فقط)');
    expect(mockUploadMutate).not.toHaveBeenCalled();
  });

  it('rejects a file larger than MAX_FILE_SIZE_MB with an error toast', async () => {
    const { container } = render(<ProfileSettingsForm />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const oversized = makeFile('huge.jpg', 'image/jpeg', 10 * 1024 * 1024); // 10MB

    fireEvent.change(input, { target: { files: [oversized] } });

    expect(toast.error).toHaveBeenCalled();
    expect(mockUploadMutate).not.toHaveBeenCalled();
  });

  it('shows "جارٍ الرفع…" and disables the button while uploading', () => {
    (useUploadAvatar as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: mockUploadMutate, isPending: true });
    render(<ProfileSettingsForm />);
    const btn = screen.getByRole('button', { name: 'جارٍ الرفع…' });
    expect(btn).toBeDisabled();
  });

  it('shows the default label and is enabled when not uploading', () => {
    render(<ProfileSettingsForm />);
    const btn = screen.getByRole('button', { name: 'تغيير الصورة' });
    expect(btn).not.toBeDisabled();
  });
});

describe('ProfileSettingsForm — profile fields', () => {
  it('pre-fills the name field from the auth store', () => {
    render(<ProfileSettingsForm />);
    expect(screen.getByDisplayValue('أحمد')).toBeInTheDocument();
  });

  it('shows a validation error when submitting an empty name', async () => {
    const user = userEvent.setup();
    render(<ProfileSettingsForm />);

    const nameInput = screen.getByDisplayValue('أحمد');
    await user.clear(nameInput);
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));

    expect(screen.getByText('الاسم مطلوب')).toBeInTheDocument();
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  it('calls updateProfile.mutate with the trimmed name on valid submit', async () => {
    const user = userEvent.setup();
    render(<ProfileSettingsForm />);

    const nameInput = screen.getByDisplayValue('أحمد');
    await user.clear(nameInput);
    await user.type(nameInput, '  محمد  ');
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'محمد' }),
      expect.anything(),
    );
  });

  it('shows "جارٍ الحفظ…" and disables submit while updateProfile is pending', () => {
    (useUpdateProfile as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: mockUpdateMutate, isPending: true });
    render(<ProfileSettingsForm />);
    expect(screen.getByRole('button', { name: 'جارٍ الحفظ…' })).toBeDisabled();
  });
});

describe('ProfileSettingsForm — bio/phone load from useMe()', () => {
  it('shows a loading spinner while useMe() is still loading, instead of a blank form', () => {
    (useMe as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined, isLoading: true });
    render(<ProfileSettingsForm />);
    expect(screen.queryByRole('button', { name: 'حفظ التغييرات' })).not.toBeInTheDocument();
  });

  it('pre-fills bio and phone from the fetched profile, not blank', async () => {
    (useMe as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { ...baseMe, bio: 'مطور برمجيات', phone: '+970599123456' },
      isLoading: false,
    });
    render(<ProfileSettingsForm />);

    await waitFor(() => {
      expect(screen.getByDisplayValue('مطور برمجيات')).toBeInTheDocument();
      expect(screen.getByDisplayValue('+970599123456')).toBeInTheDocument();
    });
  });

  it('leaves bio and phone empty (not crashing) when the backend has them as null', async () => {
    (useMe as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { ...baseMe, bio: null, phone: null },
      isLoading: false,
    });
    render(<ProfileSettingsForm />);

    await waitFor(() => {
      expect(screen.getByLabelText('نبذة شخصية')).toHaveValue('');
      expect(screen.getByLabelText('رقم الهاتف')).toHaveValue('');
    });
  });

  it('submits the previously-saved bio/phone unchanged when the user only edits the name', async () => {
    (useMe as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { ...baseMe, bio: 'مطور برمجيات', phone: '+970599123456' },
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<ProfileSettingsForm />);

    await waitFor(() => expect(screen.getByDisplayValue('مطور برمجيات')).toBeInTheDocument());

    const nameInput = screen.getByDisplayValue('أحمد');
    await user.clear(nameInput);
    await user.type(nameInput, 'محمد');
    await user.click(screen.getByRole('button', { name: 'حفظ التغييرات' }));

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'محمد', bio: 'مطور برمجيات', phone: '+970599123456' }),
      expect.anything(),
    );
  });
});
