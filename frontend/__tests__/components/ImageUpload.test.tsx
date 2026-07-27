/**
 * __tests__/components/ImageUpload.test.tsx
 *
 * Coverage targets (this component was previously build-breaking — see
 * report items #1, #2, #3):
 *  - Renders without crashing (regression guard for the missing-constants bug)
 *  - Drop zone: keyboard accessible (Enter/Space), drag-over/leave states
 *  - File validation: accepted types pass through, rejected types/oversized filtered out
 *  - maxFiles: total count (existing + new) never exceeds the cap
 *  - existingUrls: rendered as <img>, removable via onRemoveExisting
 *  - value (new files): rendered as previews via mocked URL.createObjectURL,
 *    removable via onChange
 *  - error message rendering
 *  - object URL revocation on file removal and unmount (SEC-FIX-06)
 *  - FIX UX-13: rejected files (wrong type, oversized, or over the
 *    remaining slot count) now surface a toast explaining what was
 *    rejected and why, instead of silently vanishing from the queue
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageUpload } from '@/components/shared/forms/ImageUpload';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(['x'.repeat(Math.min(sizeBytes, 10))], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

const JPEG_1KB = () => makeFile('photo.jpg', 'image/jpeg', 1024);
const PNG_1KB  = () => makeFile('photo.png', 'image/png', 1024);
const TEXT_FILE = () => makeFile('notes.txt', 'text/plain', 1024);
const OVERSIZED_JPEG = () => makeFile('huge.jpg', 'image/jpeg', 10 * 1024 * 1024); // 10MB > 5MB limit

describe('ImageUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Basic rendering (regression guard) ───────────────────────────

  it('renders without crashing with minimal props', () => {
    render(<ImageUpload value={[]} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /رفع الصور/ })).toBeInTheDocument();
  });

  it('shows the configured max file size in the helper text', () => {
    render(<ImageUpload value={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/MB/)).toBeInTheDocument();
  });

  it('shows current/max count in the helper text', () => {
    render(<ImageUpload value={[]} onChange={vi.fn()} maxFiles={10} />);
    expect(screen.getByText(/0\/10/)).toBeInTheDocument();
  });

  // ── Keyboard accessibility ─────────────────────────────────────────

  it('drop zone has role=button and is focusable', () => {
    render(<ImageUpload value={[]} onChange={vi.fn()} />);
    const dropzone = screen.getByRole('button', { name: /رفع الصور/ });
    expect(dropzone).toHaveAttribute('tabIndex', '0');
  });

  it('Enter key on the drop zone triggers the file picker', async () => {
    render(<ImageUpload value={[]} onChange={vi.fn()} />);
    const dropzone = screen.getByRole('button', { name: /رفع الصور/ });
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    dropzone.focus();
    fireEvent.keyDown(dropzone, { key: 'Enter' });

    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('Space key on the drop zone triggers the file picker', async () => {
    render(<ImageUpload value={[]} onChange={vi.fn()} />);
    const dropzone = screen.getByRole('button', { name: /رفع الصور/ });
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    fireEvent.keyDown(dropzone, { key: ' ' });

    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it('a non-activation key does not trigger the file picker', () => {
    render(<ImageUpload value={[]} onChange={vi.fn()} />);
    const dropzone = screen.getByRole('button', { name: /رفع الصور/ });
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});

    fireEvent.keyDown(dropzone, { key: 'Tab' });

    expect(clickSpy).not.toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  // ── Drag and drop ──────────────────────────────────────────────────

  it('adds valid files on drop', () => {
    const onChange = vi.fn();
    render(<ImageUpload value={[]} onChange={onChange} />);
    const dropzone = screen.getByRole('button', { name: /رفع الصور/ });

    fireEvent.drop(dropzone, { dataTransfer: { files: [JPEG_1KB()] } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(1);
  });

  it('filters out invalid file types on drop', () => {
    const onChange = vi.fn();
    render(<ImageUpload value={[]} onChange={onChange} />);
    const dropzone = screen.getByRole('button', { name: /رفع الصور/ });

    fireEvent.drop(dropzone, { dataTransfer: { files: [TEXT_FILE()] } });

    expect(onChange).toHaveBeenCalledWith([]);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('notes.txt'));
  });

  it('filters out oversized files on drop', () => {
    const onChange = vi.fn();
    render(<ImageUpload value={[]} onChange={onChange} />);
    const dropzone = screen.getByRole('button', { name: /رفع الصور/ });

    fireEvent.drop(dropzone, { dataTransfer: { files: [OVERSIZED_JPEG()] } });

    expect(onChange).toHaveBeenCalledWith([]);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('huge.jpg'));
  });

  it('keeps valid files and drops invalid ones from a mixed drop', () => {
    const onChange = vi.fn();
    render(<ImageUpload value={[]} onChange={onChange} />);
    const dropzone = screen.getByRole('button', { name: /رفع الصور/ });

    fireEvent.drop(dropzone, { dataTransfer: { files: [JPEG_1KB(), TEXT_FILE(), PNG_1KB()] } });

    expect(onChange.mock.calls[0][0]).toHaveLength(2);
  });

  // ── File input (click-to-upload) ────────────────────────────────

  it('adds valid files selected via the file input', () => {
    const onChange = vi.fn();
    const { container } = render(<ImageUpload value={[]} onChange={onChange} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [JPEG_1KB()] } });

    expect(onChange.mock.calls[0][0]).toHaveLength(1);
  });

  // ── maxFiles enforcement ───────────────────────────────────────────

  it('caps total new files at maxFiles when no existing images', () => {
    const onChange = vi.fn();
    render(<ImageUpload value={[]} onChange={onChange} maxFiles={2} />);
    const dropzone = screen.getByRole('button', { name: /رفع الصور/ });

    fireEvent.drop(dropzone, { dataTransfer: { files: [JPEG_1KB(), PNG_1KB(), JPEG_1KB()] } });

    expect(onChange.mock.calls[0][0]).toHaveLength(2);
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('2'));
  });

  it('reduces remaining slots when existingUrls already occupy some of maxFiles', () => {
    const onChange = vi.fn();
    render(
      <ImageUpload
        value={[]}
        onChange={onChange}
        maxFiles={3}
        existingUrls={['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg']}
      />,
    );
    const dropzone = screen.getByRole('button', { name: /رفع الصور/ });

    // Only 1 slot left (3 - 2 existing), even though 2 new files are dropped.
    fireEvent.drop(dropzone, { dataTransfer: { files: [JPEG_1KB(), PNG_1KB()] } });

    expect(onChange.mock.calls[0][0]).toHaveLength(1);
  });

  it('accepts zero new files when existingUrls already fill maxFiles', () => {
    const onChange = vi.fn();
    render(
      <ImageUpload
        value={[]}
        onChange={onChange}
        maxFiles={2}
        existingUrls={['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg']}
      />,
    );
    const dropzone = screen.getByRole('button', { name: /رفع الصور/ });

    fireEvent.drop(dropzone, { dataTransfer: { files: [JPEG_1KB()] } });

    expect(onChange).toHaveBeenCalledWith([]);
  });

  // ── existingUrls rendering (report item #3) ───────────────────────

  it('renders an <img> for each existingUrls entry', () => {
    render(
      <ImageUpload
        value={[]}
        onChange={vi.fn()}
        existingUrls={['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg']}
      />,
    );
    const images = screen.getAllByAltText('صورة الإعلان');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', 'https://cdn.test/a.jpg');
    expect(images[1]).toHaveAttribute('src', 'https://cdn.test/b.jpg');
  });

  it('renders nothing extra when existingUrls is empty', () => {
    render(<ImageUpload value={[]} onChange={vi.fn()} existingUrls={[]} />);
    expect(screen.queryByAltText('صورة الإعلان')).not.toBeInTheDocument();
  });

  it('calls onRemoveExisting with the correct URL when its remove button is clicked', async () => {
    const onRemoveExisting = vi.fn();
    const user = userEvent.setup();
    render(
      <ImageUpload
        value={[]}
        onChange={vi.fn()}
        existingUrls={['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg']}
        onRemoveExisting={onRemoveExisting}
      />,
    );

    const removeButtons = screen.getAllByLabelText('إزالة الصورة');
    await user.click(removeButtons[1]);

    expect(onRemoveExisting).toHaveBeenCalledWith('https://cdn.test/b.jpg');
  });

  it('does not render a remove button for existing images when onRemoveExisting is not provided', () => {
    render(
      <ImageUpload value={[]} onChange={vi.fn()} existingUrls={['https://cdn.test/a.jpg']} />,
    );
    expect(screen.queryByLabelText('إزالة الصورة')).not.toBeInTheDocument();
  });

  // ── New file previews ────────────────────────────────────────────

  it('renders a preview thumbnail for each new file in value', () => {
    const files = [JPEG_1KB(), PNG_1KB()];
    render(<ImageUpload value={files} onChange={vi.fn()} />);
    expect(screen.getByAltText('Preview 1')).toBeInTheDocument();
    expect(screen.getByAltText('Preview 2')).toBeInTheDocument();
  });

  it('shows the file size under each new preview', () => {
    const file = makeFile('a.jpg', 'image/jpeg', 2048); // 2.0 KB
    render(<ImageUpload value={[file]} onChange={vi.fn()} />);
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it('removes a new file when its remove button is clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const files = [JPEG_1KB(), PNG_1KB()];
    render(<ImageUpload value={files} onChange={onChange} />);

    // FIX UX-01: aria-label was inconsistently in English
    // ("Remove image 1") while the identical existing-image remove
    // button next to it used Arabic ("إزالة الصورة") — unified to
    // Arabic across both.
    await user.click(screen.getByLabelText('إزالة الصورة 1'));

    expect(onChange).toHaveBeenCalledWith([files[1]]);
  });

  // ── Error message ──────────────────────────────────────────────────

  it('renders the error message when provided', () => {
    render(<ImageUpload value={[]} onChange={vi.fn()} error="حدث خطأ في الصور" />);
    expect(screen.getByText('حدث خطأ في الصور')).toBeInTheDocument();
  });

  it('does not render an error element when no error is provided', () => {
    const { container } = render(<ImageUpload value={[]} onChange={vi.fn()} />);
    expect(container.querySelector('.text-destructive')).not.toBeInTheDocument();
  });

  // ── Rejection feedback (FIX UX-13) ─────────────────────────────────

  describe('rejection toasts', () => {
    it('does not toast when every dropped file is accepted', () => {
      render(<ImageUpload value={[]} onChange={vi.fn()} />);
      const dropzone = screen.getByRole('button', { name: /رفع الصور/ });

      fireEvent.drop(dropzone, { dataTransfer: { files: [JPEG_1KB()] } });

      expect(toast.error).not.toHaveBeenCalled();
    });

    it('shows one combined message (not one per file) when multiple files have the wrong type', () => {
      render(<ImageUpload value={[]} onChange={vi.fn()} />);
      const dropzone = screen.getByRole('button', { name: /رفع الصور/ });

      fireEvent.drop(dropzone, {
        dataTransfer: { files: [TEXT_FILE(), makeFile('doc.pdf', 'application/pdf', 100)] },
      });

      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('2'));
    });

    it('shows a separate toast for wrong-type and oversized files in the same drop', () => {
      render(<ImageUpload value={[]} onChange={vi.fn()} />);
      const dropzone = screen.getByRole('button', { name: /رفع الصور/ });

      fireEvent.drop(dropzone, { dataTransfer: { files: [TEXT_FILE(), OVERSIZED_JPEG()] } });

      expect(toast.error).toHaveBeenCalledTimes(2);
    });

    it('still accepts the valid files from a mixed drop even when others are rejected with a toast', () => {
      const onChange = vi.fn();
      render(<ImageUpload value={[]} onChange={onChange} />);
      const dropzone = screen.getByRole('button', { name: /رفع الصور/ });

      fireEvent.drop(dropzone, { dataTransfer: { files: [JPEG_1KB(), TEXT_FILE()] } });

      expect(onChange.mock.calls[0][0]).toHaveLength(1);
      expect(toast.error).toHaveBeenCalledTimes(1);
    });
  });

  // ── Object URL lifecycle (SEC-FIX-06) ─────────────────────────────

  it('calls URL.createObjectURL for each new file preview', () => {
    const spy = vi.spyOn(URL, 'createObjectURL');
    render(<ImageUpload value={[JPEG_1KB()]} onChange={vi.fn()} />);
    expect(spy).toHaveBeenCalled();
  });

  it('revokes the object URL when a file is removed from value', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const file = JPEG_1KB();
    const { rerender } = render(<ImageUpload value={[file]} onChange={vi.fn()} />);

    // Simulate the parent removing the file from `value` after onChange fires.
    rerender(<ImageUpload value={[]} onChange={vi.fn()} />);

    expect(revokeSpy).toHaveBeenCalled();
  });

  it('revokes all object URLs on unmount', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const file = JPEG_1KB();
    const { unmount } = render(<ImageUpload value={[file]} onChange={vi.fn()} />);

    unmount();

    expect(revokeSpy).toHaveBeenCalled();
  });
});
