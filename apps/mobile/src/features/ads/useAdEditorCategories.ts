import { useEffect, useState } from 'react';
import {
  fetchPublicCategories,
  flattenPublicCategories,
  type PublicCategory,
} from '@/features/categories/categories.api';

/** Loads and flattens public categories for ad create/edit forms. */
export function useAdEditorCategories() {
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [loadingCategories, setLoadingCategories] = useState(true);

  useEffect(() => {
    let active = true;
    setLoadingCategories(true);
    fetchPublicCategories()
      .then((tree) => {
        if (!active) return;
        setCategories(flattenPublicCategories(tree));
        setCategoriesError(null);
      })
      .catch((e) => {
        if (!active) return;
        setCategories([]);
        setCategoriesError(e instanceof Error ? e.message : 'تعذر تحميل التصنيفات.');
      })
      .finally(() => {
        if (active) setLoadingCategories(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { categories, categoriesError, loadingCategories };
}
