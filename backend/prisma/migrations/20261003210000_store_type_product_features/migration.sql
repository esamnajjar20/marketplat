-- Phase 3: type-specific store/product fields.
CREATE TYPE "StoreFieldScope" AS ENUM ('STORE', 'PRODUCT');
ALTER TABLE "store_type_fields" ADD COLUMN "scope" "StoreFieldScope" NOT NULL DEFAULT 'STORE';
ALTER TABLE "products" ADD COLUMN "attributes" JSONB;

-- Stable defaults from the Phase 3 design. These are definitions, not legal
-- authorization for medicine sales and do not introduce prescription workflows.
INSERT INTO "store_type_fields"
  ("id","storeTypeId","key","labelAr","pageLabelAr","showOnCard","showOnPage","type","scope","required","options","sortOrder","createdAt","updatedAt")
VALUES
  ('stf_pharmacy_requires_prescription','st_pharmacy','requires_prescription','يتطلب وصفة','يتطلب وصفة',false,true,'BOOLEAN','PRODUCT',false,NULL,10,NOW(),NOW()),
  ('stf_pharmacy_dosage','st_pharmacy','dosage','الجرعة','الجرعة',false,true,'TEXT','PRODUCT',false,NULL,20,NOW(),NOW()),
  ('stf_pharmacy_manufacturer','st_pharmacy','manufacturer','الشركة المصنعة','الشركة المصنعة',false,true,'TEXT','PRODUCT',false,NULL,30,NOW(),NOW()),
  ('stf_restaurant_prep_time','st_restaurant','prep_time_minutes','وقت التحضير بالدقائق','وقت التحضير',false,true,'NUMBER','STORE',false,NULL,10,NOW(),NOW()),
  ('stf_restaurant_portion_size','st_restaurant','portion_size','حجم الحصة','حجم الحصة',false,true,'TEXT','PRODUCT',false,NULL,20,NOW(),NOW()),
  ('stf_restaurant_spicy_level','st_restaurant','spicy_level','درجة الحدة','درجة الحدة',false,true,'SELECT','PRODUCT',false,'[{"value":"none","labelAr":"بدون حدة"},{"value":"mild","labelAr":"خفيف"},{"value":"medium","labelAr":"متوسط"},{"value":"hot","labelAr":"حار"}]',30,NOW(),NOW()),
  ('stf_bakery_pre_order','st_bakery','pre_order','متاح للطلب المسبق','الطلب المسبق',false,true,'BOOLEAN','PRODUCT',false,NULL,10,NOW(),NOW())
ON CONFLICT ("storeTypeId", "key") DO UPDATE SET
  "labelAr" = EXCLUDED."labelAr",
  "pageLabelAr" = EXCLUDED."pageLabelAr",
  "type" = EXCLUDED."type",
  "scope" = EXCLUDED."scope",
  "options" = EXCLUDED."options",
  "sortOrder" = EXCLUDED."sortOrder",
  "isActive" = true;
