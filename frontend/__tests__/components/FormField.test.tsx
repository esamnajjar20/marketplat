/**
 * __tests__/components/FormField.test.tsx
 *
 * Coverage targets:
 *  - Renders label with htmlFor
 *  - Required star visible + aria-hidden; sr-only text for screen readers
 *  - Error message: role=alert, aria-live=assertive, has id
 *  - Hint message: rendered when no error, has id
 *  - Hint hidden when error is present
 *  - Children as ReactNode
 *  - Children as render prop (receives { errorId, hintId })
 *  - Custom className applied to wrapper
 *  - errorId/hintId are undefined when not needed (render prop shape)
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormField } from '@/components/shared/forms/FormField';

describe('FormField', () => {
  // ── Label ──────────────────────────────────────────────────────

  it('renders label text', () => {
    render(<FormField label="الاسم" htmlFor="name"><input id="name" /></FormField>);
    expect(screen.getByText('الاسم')).toBeDefined();
  });

  it('label has correct htmlFor', () => {
    render(<FormField label="البريد" htmlFor="email"><input id="email" /></FormField>);
    const label = screen.getByText('البريد', { selector: 'label' });
    expect(label.getAttribute('for')).toBe('email');
  });

  // ── Required star ──────────────────────────────────────────────

  it('shows required star when required=true', () => {
    render(<FormField label="الحقل" htmlFor="x" required><input id="x" /></FormField>);
    const star = screen.getByText('*');
    expect(star.getAttribute('aria-hidden')).toBe('true');
  });

  it('does not show required star when required is false/omitted', () => {
    render(<FormField label="الحقل" htmlFor="x"><input id="x" /></FormField>);
    expect(screen.queryByText('*')).toBeNull();
  });

  it('has sr-only "(required)" text when required=true', () => {
    render(<FormField label="الحقل" htmlFor="x" required><input id="x" /></FormField>);
    expect(screen.getByText('(required)')).toBeDefined();
    expect(screen.getByText('(required)').className).toContain('sr-only');
  });

  // ── Error message ──────────────────────────────────────────────

  it('renders error message with role=alert', () => {
    render(
      <FormField label="الاسم" htmlFor="name" error="الاسم مطلوب">
        <input id="name" />
      </FormField>,
    );
    const errEl = screen.getByRole('alert');
    expect(errEl.textContent).toBe('الاسم مطلوب');
  });

  it('error element has aria-live=assertive', () => {
    render(
      <FormField label="x" htmlFor="x" error="خطأ">
        <input id="x" />
      </FormField>,
    );
    expect(screen.getByRole('alert').getAttribute('aria-live')).toBe('assertive');
  });

  it('error element has a non-empty id', () => {
    render(
      <FormField label="x" htmlFor="x" error="خطأ">
        <input id="x" />
      </FormField>,
    );
    const id = screen.getByRole('alert').getAttribute('id');
    expect(id).toBeTruthy();
    expect(id).toContain('error');
  });

  it('does not render error element when no error', () => {
    render(<FormField label="x" htmlFor="x"><input id="x" /></FormField>);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // ── Hint message ───────────────────────────────────────────────

  it('renders hint when no error', () => {
    render(
      <FormField label="x" htmlFor="x" hint="يجب أن يحتوي على أحرف">
        <input id="x" />
      </FormField>,
    );
    expect(screen.getByText('يجب أن يحتوي على أحرف')).toBeDefined();
  });

  it('hides hint when error is present', () => {
    render(
      <FormField label="x" htmlFor="x" error="خطأ" hint="تلميح">
        <input id="x" />
      </FormField>,
    );
    expect(screen.queryByText('تلميح')).toBeNull();
    expect(screen.getByText('خطأ')).toBeDefined();
  });

  it('hint has a non-empty id', () => {
    render(
      <FormField label="x" htmlFor="x" hint="تلميح">
        <input id="x" />
      </FormField>,
    );
    const hint = screen.getByText('تلميح');
    expect(hint.getAttribute('id')).toBeTruthy();
  });

  // ── Children: ReactNode vs render prop ────────────────────────

  it('renders ReactNode children', () => {
    render(
      <FormField label="x" htmlFor="x">
        <input id="x" data-testid="the-input" />
      </FormField>,
    );
    expect(screen.getByTestId('the-input')).toBeDefined();
  });

  it('calls render prop with { errorId, hintId } when error present', () => {
    let receivedIds: { errorId?: string; hintId?: string } | null = null;
    render(
      <FormField label="x" htmlFor="x" error="خطأ">
        {(ids) => { receivedIds = ids; return <input id="x" />; }}
      </FormField>,
    );
    expect(receivedIds).not.toBeNull();
    expect(receivedIds!.errorId).toBeTruthy();
    expect(receivedIds!.errorId).toContain('error');
  });

  it('render prop: hintId is undefined when error is present', () => {
    let receivedIds: { errorId?: string; hintId?: string } | null = null;
    render(
      <FormField label="x" htmlFor="x" error="خطأ" hint="تلميح">
        {(ids) => { receivedIds = ids; return <input id="x" />; }}
      </FormField>,
    );
    expect(receivedIds!.hintId).toBeUndefined();
  });

  it('render prop: errorId is undefined when no error', () => {
    let receivedIds: { errorId?: string; hintId?: string } | null = null;
    render(
      <FormField label="x" htmlFor="x">
        {(ids) => { receivedIds = ids; return <input id="x" />; }}
      </FormField>,
    );
    expect(receivedIds!.errorId).toBeUndefined();
  });

  it('render prop: hintId is defined when hint present and no error', () => {
    let receivedIds: { errorId?: string; hintId?: string } | null = null;
    render(
      <FormField label="x" htmlFor="x" hint="مساعدة">
        {(ids) => { receivedIds = ids; return <input id="x" />; }}
      </FormField>,
    );
    expect(receivedIds!.hintId).toBeTruthy();
  });

  // ── Custom className ───────────────────────────────────────────

  it('applies custom className to wrapper div', () => {
    const { container } = render(
      <FormField label="x" htmlFor="x" className="custom-class">
        <input id="x" />
      </FormField>,
    );
    expect(container.firstChild?.className).toContain('custom-class');
  });
});
