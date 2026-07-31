import { AdminServiceCategoriesTree } from '@/components/admin/AdminServiceCategoriesTree';
import { CreateServiceCategoryButton } from '@/components/admin/CreateServiceCategoryButton';
import { buildMetadata } from '@/lib/seo';

// EPIC 1.2: mirrors /admin/categories/page.tsx exactly. Closes the
// report's finding: "no admin page for services/service-categories...
// despite service-categories having admin-only create/update/delete
// routes on the backend."
export const metadata = buildMetadata({ title: 'إدارة فئات الخدمات', noIndex: true });

export default function AdminServiceCategoriesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">إدارة فئات الخدمات</h1>
        <CreateServiceCategoryButton />
      </div>
      <AdminServiceCategoriesTree />
    </div>
  );
}
