/**
 * __tests__/components/WarmupIndicator.test.tsx
 *
 * Real logic under test: renders nothing until an active progress event
 * arrives, updates the progress bar as completed/total change, disappears
 * automatically when active:false is broadcast (no user action), the X
 * button only hides the banner locally (never touches the subscription —
 * i.e. never unsubscribes/cancels the underlying warm-up), and a fresh
 * active:true cycle re-shows the banner even after a previous dismissal.
 *
 * Same mocking pattern as UpdatePrompt.test.tsx (mock the lib's pub-sub
 * export, capture the listener, drive it manually with act()).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { WarmupIndicator } from '@/components/pwa/WarmupIndicator';
import { onWarmupProgress, type WarmupProgress } from '@/lib/offlineCoreBundle';

vi.mock('@/lib/offlineCoreBundle', () => ({
  onWarmupProgress: vi.fn(),
}));

const mockOnWarmupProgress = vi.mocked(onWarmupProgress);
const mockUnsubscribe = vi.fn();

describe('WarmupIndicator', () => {
  let capturedListener: (progress: WarmupProgress) => void = () => {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnWarmupProgress.mockImplementation((listener) => {
      capturedListener = listener;
      // مطابق لسلوك onWarmupProgress الحقيقي: يبلّغ فورًا بالحالة الحالية
      // عند الاشتراك، تمامًا مثل onServiceWorkerUpdate.
      listener({ active: false, completed: 0, total: 0 });
      return mockUnsubscribe;
    });
  });

  it('renders nothing while no warm-up cycle is active', () => {
    const { container } = render(<WarmupIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the banner once a cycle starts and reflects progress', () => {
    render(<WarmupIndicator />);
    expect(screen.queryByText('جارٍ تجهيز التصفح بدون إنترنت…')).not.toBeInTheDocument();

    act(() => {
      capturedListener({ active: true, completed: 0, total: 5 });
    });
    expect(screen.getByText('جارٍ تجهيز التصفح بدون إنترنت…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => {
      capturedListener({ active: true, completed: 3, total: 5 });
    });
    // العرض النسبي لشريط التقدّم — 3/5 = 60%.
    const bar = screen.getByRole('status').querySelector('div[style]');
    expect(bar).toHaveStyle({ width: '60%' });
  });

  it('auto-hides when the cycle completes (active:false), without any user action', () => {
    render(<WarmupIndicator />);

    act(() => {
      capturedListener({ active: true, completed: 0, total: 5 });
    });
    expect(screen.getByText('جارٍ تجهيز التصفح بدون إنترنت…')).toBeInTheDocument();

    act(() => {
      capturedListener({ active: false, completed: 5, total: 5 });
    });
    expect(screen.queryByText('جارٍ تجهيز التصفح بدون إنترنت…')).not.toBeInTheDocument();
  });

  it('closing the banner hides it locally without unsubscribing (warm-up keeps running)', async () => {
    const user = setupUser();
    render(<WarmupIndicator />);

    act(() => {
      capturedListener({ active: true, completed: 0, total: 5 });
    });
    expect(screen.getByText('جارٍ تجهيز التصفح بدون إنترنت…')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'إخفاء — يستمر التحميل بالخلفية' }));
    expect(screen.queryByText('جارٍ تجهيز التصفح بدون إنترنت…')).not.toBeInTheDocument();
    // الإغلاق لا يلغي الاشتراك — التقدّم يستمر بالبث والتحميل الفعلي (خارج
    // نطاق هذا المكوّن) يستمر بالخلفية بشكل طبيعي.
    expect(mockUnsubscribe).not.toHaveBeenCalled();

    // تحديث تقدّم لاحق بعد الإغلاق يبقى بلا واجهة (المستخدم أغلقها لهذه الدورة).
    act(() => {
      capturedListener({ active: true, completed: 4, total: 5 });
    });
    expect(screen.queryByText('جارٍ تجهيز التصفح بدون إنترنت…')).not.toBeInTheDocument();
  });

  it('a fresh cycle (active:false -> active:true) re-shows the banner even after a previous dismissal', async () => {
    const user = setupUser();
    render(<WarmupIndicator />);

    act(() => {
      capturedListener({ active: true, completed: 0, total: 5 });
    });
    await user.click(screen.getByRole('button', { name: 'إخفاء — يستمر التحميل بالخلفية' }));
    expect(screen.queryByText('جارٍ تجهيز التصفح بدون إنترنت…')).not.toBeInTheDocument();

    // الدورة الأولى تكتمل
    act(() => {
      capturedListener({ active: false, completed: 5, total: 5 });
    });

    // دورة جديدة تبدأ (مثلًا بعد 6 ساعات أو عند عودة الاتصال) — يجب تظهر
    // من جديد رغم إغلاقها بالدورة السابقة.
    act(() => {
      capturedListener({ active: true, completed: 0, total: 5 });
    });
    expect(screen.getByText('جارٍ تجهيز التصفح بدون إنترنت…')).toBeInTheDocument();
  });

  it('unsubscribes the listener on unmount', () => {
    const { unmount } = render(<WarmupIndicator />);
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
