import { AdminCategoriesTree } from '@/components/admin/AdminCategoriesTree';
import { CreateCategoryButton } from '@/components/admin/CreateCategoryButton';
import { buildMetadata } from '@/lib/seo';

// FIX A11Y/UX-01: this was the one admin page not using the shared
// buildMetadata() helper — English title/h1 ("Manage Categories") while
// every sibling admin page (users, reports, dashboard, ads) is in
// Arabic via buildMetadata, and its h1 was text-2xl instead of the
// text-xl every other admin page header uses.
export const metadata = buildMetadata({ title: 'إدارة الفئات', noIndex: true });

export default function AdminCategoriesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">إدارة الفئات</h1>
        <CreateCategoryButton />
      </div>
      <AdminCategoriesTree />
    </div>
  );
}
