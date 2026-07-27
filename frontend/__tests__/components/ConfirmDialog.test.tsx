/**
 * __tests__/components/ConfirmDialog.test.tsx
 *
 * Coverage targets:
 *  - Renders nothing (no dialog content in the DOM) when open=false
 *  - Renders title/description when open=true
 *  - Confirm button: calls onConfirm, then onOpenChange(false)
 *  - Cancel button: calls onOpenChange(false) WITHOUT calling onConfirm
 *  - Default labels ("تأكيد"/"إلغاء") used when not overridden
 *  - Custom confirmLabel/cancelLabel override the defaults
 *  - destructive=true applies the destructive button variant
 *  - destructive=false (default) applies the default button variant
 *  - description is optional — omitted when not provided
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';

describe('ConfirmDialog', () => {
  // ── Open/closed state ──────────────────────────────────────────────

  it('renders no dialog content when open=false', () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={vi.fn()}
        title="حذف الإعلان؟"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.queryByText('حذف الإعلان؟')).not.toBeInTheDocument();
  });

  it('renders the title when open=true', () => {
    render(
      <ConfirmDialog open={true} onOpenChange={vi.fn()} title="حذف الإعلان؟" onConfirm={vi.fn()} />,
    );
    expect(screen.getByText('حذف الإعلان؟')).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="حذف الإعلان؟"
        description="لا يمكن التراجع عن هذا الإجراء."
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByText('لا يمكن التراجع عن هذا الإجراء.')).toBeInTheDocument();
  });

  it('does not render a description element when none is provided', () => {
    render(
      <ConfirmDialog open={true} onOpenChange={vi.fn()} title="حذف الإعلان؟" onConfirm={vi.fn()} />,
    );
    // Only the title should be present — no extra empty description text.
    expect(screen.queryByText('لا يمكن التراجع')).not.toBeInTheDocument();
  });

  // ── Default labels ──────────────────────────────────────────────────

  it('uses default confirm/cancel labels when not overridden', () => {
    render(
      <ConfirmDialog open={true} onOpenChange={vi.fn()} title="عنوان" onConfirm={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'تأكيد' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إلغاء' })).toBeInTheDocument();
  });

  it('uses custom confirmLabel and cancelLabel when provided', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="عنوان"
        confirmLabel="حذف"
        cancelLabel="تراجع"
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'حذف' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تراجع' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تأكيد' })).not.toBeInTheDocument();
  });

  // ── Confirm action ──────────────────────────────────────────────────

  it('calls onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog open={true} onOpenChange={vi.fn()} title="عنوان" onConfirm={onConfirm} />,
    );

    await user.click(screen.getByRole('button', { name: 'تأكيد' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('closes the dialog (calls onOpenChange(false)) after confirming', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog open={true} onOpenChange={onOpenChange} title="عنوان" onConfirm={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: 'تأكيد' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onConfirm before closing (correct order)', async () => {
    const calls: string[] = [];
    const onConfirm = vi.fn(() => calls.push('confirm'));
    const onOpenChange = vi.fn(() => calls.push('close'));
    const user = userEvent.setup();
    render(
      <ConfirmDialog open={true} onOpenChange={onOpenChange} title="عنوان" onConfirm={onConfirm} />,
    );

    await user.click(screen.getByRole('button', { name: 'تأكيد' }));
    expect(calls).toEqual(['confirm', 'close']);
  });

  // ── Cancel action ───────────────────────────────────────────────────

  it('calls onOpenChange(false) when cancel is clicked, without calling onConfirm', async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog open={true} onOpenChange={onOpenChange} title="عنوان" onConfirm={onConfirm} />,
    );

    await user.click(screen.getByRole('button', { name: 'إلغاء' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // ── destructive styling ─────────────────────────────────────────────

  it('applies the destructive button variant when destructive=true', () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="حذف؟"
        destructive
        onConfirm={vi.fn()}
      />,
    );
    const confirmBtn = screen.getByRole('button', { name: 'تأكيد' });
    // Button component maps variant="destructive" to a bg-destructive class.
    expect(confirmBtn.className).toContain('destructive');
  });

  it('does not apply the destructive variant by default', () => {
    render(
      <ConfirmDialog open={true} onOpenChange={vi.fn()} title="عنوان" onConfirm={vi.fn()} />,
    );
    const confirmBtn = screen.getByRole('button', { name: 'تأكيد' });
    expect(confirmBtn.className).not.toContain('destructive');
  });
});
