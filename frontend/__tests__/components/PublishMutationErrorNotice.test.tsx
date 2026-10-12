import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { PublishMutationErrorNotice } from '@/components/shared/forms/PublishMutationErrorNotice';

describe('PublishMutationErrorNotice', () => {
  it('keeps a non-field business error visible and accessible', () => {
    render(<PublishMutationErrorNotice error={{ statusCode: 409, message: 'يوجد تعارض في البيانات' }} />);

    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('يوجد تعارض في البيانات')).toBeInTheDocument();
    expect(screen.getByText(/بقيت بيانات النموذج كما هي/)).toBeInTheDocument();
  });

  it('allows the user to dismiss the persistent notice', () => {
    render(<PublishMutationErrorNotice error={{ statusCode: 409, message: 'يوجد تعارض في البيانات' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'إخفاء رسالة الخطأ' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a new error after the previous notice was dismissed', () => {
    const firstError = { statusCode: 409, message: 'خطأ أول' };
    const { rerender } = render(<PublishMutationErrorNotice error={firstError} />);
    fireEvent.click(screen.getByRole('button', { name: 'إخفاء رسالة الخطأ' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    rerender(<PublishMutationErrorNotice error={{ statusCode: 422, message: 'خطأ جديد' }} />);
    expect(screen.getByText('خطأ جديد')).toBeInTheDocument();
  });

  it('does not duplicate field validation errors already shown by form fields', () => {
    render(<PublishMutationErrorNotice error={{
      statusCode: 400,
      message: 'البيانات المرسلة غير صحيحة',
      fieldErrors: { title: ['العنوان مطلوب'] },
    }} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not replace dedicated offline feedback with a generic notice', () => {
    render(<PublishMutationErrorNotice error={{ statusCode: 0, message: 'Network Error' }} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });


  it('shows the retry wait when the server rate-limits the request', () => {
    render(<PublishMutationErrorNotice error={{
      statusCode: 429,
      message: 'طلبات كثيرة، حاول لاحقًا',
      retryAfterSeconds: 30,
    }} />);

    expect(screen.getByRole('status')).toHaveTextContent('انتظر 30 ثانية');
  });

  it('counts down once per second and enables retry when the wait expires', async () => {
    vi.useFakeTimers();
    try {
      render(<PublishMutationErrorNotice error={{
        statusCode: 429,
        message: 'طلبات كثيرة، حاول لاحقًا',
        retryAfterSeconds: 3,
      }} />);

      expect(screen.getByRole('timer')).toHaveTextContent('انتظر 3 ثانية');
      await act(async () => { vi.advanceTimersByTime(2000); });
      expect(screen.getByRole('timer')).toHaveTextContent('انتظر 1 ثانية');
      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(screen.queryByRole('timer')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('يمكنك المحاولة مجددًا الآن');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a request reference that can be shared with support', () => {
    render(<PublishMutationErrorNotice error={{
      statusCode: 500,
      message: 'خطأ في الخادم',
      requestId: 'req-abc123',
    }} />);

    expect(screen.getByText(/رقم مرجع الخطأ:/)).toBeInTheDocument();
    expect(screen.getByText('req-abc123')).toBeInTheDocument();
    expect(screen.getByText(/أرسله للدعم/)).toBeInTheDocument();
  });

  it('renders nothing without an error', () => {
    const { container } = render(<PublishMutationErrorNotice error={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
