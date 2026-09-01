/**
 * مؤشر تحميل جذري أثناء بث Server Components.
 * يكمل NavigationProgress عند التنقّل من جهة العميل.
 */
export default function RootLoading() {
  return (
    <div
      className="fixed inset-x-0 top-0 z-[200] h-1 overflow-hidden bg-primary/15"
      role="progressbar"
      aria-label="جارٍ تحميل الصفحة"
    >
      <div className="nav-progress-bar h-full" />
    </div>
  );
}
