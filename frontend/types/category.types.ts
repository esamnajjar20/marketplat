/**
 * Category types.
 * Mirrors backend Prisma Category model.
 */

export interface Category {
  id:       string;
  name:     string;
  nameAr:   string;
  slug:     string;
  parentId: string | null;
  children: Category[];
  _count?:  { ads: number };
}

export interface CreateCategoryPayload {
  name:      string;
  nameAr:    string;
  slug:      string;
  parentId?: string;
}

export type UpdateCategoryPayload = Partial<CreateCategoryPayload>;
