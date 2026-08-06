import { AdminProductCategoriesTree } from '@/components/admin/AdminProductCategoriesTree';
import { CreateProductCategoryButton } from '@/components/admin/CreateProductCategoryButton';
import { buildMetadata } from '@/lib/seo';

// Closes the audit report's finding: product-categories had full admin
// CRUD on the backend (create/update/delete, admin-guarded) and a
// mandatory role in ProductForm.tsx / SearchFilters.tsx, but no admin
// page existed to manage them — despite the identical gap already
// having been fixed for service-categories ("EPIC 1.2"). Mirrors
// /admin/service-categories/page.tsx exactly.
export const metadata = buildMetadata({ title: 'إدارة فئات المنتجات', noIndex: true });

export default function AdminProductCategoriesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">إدارة فئات المنتجات</h1>
        <CreateProductCategoryButton />
      </div>
      <AdminProductCategoriesTree />
    </div>
  );
}
