-- Expand services into configurable service types + dynamic fields.
-- Existing service categories/listings are migrated to the stable general type.

CREATE TYPE "ServiceTypeFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'BOOLEAN', 'SELECT', 'MULTI_SELECT');
CREATE TYPE "ServiceTypeFieldScope" AS ENUM ('LISTING', 'PROVIDER');

CREATE TABLE "service_types" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "icon" TEXT,
    "labels" JSONB,
    "capabilities" JSONB,
    "presentation" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_types_slug_key" ON "service_types"("slug");
CREATE UNIQUE INDEX "service_types_name_key" ON "service_types"("name");
CREATE UNIQUE INDEX "service_types_nameAr_key" ON "service_types"("nameAr");
CREATE INDEX "service_types_active_sort_idx" ON "service_types"("isActive", "sortOrder");

CREATE TABLE "service_type_fields" (
    "id" TEXT NOT NULL,
    "serviceTypeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" "ServiceTypeFieldScope" NOT NULL DEFAULT 'LISTING',
    "label" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "cardLabelAr" TEXT,
    "pageLabelAr" TEXT,
    "type" "ServiceTypeFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "showOnCard" BOOLEAN NOT NULL DEFAULT false,
    "showOnPage" BOOLEAN NOT NULL DEFAULT true,
    "options" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_type_fields_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_type_fields_serviceTypeId_key_key" ON "service_type_fields"("serviceTypeId", "key");
CREATE INDEX "service_type_fields_type_scope_idx" ON "service_type_fields"("serviceTypeId", "scope", "isActive", "sortOrder");
ALTER TABLE "service_type_fields" ADD CONSTRAINT "service_type_fields_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Stable ID so old data and future deployments converge on one fallback type.
INSERT INTO "service_types" ("id", "slug", "name", "nameAr", "icon", "labels", "capabilities", "presentation", "sortOrder", "updatedAt")
VALUES (
  'st_general',
  'general',
  'General Services',
  'خدمات عامة',
  'wrench',
  '{"serviceSingularAr":"خدمة","servicePluralAr":"خدمات"}',
  '{"appointments":true,"requestQuote":true,"remote":true,"atCustomer":true,"atProvider":true}',
  '{"showDuration":true,"showLocation":true}',
  999,
  CURRENT_TIMESTAMP
);

ALTER TABLE "service_categories" ADD COLUMN "serviceTypeId" TEXT;
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
UPDATE "service_categories" SET "serviceTypeId" = 'st_general' WHERE "serviceTypeId" IS NULL;
ALTER TABLE "service_categories" ALTER COLUMN "serviceTypeId" SET NOT NULL;
CREATE INDEX "service_categories_serviceTypeId_active_idx" ON "service_categories"("serviceTypeId", "isActive");

ALTER TABLE "service_listings" ADD COLUMN "serviceTypeId" TEXT;
ALTER TABLE "service_listings" ADD COLUMN "attributes" JSONB;
UPDATE "service_listings" sl SET "serviceTypeId" = sc."serviceTypeId"
FROM "service_categories" sc WHERE sc."id" = sl."categoryId";
UPDATE "service_listings" SET "serviceTypeId" = 'st_general' WHERE "serviceTypeId" IS NULL;
ALTER TABLE "service_listings" ALTER COLUMN "serviceTypeId" SET NOT NULL;
ALTER TABLE "service_listings" ADD CONSTRAINT "service_listings_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "service_listings_serviceTypeId_status_idx" ON "service_listings"("serviceTypeId", "status");

-- Seed useful first-wave service domains. Categories remain independent and can
-- be assigned to these types by admins; existing categories stay on general.
INSERT INTO "service_types" ("id", "slug", "name", "nameAr", "icon", "labels", "capabilities", "presentation", "sortOrder", "updatedAt") VALUES
('st_home', 'home-services', 'Home Services', 'الخدمات المنزلية', 'home', '{"serviceSingularAr":"خدمة منزلية","servicePluralAr":"خدمات منزلية"}', '{"appointments":true,"requestQuote":true,"remote":false,"atCustomer":true,"atProvider":false}', '{"showDuration":true,"showLocation":true}', 10, CURRENT_TIMESTAMP),
('st_digital', 'digital-services', 'Digital Services', 'الخدمات الرقمية', 'laptop', '{"serviceSingularAr":"خدمة رقمية","servicePluralAr":"خدمات رقمية"}', '{"appointments":true,"requestQuote":true,"remote":true,"atCustomer":false,"atProvider":false}', '{"showDuration":true,"showLocation":true}', 20, CURRENT_TIMESTAMP),
('st_maintenance', 'maintenance-repair', 'Maintenance & Repair', 'الصيانة والإصلاح', 'wrench', '{"serviceSingularAr":"خدمة صيانة","servicePluralAr":"خدمات صيانة"}', '{"appointments":true,"requestQuote":true,"remote":false,"atCustomer":true,"atProvider":true}', '{"showDuration":true,"showLocation":true}', 30, CURRENT_TIMESTAMP),
('st_education', 'education-training', 'Education & Training', 'التعليم والتدريب', 'graduation-cap', '{"serviceSingularAr":"خدمة تعليمية","servicePluralAr":"خدمات تعليمية"}', '{"appointments":true,"requestQuote":true,"remote":true,"atCustomer":true,"atProvider":true}', '{"showDuration":true,"showLocation":true}', 40, CURRENT_TIMESTAMP),
('st_beauty', 'beauty-care', 'Beauty & Care', 'الجمال والعناية', 'sparkles', '{"serviceSingularAr":"خدمة عناية","servicePluralAr":"خدمات عناية"}', '{"appointments":true,"requestQuote":false,"remote":false,"atCustomer":true,"atProvider":true}', '{"showDuration":true,"showLocation":true}', 50, CURRENT_TIMESTAMP),
('st_automotive', 'automotive', 'Automotive Services', 'خدمات السيارات', 'car', '{"serviceSingularAr":"خدمة سيارات","servicePluralAr":"خدمات سيارات"}', '{"appointments":true,"requestQuote":true,"remote":false,"atCustomer":true,"atProvider":true}', '{"showDuration":true,"showLocation":true}', 60, CURRENT_TIMESTAMP),
('st_events', 'events-media', 'Events & Media', 'التصوير والفعاليات', 'camera', '{"serviceSingularAr":"خدمة فعاليات","servicePluralAr":"خدمات فعاليات"}', '{"appointments":true,"requestQuote":true,"remote":false,"atCustomer":true,"atProvider":true}', '{"showDuration":true,"showLocation":true}', 70, CURRENT_TIMESTAMP),
('st_professional', 'professional-services', 'Professional Services', 'الخدمات المهنية', 'briefcase', '{"serviceSingularAr":"خدمة مهنية","servicePluralAr":"خدمات مهنية"}', '{"appointments":true,"requestQuote":true,"remote":true,"atCustomer":true,"atProvider":true}', '{"showDuration":true,"showLocation":true}', 80, CURRENT_TIMESTAMP),
('st_transport', 'transport-delivery', 'Transport & Delivery', 'النقل والتوصيل', 'truck', '{"serviceSingularAr":"خدمة نقل","servicePluralAr":"خدمات نقل"}', '{"appointments":true,"requestQuote":true,"remote":false,"atCustomer":true,"atProvider":true}', '{"showDuration":true,"showLocation":true}', 90, CURRENT_TIMESTAMP),
('st_agriculture', 'agriculture', 'Agriculture Services', 'الخدمات الزراعية', 'sprout', '{"serviceSingularAr":"خدمة زراعية","servicePluralAr":"خدمات زراعية"}', '{"appointments":true,"requestQuote":true,"remote":false,"atCustomer":true,"atProvider":true}', '{"showDuration":true,"showLocation":true}', 100, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- First dynamic-field examples. They are intentionally conservative and reusable.
INSERT INTO "service_type_fields" ("id","serviceTypeId","key","scope","label","labelAr","cardLabelAr","pageLabelAr","type","required","showOnCard","showOnPage","options","sortOrder","updatedAt") VALUES
('st_home_property_type','st_home','property_type','LISTING','Property type','نوع المكان','نوع المكان','نوع المكان','SELECT',false,true,true,'[{"value":"HOME","labelAr":"منزل"},{"value":"OFFICE","labelAr":"مكتب"},{"value":"SHOP","labelAr":"محل"}]',10,CURRENT_TIMESTAMP),
('st_home_mobile','st_home','mobile_service','LISTING','Mobile service','خدمة متنقلة','متنقلة','الخدمة متنقلة','BOOLEAN',false,true,true,NULL,20,CURRENT_TIMESTAMP),
('st_digital_remote','st_digital','remote_delivery','LISTING','Remote delivery','تسليم عن بعد','عن بعد','التسليم عن بعد','BOOLEAN',false,true,true,NULL,10,CURRENT_TIMESTAMP),
('st_maintenance_equipment','st_maintenance','equipment_type','LISTING','Equipment type','نوع الجهاز','نوع الجهاز','نوع الجهاز','TEXT',false,true,true,NULL,10,CURRENT_TIMESTAMP),
('st_education_subject','st_education','subject','LISTING','Subject','المادة','المادة','المادة','TEXT',true,true,true,NULL,10,CURRENT_TIMESTAMP),
('st_education_mode','st_education','teaching_mode','LISTING','Teaching mode','طريقة التعليم','طريقة التعليم','طريقة التعليم','SELECT',false,true,true,'[{"value":"IN_PERSON","labelAr":"حضوري"},{"value":"REMOTE","labelAr":"عن بعد"},{"value":"BOTH","labelAr":"حضوري وعن بعد"}]',20,CURRENT_TIMESTAMP),
('st_beauty_mobile','st_beauty','mobile_service','LISTING','Mobile service','خدمة متنقلة','متنقلة','الخدمة متنقلة','BOOLEAN',false,true,true,NULL,10,CURRENT_TIMESTAMP),
('st_automotive_vehicle','st_automotive','vehicle_type','LISTING','Vehicle type','نوع المركبة','نوع المركبة','نوع المركبة','SELECT',false,true,true,'[{"value":"CAR","labelAr":"سيارة"},{"value":"MOTORCYCLE","labelAr":"دراجة نارية"},{"value":"TRUCK","labelAr":"مركبة ثقيلة"}]',10,CURRENT_TIMESTAMP),
('st_events_service_kind','st_events','event_service_type','LISTING','Event service type','نوع خدمة الفعالية','نوع الفعالية','نوع خدمة الفعالية','SELECT',false,true,true,'[{"value":"PHOTO","labelAr":"تصوير"},{"value":"VIDEO","labelAr":"فيديو"},{"value":"DECOR","labelAr":"ديكور"},{"value":"PLANNING","labelAr":"تنظيم"}]',10,CURRENT_TIMESTAMP),
('st_professional_remote','st_professional','remote_service','LISTING','Remote service','عن بعد','عن بعد','الخدمة عن بعد','BOOLEAN',false,true,true,NULL,10,CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Starter taxonomy so the new types are immediately usable. Existing categories
-- are untouched and remain under the general type until an admin reassigns them.
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_home','Home Services','الخدمات المنزلية','home-services','home',NULL,'st_home',true,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug" = 'home-services');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_digital','Digital Services','الخدمات الرقمية','digital-services','laptop',NULL,'st_digital',true,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug" = 'digital-services');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_maintenance','Maintenance & Repair','الصيانة والإصلاح','maintenance-repair','wrench',NULL,'st_maintenance',true,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug" = 'maintenance-repair');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_education','Education & Training','التعليم والتدريب','education-training','graduation-cap',NULL,'st_education',true,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug" = 'education-training');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_beauty','Beauty & Care','الجمال والعناية','beauty-care','sparkles',NULL,'st_beauty',true,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug" = 'beauty-care');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_automotive','Automotive','السيارات','automotive','car',NULL,'st_automotive',true,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug" = 'automotive');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_events','Events & Media','التصوير والفعاليات','events-media','camera',NULL,'st_events',true,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug" = 'events-media');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_professional','Professional Services','الخدمات المهنية','professional-services','briefcase',NULL,'st_professional',true,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug" = 'professional-services');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_transport','Transport & Delivery','النقل والتوصيل','transport-delivery','truck',NULL,'st_transport',true,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug" = 'transport-delivery');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_agriculture','Agriculture','الخدمات الزراعية','agriculture','sprout',NULL,'st_agriculture',true,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug" = 'agriculture');

INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_home_cleaning','Cleaning','التنظيف', 'home-cleaning',NULL,"id",'st_home',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='home-services' AND "serviceTypeId"='st_home'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='home-cleaning');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_home_electric','Electrical','الكهرباء','home-electrical',NULL,"id",'st_home',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='home-services' AND "serviceTypeId"='st_home'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='home-electrical');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_digital_design','Design','التصميم','digital-design',NULL,"id",'st_digital',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='digital-services' AND "serviceTypeId"='st_digital'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='digital-design');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_digital_programming','Programming','البرمجة','digital-programming',NULL,"id",'st_digital',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='digital-services' AND "serviceTypeId"='st_digital'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='digital-programming');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_maintenance_ac','Air Conditioning','التكييف','maintenance-air-conditioning',NULL,"id",'st_maintenance',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='maintenance-repair' AND "serviceTypeId"='st_maintenance'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='maintenance-air-conditioning');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_maintenance_devices','Home Appliances','الأجهزة المنزلية','maintenance-home-appliances',NULL,"id",'st_maintenance',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='maintenance-repair' AND "serviceTypeId"='st_maintenance'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='maintenance-home-appliances');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_education_tutoring','Private Tutoring','الدروس الخصوصية','education-private-tutoring',NULL,"id",'st_education',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='education-training' AND "serviceTypeId"='st_education'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='education-private-tutoring');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_education_languages','Languages','اللغات','education-languages',NULL,"id",'st_education',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='education-training' AND "serviceTypeId"='st_education'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='education-languages');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_beauty_hair','Hair & Barber','الشعر والحلاقة','beauty-hair-barber',NULL,"id",'st_beauty',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='beauty-care' AND "serviceTypeId"='st_beauty'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='beauty-hair-barber');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_beauty_makeup','Makeup','المكياج','beauty-makeup',NULL,"id",'st_beauty',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='beauty-care' AND "serviceTypeId"='st_beauty'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='beauty-makeup');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_auto_mechanic','Mechanics','الميكانيكا','automotive-mechanics',NULL,"id",'st_automotive',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='automotive' AND "serviceTypeId"='st_automotive'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='automotive-mechanics');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_auto_electric','Auto Electrical','كهرباء السيارات','automotive-electrical',NULL,"id",'st_automotive',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='automotive' AND "serviceTypeId"='st_automotive'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='automotive-electrical');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_events_photo','Photography','التصوير','events-photography',NULL,"id",'st_events',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='events-media' AND "serviceTypeId"='st_events'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='events-photography');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_events_video','Video Production','إنتاج الفيديو','events-video',NULL,"id",'st_events',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='events-media' AND "serviceTypeId"='st_events'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='events-video');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_professional_accounting','Accounting','المحاسبة','professional-accounting',NULL,"id",'st_professional',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='professional-services' AND "serviceTypeId"='st_professional'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='professional-accounting');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_professional_consulting','Consulting','الاستشارات','professional-consulting',NULL,"id",'st_professional',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='professional-services' AND "serviceTypeId"='st_professional'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='professional-consulting');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_transport_delivery','Delivery','التوصيل','transport-delivery-service',NULL,"id",'st_transport',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='transport-delivery' AND "serviceTypeId"='st_transport'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='transport-delivery-service');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_transport_moving','Moving','نقل الأثاث','transport-moving',NULL,"id",'st_transport',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='transport-delivery' AND "serviceTypeId"='st_transport'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='transport-moving');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_agriculture_gardens','Gardening','تنسيق الحدائق','agriculture-gardening',NULL,"id",'st_agriculture',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='agriculture' AND "serviceTypeId"='st_agriculture'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='agriculture-gardening');
INSERT INTO "service_categories" ("id","name","nameAr","slug","icon","parentId","serviceTypeId","isActive","createdAt")
SELECT 'sc_agriculture_irrigation','Irrigation','الري','agriculture-irrigation',NULL,"id",'st_agriculture',true,CURRENT_TIMESTAMP FROM "service_categories" WHERE "slug"='agriculture' AND "serviceTypeId"='st_agriculture'
AND NOT EXISTS (SELECT 1 FROM "service_categories" WHERE "slug"='agriculture-irrigation');
