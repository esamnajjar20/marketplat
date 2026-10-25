-- Store Presentation: admin-controlled storefront terminology and section titles.
ALTER TABLE "store_types" ADD COLUMN "presentation" JSONB;

UPDATE "store_types"
SET "presentation" = jsonb_build_object(
  'card', jsonb_build_object(
    'title', CASE "slug"
      WHEN 'pharmacy' THEN 'صيدلية'
      WHEN 'restaurant' THEN 'مطعم'
      WHEN 'cafe' THEN 'مقهى'
      WHEN 'supermarket' THEN 'سوبرماركت'
      WHEN 'bakery' THEN 'مخبز'
      ELSE 'متجر'
    END,
    'subtitle', '',
    'products', 'المنتجات',
    'offers', 'العروض',
    'collections', 'المجموعات',
    'ads', 'الإعلانات',
    'reviews', 'التقييمات',
    'about', 'عن المتجر',
    'details', 'التفاصيل',
    'contact', 'التواصل',
    'location', 'الموقع'
  ),
  'page', jsonb_build_object(
    'title', CASE "slug"
      WHEN 'pharmacy' THEN 'صيدلية'
      WHEN 'restaurant' THEN 'مطعم'
      WHEN 'cafe' THEN 'مقهى'
      WHEN 'supermarket' THEN 'سوبرماركت'
      WHEN 'bakery' THEN 'مخبز'
      ELSE 'متجر'
    END,
    'subtitle', '',
    'products', "labels"->>'products',
    'offers', 'العروض',
    'collections', 'المجموعات',
    'ads', 'الإعلانات',
    'reviews', 'التقييمات',
    'about', 'عن المتجر',
    'details', 'التفاصيل',
    'contact', 'التواصل',
    'location', 'الموقع'
  )
)
WHERE "presentation" IS NULL;

ALTER TABLE "store_types" ALTER COLUMN "presentation" SET NOT NULL;

ALTER TABLE "store_type_fields"
  ADD COLUMN "cardLabelAr" TEXT,
  ADD COLUMN "pageLabelAr" TEXT,
  ADD COLUMN "showOnCard" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "showOnPage" BOOLEAN NOT NULL DEFAULT true;

UPDATE "store_type_fields"
SET "pageLabelAr" = "labelAr"
WHERE "pageLabelAr" IS NULL;
