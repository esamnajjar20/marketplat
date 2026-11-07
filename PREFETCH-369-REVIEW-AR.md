# مراجعة وإصلاح مواضع `prefetch={false}` — MarketPlat

## نتيجة الجرد

أظهر الفحص النصي الأول **369 تطابقًا**. بعد تحليل شجرة JSX باستخدام TypeScript AST تبيّن أن الرقم يتكوّن من **365 عنصر Link فعليًا** موزعة على **173 ملفًا**، و**4 تطابقات داخل تعليقات فقط** لا تنشئ روابط ولا تؤثر على وقت التشغيل. تم توثيق المواضع الـ369 جميعها في `frontend/docs/prefetch-review-manifest.json`، مع المسار والسطر الأصلي وعبارة `href` وعمق التكرار لكل عنصر فعلي.

## سياسة الإصلاح المعتمدة

- لم تتم إزالة `prefetch={false}` عشوائيًا من 365 موضعًا؛ لأن ذلك قد يعيد طلبات RSC عند ظهور كل رابط داخل الشاشة، خصوصًا في البطاقات والقوائم الطويلة.
- تم تحويل عناصر JSX الـ365 وحدها إلى `IntentPrefetchLink`. يبقى prefetch معطلًا عند تحميل الصفحة وظهور الرابط في viewport، ثم يعاد سلوك Next.js الافتراضي بعد مرور المؤشر أو التركيز بلوحة المفاتيح.
- لم نبدّل استيراد `next/link` على مستوى ملفات كاملة؛ تم تعديل وسم العناصر المستهدفة فقط. بذلك لا تتغير الروابط العادية غير المشمولة بالجرد.
- الروابط الستة التي تستخدم `target="_blank"` تبقى غير قابلة للـprefetch بواسطة المحوّل حتى عند hover/focus. كما يستثني المحوّل روابط download وhash وmailto/tel/sms.
- تم تصحيح التعليقات الأربعة التي سببت false positives، دون تغيير السلوك البرمجي بسببها.

## التوزيع البنيوي

| المعيار | العدد |
|---|---:|
| عناصر JSX فعلية | 365 |
| ملفات runtime المتأثرة | 173 |
| تطابقات داخل تعليقات فقط | 4 |
| مواضع داخل `.map` بعمق 1 | 59 |
| مواضع داخل `.map` بعمق 2 | 2 |
| مواضع خارج `.map` | 304 |
| روابط تفتح تبويبًا جديدًا | 6 |

## سجل كل موضع runtime (365)

السطران يوضحان رقم الموضع في النسخة الأساسية ثم موضعه بعد التعديل. قد تختلف الأرقام عند تغيّر طول تعليق سابق في الملف. جميع المواضع تحوّلت إلى `IntentPrefetchLink`، مع الاحتفاظ بتعبير `href` وسائر الخصائص والمحتوى.

| # | الملف | السطر قبل | السطر بعد | href | عمق map | ملاحظة |
|---:|---|---:|---|---:|---|
| 1 | `frontend/app/(auth)/error.tsx` | 65 | 65 | `{ROUTES.login}` | 0 | intent prefetch |
| 2 | `frontend/app/(protected)/not-found.tsx` | 26 | 26 | `{ROUTES.dashboard}` | 0 | intent prefetch |
| 3 | `frontend/app/(protected)/not-found.tsx` | 29 | 29 | `{ROUTES.search}` | 0 | intent prefetch |
| 4 | `frontend/app/(protected)/requests/new/page.tsx` | 37 | 37 | `{ROUTES.requests}` | 0 | intent prefetch |
| 5 | `frontend/app/(protected)/service-requests/[id]/page.tsx` | 88 | 88 | `{backHref}` | 0 | intent prefetch |
| 6 | `frontend/app/(protected)/service-requests/[id]/page.tsx` | 107 | 107 | `{ROUTES.serviceDetail(request.listing.id)}` | 0 | intent prefetch |
| 7 | `frontend/app/(protected)/service-requests/[id]/page.tsx` | 180 | 180 | `{backHref}` | 0 | intent prefetch |
| 8 | `frontend/app/(public)/about/page.tsx` | 34 | 34 | `{ROUTES.search}` | 0 | intent prefetch |
| 9 | `frontend/app/(public)/about/page.tsx` | 35 | 35 | `{ROUTES.register}` | 0 | intent prefetch |
| 10 | `frontend/app/(public)/contact/page.tsx` | 45 | 45 | `{ROUTES.privacy}` | 0 | intent prefetch |
| 11 | `frontend/app/(public)/contact/page.tsx` | 48 | 48 | `{ROUTES.terms}` | 0 | intent prefetch |
| 12 | `frontend/app/(public)/contact/page.tsx` | 51 | 51 | `{ROUTES.about}` | 0 | intent prefetch |
| 13 | `frontend/app/(public)/error.tsx` | 89 | 89 | `{ROUTES.home}` | 0 | intent prefetch |
| 14 | `frontend/app/(public)/not-found.tsx` | 26 | 26 | `{ROUTES.home}` | 0 | intent prefetch |
| 15 | `frontend/app/(public)/not-found.tsx` | 29 | 29 | `{ROUTES.search}` | 0 | intent prefetch |
| 16 | `frontend/app/(public)/privacy/page.tsx` | 46 | 46 | `{ROUTES.contact}` | 0 | intent prefetch |
| 17 | `frontend/app/(public)/products/[id]/error.tsx` | 50 | 50 | `{ROUTES.home}` | 0 | intent prefetch |
| 18 | `frontend/app/(public)/profile/[id]/page.tsx` | 98 | 98 | `{ROUTES.home}` | 0 | intent prefetch |
| 19 | `frontend/app/(public)/promoted/page.tsx` | 66 | 66 | `{ROUTES.products}` | 0 | intent prefetch |
| 20 | `frontend/app/(public)/promoted/page.tsx` | 70 | 70 | `{ROUTES.home}` | 0 | intent prefetch |
| 21 | `frontend/app/(public)/requests/[id]/page.tsx` | 87 | 87 | `{ROUTES.requests}` | 0 | intent prefetch |
| 22 | `frontend/app/(public)/requests/[id]/page.tsx` | 126 | 126 | `{ROUTES.requests}` | 0 | intent prefetch |
| 23 | `frontend/app/(public)/requests/[id]/page.tsx` | 232 | 232 | `{ROUTES.myOpenRequests}` | 0 | intent prefetch |
| 24 | `frontend/app/(public)/requests/[id]/page.tsx` | 247 | 247 | `{loginHref}` | 0 | intent prefetch |
| 25 | `frontend/app/(public)/requests/[id]/page.tsx` | 287 | 287 | `{loginHref}` | 0 | intent prefetch |
| 26 | `frontend/app/(public)/saved-payments/page.tsx` | 16 | 16 | `"/offline?tab=payments"` | 0 | intent prefetch |
| 27 | `frontend/app/(public)/sellers/[id]/page.tsx` | 43 | 43 | `{ROUTES.sellersRanking}` | 0 | intent prefetch |
| 28 | `frontend/app/(public)/service-providers/[id]/error.tsx` | 33 | 33 | `"/service-providers"` | 0 | intent prefetch |
| 29 | `frontend/app/(public)/service-providers/[id]/page.tsx` | 47 | 47 | `{ROUTES.serviceProviders}` | 0 | intent prefetch |
| 30 | `frontend/app/(public)/service-providers/page.tsx` | 27 | 27 | `{ROUTES.services}` | 0 | intent prefetch |
| 31 | `frontend/app/(public)/services/[id]/error.tsx` | 20 | 20 | `"/services"` | 0 | intent prefetch |
| 32 | `frontend/app/(public)/services/[id]/page.tsx` | 71 | 71 | `{ROUTES.services}` | 0 | intent prefetch |
| 33 | `frontend/app/(public)/stores/[id]/page.tsx` | 80 | 80 | `{ROUTES.stores}` | 0 | intent prefetch |
| 34 | `frontend/app/(public)/terms/page.tsx` | 21 | 21 | `{ROUTES.privacy}` | 0 | intent prefetch |
| 35 | `frontend/app/(public)/terms/page.tsx` | 36 | 36 | `{ROUTES.contact}` | 0 | intent prefetch |
| 36 | `frontend/app/not-found.tsx` | 30 | 30 | `"/"` | 0 | intent prefetch |
| 37 | `frontend/app/not-found.tsx` | 33 | 33 | `"/search"` | 0 | intent prefetch |
| 38 | `frontend/app/update/page.tsx` | 119 | 119 | `"/"` | 0 | intent prefetch |
| 39 | `frontend/components/admin/AdminAdRow.tsx` | 41 | 41 | `{ROUTES.adDetail(ad.id)}` | 0 | تبويب جديد: لا prefetch |
| 40 | `frontend/components/admin/AdminAdsTable.tsx` | 281 | 281 | `{ROUTES.adDetail(ad.id)}` | 1 | intent prefetch |
| 41 | `frontend/components/admin/AdminCategoryTypeTabs.tsx` | 32 | 32 | `{tab.href}` | 1 | intent prefetch |
| 42 | `frontend/components/admin/AdminFraudRow.tsx` | 77 | 77 | `{ROUTES.adDetail(ad.id)}` | 0 | تبويب جديد: لا prefetch |
| 43 | `frontend/components/admin/AdminFraudTable.tsx` | 106 | 106 | `{ROUTES.adDetail(ad.id)}` | 1 | تبويب جديد: لا prefetch |
| 44 | `frontend/components/admin/AdminHeader.tsx` | 65 | 65 | `{ROUTES.admin.dashboard}` | 0 | intent prefetch |
| 45 | `frontend/components/admin/AdminHeader.tsx` | 98 | 98 | `{ROUTES.home}` | 0 | intent prefetch |
| 46 | `frontend/components/admin/AdminHeader.tsx` | 140 | 140 | `{ROUTES.admin.reports}` | 1 | intent prefetch |
| 47 | `frontend/components/admin/AdminHeader.tsx` | 172 | 172 | `{ROUTES.admin.reports}` | 0 | intent prefetch |
| 48 | `frontend/components/admin/AdminLatestActivity.tsx` | 85 | 85 | `{item.href}` | 1 | intent prefetch |
| 49 | `frontend/components/admin/AdminOpsQueue.tsx` | 101 | 101 | `{href}` | 1 | intent prefetch |
| 50 | `frontend/components/admin/AdminRecentActivity.tsx` | 40 | 40 | `{adminTabHref('ads')}` | 0 | intent prefetch |
| 51 | `frontend/components/admin/AdminRecentActivity.tsx` | 61 | 61 | `{ROUTES.adDetail(ad.id)}` | 1 | تبويب جديد: لا prefetch |
| 52 | `frontend/components/admin/AdminReportRow.tsx` | 65 | 65 | `{targetHref(report.targetType, report.targetId)}` | 0 | تبويب جديد: لا prefetch |
| 53 | `frontend/components/admin/AdminReportsTable.tsx` | 272 | 272 | `{targetHref(report.targetType, report.targetId)}` | 1 | تبويب جديد: لا prefetch |
| 54 | `frontend/components/admin/AdminSidebar.tsx` | 106 | 106 | `{href}` | 1 | intent prefetch |
| 55 | `frontend/components/ads/AdBreadcrumb.tsx` | 27 | 27 | `{ROUTES.home}` | 0 | intent prefetch |
| 56 | `frontend/components/ads/AdBreadcrumb.tsx` | 34 | 34 | `{categoryHref}` | 0 | intent prefetch |
| 57 | `frontend/components/ads/AdCard.tsx` | 153 | 153 | `{detailHref}` | 0 | intent prefetch |
| 58 | `frontend/components/ads/AdCard.tsx` | 263 | 263 | `{detailHref}` | 0 | intent prefetch |
| 59 | `frontend/components/ads/AdDetailMetadata.tsx` | 111 | 111 | `{`/search?status=${encodeURIComponent(ad.status)}`}` | 0 | intent prefetch |
| 60 | `frontend/components/ads/AdDetailMetadata.tsx` | 120 | 120 | `{`/search?condition=${encodeURIComponent(ad.condition)}`}` | 0 | intent prefetch |
| 61 | `frontend/components/ads/AdDetailMetadata.tsx` | 129 | 129 | `{categoryUrl}` | 0 | intent prefetch |
| 62 | `frontend/components/ads/AdDetailSection.tsx` | 111 | 111 | `{ROUTES.search}` | 0 | intent prefetch |
| 63 | `frontend/components/ads/AdListItem.tsx` | 21 | 21 | `{ROUTES.adDetail(ad.id)}` | 0 | intent prefetch |
| 64 | `frontend/components/ads/CreateAdGate.tsx` | 94 | 94 | `{`${ROUTES.settings.seller}&from=${encodeURIComponent(ROUTES.adCreate)}`}` | 0 | intent prefetch |
| 65 | `frontend/components/ads/PublishedSuccessBanner.tsx` | 39 | 39 | `{pathname}` | 0 | intent prefetch |
| 66 | `frontend/components/ads/PublishedSuccessBanner.tsx` | 44 | 44 | `{ROUTES.myAds}` | 0 | intent prefetch |
| 67 | `frontend/components/ads/SavedOfflineAdsPageClient.tsx` | 221 | 221 | `{hrefFor(e)}` | 1 | intent prefetch |
| 68 | `frontend/components/ads/SavedOfflineAdsPageClient.tsx` | 231 | 231 | `{hrefFor(e)}` | 1 | intent prefetch |
| 69 | `frontend/components/ads/SearchResults.tsx` | 292 | 292 | `{ROUTES.home}` | 0 | intent prefetch |
| 70 | `frontend/components/ads/SellerCard.tsx` | 88 | 88 | `{profileHref}` | 0 | intent prefetch |
| 71 | `frontend/components/auth/AuthBrand.tsx` | 7 | 7 | `{ROUTES.home}` | 0 | intent prefetch |
| 72 | `frontend/components/auth/ForgotPasswordForm.tsx` | 78 | 78 | `{loginHref}` | 0 | intent prefetch |
| 73 | `frontend/components/auth/ForgotPasswordForm.tsx` | 130 | 130 | `{loginHref}` | 0 | intent prefetch |
| 74 | `frontend/components/auth/LoginForm.tsx` | 164 | 164 | `{ROUTES.forgotPassword}` | 0 | intent prefetch |
| 75 | `frontend/components/auth/LoginForm.tsx` | 197 | 197 | `{registerHref}` | 0 | intent prefetch |
| 76 | `frontend/components/auth/RegisterForm.tsx` | 218 | 218 | `{loginHref}` | 0 | intent prefetch |
| 77 | `frontend/components/auth/ResetPasswordForm.tsx` | 98 | 98 | `{ROUTES.forgotPassword}` | 0 | intent prefetch |
| 78 | `frontend/components/auth/ResetPasswordForm.tsx` | 100 | 100 | `{ROUTES.login}` | 0 | intent prefetch |
| 79 | `frontend/components/auth/ResetPasswordForm.tsx` | 125 | 125 | `{ROUTES.login}` | 0 | intent prefetch |
| 80 | `frontend/components/auth/VerifyEmailClient.tsx` | 114 | 114 | `{ROUTES.home}` | 0 | intent prefetch |
| 81 | `frontend/components/auth/VerifyEmailClient.tsx` | 129 | 129 | `{ROUTES.home}` | 0 | intent prefetch |
| 82 | `frontend/components/categories/CategoriesIndex.tsx` | 38 | 38 | `{ROUTES.search}` | 0 | intent prefetch |
| 83 | `frontend/components/categories/CategoriesIndex.tsx` | 61 | 61 | `{item.href}` | 2 | intent prefetch |
| 84 | `frontend/components/downloads/DownloadsPageClient.tsx` | 69 | 69 | `{ROUTES.stores}` | 0 | intent prefetch |
| 85 | `frontend/components/downloads/DownloadsPageClient.tsx` | 155 | 155 | `{ROUTES.storeDetail(item.storeId)}` | 1 | intent prefetch |
| 86 | `frontend/components/favorites/MoveSelectedToListMenu.tsx` | 79 | 79 | `{ROUTES.favorites}` | 0 | intent prefetch |
| 87 | `frontend/components/favorites/MoveToListMenu.tsx` | 65 | 65 | `{ROUTES.favorites}` | 0 | intent prefetch |
| 88 | `frontend/components/follows/FollowTargetList.tsx` | 70 | 70 | `{href}` | 0 | intent prefetch |
| 89 | `frontend/components/follows/FollowTargetList.tsx` | 111 | 111 | `{`/profile/${user.id}`}` | 0 | intent prefetch |
| 90 | `frontend/components/follows/PublicFollowList.tsx` | 63 | 63 | `{`/profile/${user.id}`}` | 1 | intent prefetch |
| 91 | `frontend/components/follows/PublicFollowList.tsx` | 130 | 130 | `{href}` | 0 | intent prefetch |
| 92 | `frontend/components/follows/PublicFollowList.tsx` | 191 | 191 | `{pageHref(page - 1)}` | 0 | intent prefetch |
| 93 | `frontend/components/follows/PublicFollowList.tsx` | 206 | 206 | `{pageHref(page + 1)}` | 0 | intent prefetch |
| 94 | `frontend/components/home/CategoriesRow.tsx` | 92 | 92 | `{ROUTES.categories}` | 0 | intent prefetch |
| 95 | `frontend/components/home/CategoriesRow.tsx` | 100 | 100 | `{item.href}` | 1 | intent prefetch |
| 96 | `frontend/components/home/CategoriesRow.tsx` | 118 | 118 | `{ROUTES.categories}` | 0 | intent prefetch |
| 97 | `frontend/components/home/FeaturedCarousel.tsx` | 263 | 263 | `{slide.href}` | 1 | intent prefetch |
| 98 | `frontend/components/home/FollowingFeedSection.tsx` | 28 | 28 | `{href}` | 1 | intent prefetch |
| 99 | `frontend/components/home/ForYouMixedSection.tsx` | 72 | 72 | `{ROUTES.forYou}` | 0 | intent prefetch |
| 100 | `frontend/components/home/ForYouMixedSection.tsx` | 86 | 86 | `{ROUTES.login}` | 0 | intent prefetch |
| 101 | `frontend/components/home/HomeTypeShortcuts.tsx` | 15 | 15 | `{href}` | 1 | intent prefetch |
| 102 | `frontend/components/home/RecentProducts.tsx` | 53 | 53 | `{ROUTES.products}` | 0 | intent prefetch |
| 103 | `frontend/components/home/RecentProductsSection.tsx` | 97 | 97 | `{ROUTES.myStoreProductCreate}` | 0 | intent prefetch |
| 104 | `frontend/components/home/RecentProductsSection.tsx` | 101 | 101 | `{`${ROUTES.login}?from=${encodeURIComponent(ROUTES.myStoreProductCreate)}`}` | 0 | intent prefetch |
| 105 | `frontend/components/home/RecentStores.tsx` | 47 | 47 | `{ROUTES.stores}` | 0 | intent prefetch |
| 106 | `frontend/components/home/SectionHeader.tsx` | 66 | 66 | `{cta.href}` | 0 | intent prefetch |
| 107 | `frontend/components/layout/BottomNav.tsx` | 128 | 128 | `{href}` | 0 | intent prefetch |
| 108 | `frontend/components/layout/BottomNav.tsx` | 216 | 216 | `{ROUTES.userProfile(user.id)}` | 0 | intent prefetch |
| 109 | `frontend/components/layout/BottomNav.tsx` | 233 | 233 | `{ROUTES.offline.sync}` | 0 | intent prefetch |
| 110 | `frontend/components/layout/BottomNav.tsx` | 262 | 262 | `{ROUTES.offline.sync}` | 0 | intent prefetch |
| 111 | `frontend/components/layout/CreateSheet.tsx` | 82 | 82 | `{href}` | 1 | intent prefetch |
| 112 | `frontend/components/layout/CreateSheet.tsx` | 103 | 103 | `{ROUTES.offline.drafts}` | 0 | intent prefetch |
| 113 | `frontend/components/layout/ExploreSheet.tsx` | 42 | 42 | `{href}` | 1 | intent prefetch |
| 114 | `frontend/components/layout/MessagesLink.tsx` | 30 | 30 | `{ROUTES.messages}` | 0 | intent prefetch |
| 115 | `frontend/components/layout/MobileNav.tsx` | 156 | 156 | `{href}` | 1 | intent prefetch |
| 116 | `frontend/components/layout/MobileNav.tsx` | 223 | 223 | `{child.href}` | 1 | intent prefetch |
| 117 | `frontend/components/layout/MobileNav.tsx` | 477 | 477 | `{ROUTES.settings.seller}` | 0 | intent prefetch |
| 118 | `frontend/components/layout/MobileNav.tsx` | 504 | 504 | `{ROUTES.userProfile(user.id)}` | 0 | intent prefetch |
| 119 | `frontend/components/layout/MobileNav.tsx` | 547 | 547 | `{link.href}` | 1 | intent prefetch |
| 120 | `frontend/components/layout/MobileNav.tsx` | 576 | 576 | `{ROUTES.admin.dashboard}` | 0 | intent prefetch |
| 121 | `frontend/components/layout/NotificationBell.tsx` | 79 | 79 | `{href}` | 0 | intent prefetch |
| 122 | `frontend/components/layout/NotificationBell.tsx` | 243 | 243 | `{ROUTES.settings.notifications}` | 0 | intent prefetch |
| 123 | `frontend/components/layout/NotificationBell.tsx` | 267 | 267 | `"/update"` | 0 | intent prefetch |
| 124 | `frontend/components/layout/NotificationBell.tsx` | 331 | 331 | `{ROUTES.notifications}` | 0 | intent prefetch |
| 125 | `frontend/components/layout/ProtectedHeader.tsx` | 48 | 48 | `{ROUTES.home}` | 0 | intent prefetch |
| 126 | `frontend/components/layout/ProtectedHeader.tsx` | 64 | 64 | `{`${ROUTES.search}?type=ads`}` | 0 | intent prefetch |
| 127 | `frontend/components/layout/ProtectedHeader.tsx` | 67 | 67 | `{ROUTES.stores}` | 0 | intent prefetch |
| 128 | `frontend/components/layout/ProtectedHeader.tsx` | 70 | 70 | `{ROUTES.services}` | 0 | intent prefetch |
| 129 | `frontend/components/layout/ProtectedHeader.tsx` | 73 | 73 | `{ROUTES.serviceProviders}` | 0 | intent prefetch |
| 130 | `frontend/components/layout/ProtectedMobileNav.tsx` | 86 | 86 | `{ROUTES.myAds}` | 0 | intent prefetch |
| 131 | `frontend/components/layout/ProtectedMobileNav.tsx` | 136 | 136 | `{child.href}` | 1 | intent prefetch |
| 132 | `frontend/components/layout/ProtectedMobileNav.tsx` | 356 | 356 | `{link.href}` | 1 | intent prefetch |
| 133 | `frontend/components/layout/ProtectedMobileNav.tsx` | 383 | 383 | `{link.href}` | 1 | intent prefetch |
| 134 | `frontend/components/layout/ProtectedMobileNav.tsx` | 426 | 426 | `{ROUTES.settings.seller}` | 0 | intent prefetch |
| 135 | `frontend/components/layout/ProtectedMobileNav.tsx` | 454 | 454 | `{ROUTES.storeDetail(myStore.id)}` | 0 | intent prefetch |
| 136 | `frontend/components/layout/ProtectedMobileNav.tsx` | 497 | 497 | `{ROUTES.userProfile(user.id)}` | 0 | intent prefetch |
| 137 | `frontend/components/layout/ProtectedMobileNav.tsx` | 534 | 534 | `{ROUTES.admin.dashboard}` | 0 | intent prefetch |
| 138 | `frontend/components/layout/ProtectedSidebar.tsx` | 110 | 110 | `{href}` | 0 | intent prefetch |
| 139 | `frontend/components/layout/PublicFooter.tsx` | 37 | 37 | `{ROUTES.home}` | 0 | intent prefetch |
| 140 | `frontend/components/layout/PublicFooter.tsx` | 50 | 50 | `{link.href}` | 2 | intent prefetch |
| 141 | `frontend/components/layout/PublicFooter.tsx` | 73 | 72 | `{ROUTES.privacy}` | 0 | intent prefetch |
| 142 | `frontend/components/layout/PublicFooter.tsx` | 79 | 78 | `{ROUTES.terms}` | 0 | intent prefetch |
| 143 | `frontend/components/layout/PublicFooter.tsx` | 85 | 84 | `{ROUTES.contact}` | 0 | intent prefetch |
| 144 | `frontend/components/layout/PublicHeader.tsx` | 119 | 119 | `{ROUTES.home}` | 0 | intent prefetch |
| 145 | `frontend/components/layout/PublicHeader.tsx` | 127 | 127 | `{ROUTES.search}` | 0 | intent prefetch |
| 146 | `frontend/components/layout/PublicHeader.tsx` | 143 | 143 | `{ROUTES.home}` | 0 | intent prefetch |
| 147 | `frontend/components/layout/PublicHeader.tsx` | 158 | 158 | `{ROUTES.search}` | 0 | intent prefetch |
| 148 | `frontend/components/layout/PublicHeader.tsx` | 161 | 161 | `{`${ROUTES.search}?type=ads`}` | 0 | intent prefetch |
| 149 | `frontend/components/layout/PublicHeader.tsx` | 164 | 164 | `{ROUTES.products}` | 0 | intent prefetch |
| 150 | `frontend/components/layout/PublicHeader.tsx` | 167 | 167 | `{ROUTES.services}` | 0 | intent prefetch |
| 151 | `frontend/components/layout/PublicHeader.tsx` | 170 | 170 | `{ROUTES.stores}` | 0 | intent prefetch |
| 152 | `frontend/components/layout/PublicHeader.tsx` | 205 | 205 | `{ROUTES.login}` | 0 | intent prefetch |
| 153 | `frontend/components/layout/PublicHeader.tsx` | 208 | 208 | `{ROUTES.register}` | 0 | intent prefetch |
| 154 | `frontend/components/layout/UserMenu.tsx` | 101 | 101 | `{ROUTES.dashboard}` | 0 | intent prefetch |
| 155 | `frontend/components/layout/UserMenu.tsx` | 112 | 112 | `{ROUTES.myAds}` | 0 | intent prefetch |
| 156 | `frontend/components/layout/UserMenu.tsx` | 124 | 124 | `{ROUTES.settings.seller}` | 0 | intent prefetch |
| 157 | `frontend/components/layout/UserMenu.tsx` | 132 | 132 | `{ROUTES.favorites}` | 0 | intent prefetch |
| 158 | `frontend/components/layout/UserMenu.tsx` | 139 | 139 | `{ROUTES.savedSearches}` | 0 | intent prefetch |
| 159 | `frontend/components/layout/UserMenu.tsx` | 146 | 146 | `{ROUTES.activity}` | 0 | intent prefetch |
| 160 | `frontend/components/layout/UserMenu.tsx` | 153 | 153 | `{ROUTES.userProfile(user.id)}` | 0 | intent prefetch |
| 161 | `frontend/components/layout/UserMenu.tsx` | 160 | 160 | `{ROUTES.settings.profile}` | 0 | intent prefetch |
| 162 | `frontend/components/layout/UserMenu.tsx` | 168 | 168 | `{ROUTES.admin.dashboard}` | 0 | intent prefetch |
| 163 | `frontend/components/messages/ChatWindow.tsx` | 393 | 393 | `{ROUTES.messages}` | 0 | intent prefetch |
| 164 | `frontend/components/messages/ChatWindow.tsx` | 458 | 458 | `{contextCard.url}` | 0 | intent prefetch |
| 165 | `frontend/components/messages/ChatWindow.tsx` | 527 | 527 | `{ROUTES.userProfile(party.id)}` | 0 | intent prefetch |
| 166 | `frontend/components/messages/ConversationList.tsx` | 154 | 154 | `{`${ROUTES.search}?type=ads`}` | 0 | intent prefetch |
| 167 | `frontend/components/messages/ConversationList.tsx` | 157 | 157 | `{ROUTES.home}` | 0 | intent prefetch |
| 168 | `frontend/components/messages/ConversationRow.tsx` | 87 | 87 | `{ROUTES.conversationDetail(conversation.id)}` | 0 | intent prefetch |
| 169 | `frontend/components/notifications/NotificationRow.tsx` | 120 | 120 | `{href}` | 0 | intent prefetch |
| 170 | `frontend/components/notifications/NotificationsPage.tsx` | 189 | 189 | `{ROUTES.settings.notifications}` | 0 | intent prefetch |
| 171 | `frontend/components/notifications/NotificationsPage.tsx` | 271 | 271 | `{ROUTES.settings.notifications}` | 0 | intent prefetch |
| 172 | `frontend/components/notifications/NotificationsPage.tsx` | 326 | 326 | `{ROUTES.settings.notifications}` | 0 | intent prefetch |
| 173 | `frontend/components/notifications/NotificationsPage.tsx` | 333 | 333 | `{ROUTES.messages}` | 0 | intent prefetch |
| 174 | `frontend/components/notifications/NotificationsPage.tsx` | 336 | 336 | `{ROUTES.home}` | 0 | intent prefetch |
| 175 | `frontend/components/notifications/NotificationsPage.tsx` | 344 | 344 | `"/update"` | 0 | intent prefetch |
| 176 | `frontend/components/offline/NativeOfflineStrip.tsx` | 27 | 27 | `{ROUTES.offline.sync}` | 0 | intent prefetch |
| 177 | `frontend/components/offline/PendingOfflinePublishCard.tsx` | 89 | 89 | `{resumeHrefForDraft(draft)}` | 1 | intent prefetch |
| 178 | `frontend/components/profile/ActivityTabsHub.tsx` | 72 | 72 | `{ROUTES.adCreate}` | 0 | intent prefetch |
| 179 | `frontend/components/profile/DashboardStats.tsx` | 176 | 176 | `{href}` | 1 | intent prefetch |
| 180 | `frontend/components/profile/DashboardStats.tsx` | 194 | 194 | `{ROUTES.myStore}` | 0 | intent prefetch |
| 181 | `frontend/components/profile/DashboardStats.tsx` | 203 | 203 | `{ROUTES.myStoreAnalytics}` | 0 | intent prefetch |
| 182 | `frontend/components/profile/DashboardStats.tsx` | 211 | 211 | `{ROUTES.myServices}` | 0 | intent prefetch |
| 183 | `frontend/components/profile/DashboardStats.tsx` | 220 | 220 | `{ROUTES.myServiceProviderAnalytics}` | 0 | intent prefetch |
| 184 | `frontend/components/profile/EditProfileButtonGate.tsx` | 30 | 30 | `{ROUTES.settings.profile}` | 0 | intent prefetch |
| 185 | `frontend/components/profile/EntityFavoritesList.tsx` | 192 | 192 | `{copy.href}` | 0 | intent prefetch |
| 186 | `frontend/components/profile/FavoritesList.tsx` | 148 | 148 | `{`${ROUTES.search}?type=ads`}` | 0 | intent prefetch |
| 187 | `frontend/components/profile/FavoritesList.tsx` | 153 | 153 | `{ROUTES.home}` | 0 | intent prefetch |
| 188 | `frontend/components/profile/MyAdsList.tsx` | 294 | 294 | `{ROUTES.adCreate}` | 0 | intent prefetch |
| 189 | `frontend/components/profile/MyAdsList.tsx` | 337 | 337 | `{ROUTES.adDetail(ad.id)}` | 1 | intent prefetch |
| 190 | `frontend/components/profile/MyAdsList.tsx` | 378 | 378 | `{ROUTES.adEdit(ad.id)}` | 1 | intent prefetch |
| 191 | `frontend/components/profile/MyReportsList.tsx` | 57 | 57 | `{targetHref(report.targetType, report.targetId)}` | 0 | intent prefetch |
| 192 | `frontend/components/profile/OnboardingChecklist.tsx` | 129 | 129 | `{ROUTES.adCreate}` | 0 | intent prefetch |
| 193 | `frontend/components/profile/OnboardingChecklist.tsx` | 132 | 132 | `{ROUTES.myStore}` | 0 | intent prefetch |
| 194 | `frontend/components/profile/OnboardingChecklist.tsx` | 135 | 135 | `{ROUTES.settings.serviceProvider}` | 0 | intent prefetch |
| 195 | `frontend/components/profile/OnboardingChecklist.tsx` | 150 | 150 | `{step.href}` | 1 | intent prefetch |
| 196 | `frontend/components/profile/OnboardingChecklist.tsx` | 169 | 169 | `{next.href}` | 0 | intent prefetch |
| 197 | `frontend/components/profile/ProfileBadges.tsx` | 104 | 104 | `{ROUTES.storeDetail(store.id)}` | 0 | intent prefetch |
| 198 | `frontend/components/profile/ProfileServiceProviderSummary.tsx` | 109 | 109 | `{`${ROUTES.services}?providerId=${provider.id}`}` | 0 | intent prefetch |
| 199 | `frontend/components/profile/ProfileServiceProviderSummary.tsx` | 118 | 118 | `{ROUTES.adCreate}` | 0 | intent prefetch |
| 200 | `frontend/components/profile/ProfileStoreSummary.tsx` | 30 | 30 | `{ROUTES.storeDetail(store.id)}` | 0 | intent prefetch |
| 201 | `frontend/components/profile/PublicProfileClient.tsx` | 43 | 43 | `{ROUTES.userFollowers(user.id)}` | 0 | intent prefetch |
| 202 | `frontend/components/profile/PublicProfileClient.tsx` | 46 | 46 | `{ROUTES.userFollowing(user.id)}` | 0 | intent prefetch |
| 203 | `frontend/components/profile/PublicProfileClient.tsx` | 75 | 75 | `{ROUTES.home}` | 0 | intent prefetch |
| 204 | `frontend/components/profile/PublicProfileHeader.tsx` | 97 | 97 | `{t.href}` | 1 | intent prefetch |
| 205 | `frontend/components/profile/PublicProfileHeader.tsx` | 110 | 110 | `{ROUTES.storeDetail(store.id)}` | 0 | intent prefetch |
| 206 | `frontend/components/profile/RecentActivityFeed.tsx` | 81 | 81 | `{ROUTES.adCreate}` | 0 | intent prefetch |
| 207 | `frontend/components/profile/RecentActivityFeed.tsx` | 109 | 109 | `{href}` | 1 | intent prefetch |
| 208 | `frontend/components/profile/RecentActivityFeed.tsx` | 122 | 122 | `{ROUTES.activity}` | 0 | intent prefetch |
| 209 | `frontend/components/profile/SavedSearchesList.tsx` | 114 | 114 | `{searchUrlFor(search.filters)}` | 0 | intent prefetch |
| 210 | `frontend/components/profile/SavedSearchesList.tsx` | 187 | 187 | `{ROUTES.search}` | 0 | intent prefetch |
| 211 | `frontend/components/profile/SavedSearchesList.tsx` | 194 | 194 | `{ROUTES.products}` | 0 | intent prefetch |
| 212 | `frontend/components/profile/SavedSearchesList.tsx` | 200 | 200 | `{ROUTES.services}` | 0 | intent prefetch |
| 213 | `frontend/components/profile/SellerTodayTasks.tsx` | 112 | 112 | `{task.href}` | 1 | intent prefetch |
| 214 | `frontend/components/profile/Timeline.tsx` | 159 | 159 | `{href}` | 0 | intent prefetch |
| 215 | `frontend/components/profile/ViewMyProfileLink.tsx` | 23 | 23 | `{ROUTES.userProfile(user.id)}` | 0 | intent prefetch |
| 216 | `frontend/components/promoted/PromotedLoadMore.tsx` | 77 | 77 | `{ROUTES.products}` | 0 | intent prefetch |
| 217 | `frontend/components/pwa/UpdatePrompt.tsx` | 150 | 150 | `"/update"` | 0 | intent prefetch |
| 218 | `frontend/components/requests/MyRequestOffersPageClient.tsx` | 42 | 42 | `{ROUTES.requests}` | 0 | intent prefetch |
| 219 | `frontend/components/requests/MyRequestOffersPageClient.tsx` | 59 | 59 | `{href}` | 1 | intent prefetch |
| 220 | `frontend/components/requests/MyRequestOffersPageClient.tsx` | 111 | 111 | `{ROUTES.requests}` | 0 | intent prefetch |
| 221 | `frontend/components/requests/MyRequestsPageClient.tsx` | 62 | 62 | `{ROUTES.requestNew}` | 0 | intent prefetch |
| 222 | `frontend/components/requests/MyRequestsPageClient.tsx` | 70 | 70 | `{statusHref(tab.value)}` | 1 | intent prefetch |
| 223 | `frontend/components/requests/MyRequestsPageClient.tsx` | 116 | 116 | `{ROUTES.requestNew}` | 0 | intent prefetch |
| 224 | `frontend/components/requests/RequestCard.tsx` | 69 | 69 | `{detailHref}` | 0 | intent prefetch |
| 225 | `frontend/components/requests/RequestCard.tsx` | 110 | 110 | `{detailHref}` | 0 | intent prefetch |
| 226 | `frontend/components/requests/RequestFilters.tsx` | 201 | 201 | `{ROUTES.requests}` | 0 | intent prefetch |
| 227 | `frontend/components/requests/RequestOfferCard.tsx` | 123 | 123 | `{ROUTES.request(offer.requestId)}` | 0 | intent prefetch |
| 228 | `frontend/components/requests/RequestsPageClient.tsx` | 124 | 124 | `{ROUTES.requestNew}` | 0 | intent prefetch |
| 229 | `frontend/components/requests/RequestsPageClient.tsx` | 131 | 131 | `{ROUTES.myOpenRequests}` | 0 | intent prefetch |
| 230 | `frontend/components/requests/RequestsPageClient.tsx` | 137 | 137 | `{ROUTES.myOpenRequestOffers}` | 0 | intent prefetch |
| 231 | `frontend/components/requests/RequestsPageClient.tsx` | 155 | 155 | `{buildTypeHref(value, city, value === 'SERVICE' ? serviceTypeId : undefined, q, sort)}` | 1 | intent prefetch |
| 232 | `frontend/components/requests/RequestsPageClient.tsx` | 222 | 222 | `{ROUTES.requests}` | 0 | intent prefetch |
| 233 | `frontend/components/requests/RequestsPageClient.tsx` | 226 | 226 | `{ROUTES.requestNew}` | 0 | intent prefetch |
| 234 | `frontend/components/sales/SaleCard.tsx` | 84 | 84 | `{`/account/sales/${sale.id}/receipt`}` | 0 | intent prefetch |
| 235 | `frontend/components/sales/SalesPageClient.tsx` | 49 | 49 | `{salesHubTabHref('sales')}` | 0 | intent prefetch |
| 236 | `frontend/components/sales/SalesTabsHub.tsx` | 90 | 90 | `{`${SALES_HUB_PATH}?tab=sales`}` | 0 | intent prefetch |
| 237 | `frontend/components/search/EmptySearchAlternatives.tsx` | 31 | 30 | `{`${ROUTES.search}?type=ads`}` | 0 | intent prefetch |
| 238 | `frontend/components/search/EmptySearchSuggestions.tsx` | 91 | 91 | `{searchHref(q)}` | 1 | intent prefetch |
| 239 | `frontend/components/search/EmptySearchSuggestions.tsx` | 114 | 114 | `{searchHref(q)}` | 1 | intent prefetch |
| 240 | `frontend/components/search/EmptySearchSuggestions.tsx` | 139 | 139 | `{ROUTES.adDetail(ad.id)}` | 1 | intent prefetch |
| 241 | `frontend/components/search/EmptySearchSuggestions.tsx` | 180 | 180 | `{typeHref(type)}` | 1 | intent prefetch |
| 242 | `frontend/components/search/EmptySearchSuggestions.tsx` | 216 | 216 | `{ROUTES.category(cat.slug)}` | 1 | intent prefetch |
| 243 | `frontend/components/search/SearchResults.tsx` | 227 | 227 | `{ROUTES.favorites}` | 0 | intent prefetch |
| 244 | `frontend/components/search/SearchResults.tsx` | 242 | 242 | `{ROUTES.offline.hub}` | 0 | intent prefetch |
| 245 | `frontend/components/search/SearchResults.tsx` | 349 | 349 | `{ROUTES.adCreate}` | 0 | intent prefetch |
| 246 | `frontend/components/search/UnifiedResultCard.tsx` | 56 | 56 | `{result.url}` | 0 | intent prefetch |
| 247 | `frontend/components/sellers/MySellerProfileCard.tsx` | 254 | 254 | `{ROUTES.userProfile(profile.userId)}` | 0 | intent prefetch |
| 248 | `frontend/components/sellers/MySellerProfileCard.tsx` | 259 | 259 | `{ROUTES.myStore}` | 0 | intent prefetch |
| 249 | `frontend/components/sellers/SellerRatingsList.tsx` | 112 | 112 | `{ROUTES.adDetail(rating.ad.id)}` | 1 | intent prefetch |
| 250 | `frontend/components/sellers/SellerVerificationBanner.tsx` | 38 | 38 | `{ROUTES.settings.seller}` | 0 | intent prefetch |
| 251 | `frontend/components/sellers/SellerVerificationBanner.tsx` | 54 | 54 | `{ROUTES.settings.seller}` | 0 | intent prefetch |
| 252 | `frontend/components/sellers/SellersRankingList.tsx` | 114 | 114 | `{ROUTES.userProfile(row.userId)}` | 1 | intent prefetch |
| 253 | `frontend/components/sellers/SellersRankingList.tsx` | 254 | 254 | `{ROUTES.userProfile(r.userId)}` | 1 | intent prefetch |
| 254 | `frontend/components/services/BecomeServiceProviderCard.tsx` | 114 | 114 | `{ROUTES.settings.seller}` | 0 | intent prefetch |
| 255 | `frontend/components/services/IncomingServiceRequestsList.tsx` | 244 | 244 | `{ROUTES.serviceDetail(request.listing.id)}` | 1 | intent prefetch |
| 256 | `frontend/components/services/IncomingServiceRequestsList.tsx` | 260 | 260 | `{ROUTES.serviceRequestDetail(request.id)}` | 1 | intent prefetch |
| 257 | `frontend/components/services/MyServiceListingsList.tsx` | 224 | 224 | `{ROUTES.myServiceCreate}` | 0 | intent prefetch |
| 258 | `frontend/components/services/MyServiceListingsList.tsx` | 328 | 328 | `{ROUTES.myServiceCreate}` | 0 | intent prefetch |
| 259 | `frontend/components/services/MyServiceListingsList.tsx` | 333 | 333 | `{ROUTES.incomingServiceRequests}` | 0 | intent prefetch |
| 260 | `frontend/components/services/MyServiceListingsList.tsx` | 338 | 338 | `{ROUTES.myServiceAppointments}` | 0 | intent prefetch |
| 261 | `frontend/components/services/MyServiceListingsList.tsx` | 370 | 370 | `{ROUTES.serviceDetail(listing.id)}` | 1 | intent prefetch |
| 262 | `frontend/components/services/MyServiceListingsList.tsx` | 406 | 406 | `{ROUTES.myServiceEdit(listing.id)}` | 1 | intent prefetch |
| 263 | `frontend/components/services/MyServiceProviderCard.tsx` | 234 | 234 | `{ROUTES.userProfile(currentUser!.id)}` | 0 | intent prefetch |
| 264 | `frontend/components/services/MyServiceProviderCard.tsx` | 239 | 239 | `{ROUTES.myServices}` | 0 | intent prefetch |
| 265 | `frontend/components/services/MyServiceProviderCard.tsx` | 243 | 243 | `{ROUTES.myServiceProviderAnalytics}` | 0 | intent prefetch |
| 266 | `frontend/components/services/MyServiceRequestsList.tsx` | 118 | 118 | `{ROUTES.services}` | 0 | intent prefetch |
| 267 | `frontend/components/services/MyServiceRequestsList.tsx` | 136 | 136 | `{ROUTES.serviceDetail(request.listing.id)}` | 1 | intent prefetch |
| 268 | `frontend/components/services/MyServiceRequestsList.tsx` | 160 | 160 | `{ROUTES.serviceRequestDetail(request.id)}` | 1 | intent prefetch |
| 269 | `frontend/components/services/MyServicesHub.tsx` | 109 | 109 | `{publicProfileHref}` | 0 | intent prefetch |
| 270 | `frontend/components/services/MyServicesHub.tsx` | 115 | 115 | `{ROUTES.settings.serviceProvider}` | 0 | intent prefetch |
| 271 | `frontend/components/services/MyServicesHub.tsx` | 148 | 148 | `{ROUTES.incomingServiceRequests}` | 0 | intent prefetch |
| 272 | `frontend/components/services/MyServicesHub.tsx` | 160 | 160 | `{ROUTES.myServiceCreate}` | 0 | intent prefetch |
| 273 | `frontend/components/services/MyServicesHub.tsx` | 171 | 171 | `{ROUTES.myServiceCreate}` | 0 | intent prefetch |
| 274 | `frontend/components/services/MyServicesHub.tsx` | 193 | 193 | `{ROUTES.myServiceEdit(item.id)}` | 1 | intent prefetch |
| 275 | `frontend/components/services/MyServicesTabsHub.tsx` | 113 | 113 | `{ROUTES.myServiceCreate}` | 0 | intent prefetch |
| 276 | `frontend/components/services/ProviderContactCard.tsx` | 79 | 79 | `{profileHref}` | 0 | intent prefetch |
| 277 | `frontend/components/services/ServiceBreadcrumb.tsx` | 26 | 26 | `{ROUTES.home}` | 0 | intent prefetch |
| 278 | `frontend/components/services/ServiceBreadcrumb.tsx` | 31 | 31 | `{ROUTES.services}` | 0 | intent prefetch |
| 279 | `frontend/components/services/ServiceListingCard.tsx` | 325 | 325 | `{detailHref}` | 0 | intent prefetch |
| 280 | `frontend/components/services/ServiceListingCard.tsx` | 391 | 391 | `{detailHref}` | 0 | intent prefetch |
| 281 | `frontend/components/services/ServiceListingsGrid.tsx` | 147 | 147 | `{ROUTES.services}` | 0 | intent prefetch |
| 282 | `frontend/components/services/ServiceProviderCard.tsx` | 201 | 201 | `{profileHref}` | 0 | intent prefetch |
| 283 | `frontend/components/services/ServiceRequestButton.tsx` | 149 | 149 | `{ROUTES.myServiceRequests}` | 0 | intent prefetch |
| 284 | `frontend/components/services/ServicesPageClient.tsx` | 60 | 60 | `{ROUTES.serviceProviders}` | 0 | intent prefetch |
| 285 | `frontend/components/settings/DraftsCenterClient.tsx` | 307 | 307 | `{resumeHref}` | 0 | intent prefetch |
| 286 | `frontend/components/settings/SettingsTabsHub.tsx` | 125 | 125 | `{ROUTES.offline.drafts}` | 0 | intent prefetch |
| 287 | `frontend/components/settings/StorageManagementClient.tsx` | 244 | 244 | `{ROUTES.offline.saved}` | 0 | intent prefetch |
| 288 | `frontend/components/settings/StorageManagementClient.tsx` | 266 | 266 | `{ROUTES.offline.sync}` | 0 | intent prefetch |
| 289 | `frontend/components/settings/StorageManagementClient.tsx` | 273 | 273 | `{ROUTES.offline.drafts}` | 0 | intent prefetch |
| 290 | `frontend/components/settings/SyncCenterClient.tsx` | 463 | 463 | `{ROUTES.offline.storage}` | 0 | intent prefetch |
| 291 | `frontend/components/settings/SyncCenterClient.tsx` | 467 | 467 | `{ROUTES.offline.drafts}` | 0 | intent prefetch |
| 292 | `frontend/components/settings/SyncCenterClient.tsx` | 553 | 553 | `{resumeHrefForDraft(d)}` | 1 | intent prefetch |
| 293 | `frontend/components/settings/SyncCenterClient.tsx` | 650 | 650 | `"/offline?tab=drafts"` | 1 | intent prefetch |
| 294 | `frontend/components/settings/UnifiedProfileSettings.tsx` | 107 | 107 | `{ROUTES.settings.notifications}` | 0 | intent prefetch |
| 295 | `frontend/components/settings/UnifiedProfileSettings.tsx` | 117 | 117 | `{ROUTES.settings.security}` | 0 | intent prefetch |
| 296 | `frontend/components/settings/UnifiedProfileSettings.tsx` | 127 | 127 | `{ROUTES.offline.drafts}` | 0 | intent prefetch |
| 297 | `frontend/components/shared/AnalyticsConsentBanner.tsx` | 45 | 45 | `{ROUTES.privacy}` | 0 | intent prefetch |
| 298 | `frontend/components/shared/EditPageHeader.tsx` | 33 | 33 | `{backTo}` | 0 | intent prefetch |
| 299 | `frontend/components/shared/Forbidden.tsx` | 50 | 50 | `{ROUTES.dashboard}` | 0 | intent prefetch |
| 300 | `frontend/components/shared/Forbidden.tsx` | 54 | 54 | `{ROUTES.home}` | 0 | intent prefetch |
| 301 | `frontend/components/shared/NetworkStatusBanner.tsx` | 109 | 109 | `"/offline?tab=saved"` | 0 | intent prefetch |
| 302 | `frontend/components/shared/NetworkStatusBanner.tsx` | 116 | 116 | `"/offline?tab=drafts"` | 0 | intent prefetch |
| 303 | `frontend/components/shared/NetworkStatusBanner.tsx` | 141 | 141 | `"/offline?tab=saved"` | 0 | intent prefetch |
| 304 | `frontend/components/shared/NetworkStatusBanner.tsx` | 165 | 165 | `"/offline?tab=saved"` | 0 | intent prefetch |
| 305 | `frontend/components/shared/SharedPayloadView.tsx` | 70 | 70 | `"/"` | 0 | intent prefetch |
| 306 | `frontend/components/shared/SharedPayloadView.tsx` | 86 | 86 | `"/"` | 0 | intent prefetch |
| 307 | `frontend/components/shared/SharedPayloadView.tsx` | 145 | 145 | `"/"` | 0 | intent prefetch |
| 308 | `frontend/components/shared/Unauthorized.tsx` | 45 | 45 | `{loginHref}` | 0 | intent prefetch |
| 309 | `frontend/components/shared/Unauthorized.tsx` | 48 | 48 | `{ROUTES.register}` | 0 | intent prefetch |
| 310 | `frontend/components/shared/feedback/ErrorBoundary.tsx` | 78 | 78 | `{ROUTES.home}` | 0 | intent prefetch |
| 311 | `frontend/components/shared/gates/RequireProfileGate.tsx` | 134 | 134 | `{`${setupHref}${setupHref.includes('?') ? '&' : '?'}from=${encodeURIComponent(from)}`}` | 0 | intent prefetch |
| 312 | `frontend/components/shared/legal/LegalPageShell.tsx` | 35 | 35 | `{item.href}` | 1 | intent prefetch |
| 313 | `frontend/components/shared/ui/Pagination.tsx` | 111 | 111 | `{buildPageUrl(currentPage - 1)}` | 0 | intent prefetch |
| 314 | `frontend/components/shared/ui/Pagination.tsx` | 137 | 137 | `{buildPageUrl(p)}` | 1 | intent prefetch |
| 315 | `frontend/components/shared/ui/Pagination.tsx` | 165 | 165 | `{buildPageUrl(currentPage + 1)}` | 0 | intent prefetch |
| 316 | `frontend/components/stores/BecomeStoreOwnerCard.tsx` | 105 | 105 | `{ROUTES.settings.seller}` | 0 | intent prefetch |
| 317 | `frontend/components/stores/CollectionProductsManager.tsx` | 61 | 61 | `{ROUTES.myStoreCollections}` | 0 | intent prefetch |
| 318 | `frontend/components/stores/CollectionProductsManager.tsx` | 89 | 89 | `{ROUTES.myStoreProductCreate}` | 0 | intent prefetch |
| 319 | `frontend/components/stores/CreateProductGate.tsx` | 46 | 46 | `{ROUTES.myStore}` | 0 | intent prefetch |
| 320 | `frontend/components/stores/CreateProductGate.tsx` | 61 | 61 | `{ROUTES.myStore}` | 0 | intent prefetch |
| 321 | `frontend/components/stores/FollowedStoresList.tsx` | 49 | 49 | `{ROUTES.stores}` | 0 | intent prefetch |
| 322 | `frontend/components/stores/MyCollectionsList.tsx` | 202 | 202 | `{ROUTES.myStoreCollectionManage(collection.id)}` | 1 | intent prefetch |
| 323 | `frontend/components/stores/MyProductsList.tsx` | 233 | 233 | `{ROUTES.myStoreProductCreate}` | 0 | intent prefetch |
| 324 | `frontend/components/stores/MyProductsList.tsx` | 298 | 298 | `{ROUTES.myStoreProductCreate}` | 0 | intent prefetch |
| 325 | `frontend/components/stores/MyProductsList.tsx` | 303 | 303 | `{ROUTES.myStoreCollections}` | 0 | intent prefetch |
| 326 | `frontend/components/stores/MyProductsList.tsx` | 308 | 308 | `{ROUTES.myStorePromotions}` | 0 | intent prefetch |
| 327 | `frontend/components/stores/MyProductsList.tsx` | 388 | 388 | `{ROUTES.myStoreProductEdit(product.id)}` | 1 | intent prefetch |
| 328 | `frontend/components/stores/MyProductsList.tsx` | 394 | 394 | `{myStoreTabHref('promotions', { productId: product.id })}` | 1 | intent prefetch |
| 329 | `frontend/components/stores/MyStoreCard.tsx` | 353 | 353 | `{ROUTES.myStoreProductCreate}` | 0 | intent prefetch |
| 330 | `frontend/components/stores/MyStoreCard.tsx` | 359 | 359 | `{ROUTES.myStoreProducts}` | 0 | intent prefetch |
| 331 | `frontend/components/stores/MyStoreCard.tsx` | 365 | 365 | `{ROUTES.myFollowedStores}` | 0 | intent prefetch |
| 332 | `frontend/components/stores/MyStoreCard.tsx` | 374 | 374 | `{ROUTES.myStore}` | 0 | intent prefetch |
| 333 | `frontend/components/stores/MyStoreCard.tsx` | 378 | 378 | `{ROUTES.storeDetail(store.id)}` | 0 | intent prefetch |
| 334 | `frontend/components/stores/MyStoreHub.tsx` | 84 | 84 | `{href}` | 0 | intent prefetch |
| 335 | `frontend/components/stores/MyStoreHub.tsx` | 146 | 146 | `{ROUTES.storeDetail(store.id)}` | 0 | intent prefetch |
| 336 | `frontend/components/stores/MyStoreHub.tsx` | 152 | 152 | `{ROUTES.myStoreAnalytics}` | 0 | intent prefetch |
| 337 | `frontend/components/stores/MyStoreHub.tsx` | 157 | 157 | `{ROUTES.myStoreSettings}` | 0 | intent prefetch |
| 338 | `frontend/components/stores/MyStoreHub.tsx` | 178 | 178 | `{myStoreTabHref('products', { availability: 'OUT_OF_STOCK' })}` | 0 | intent prefetch |
| 339 | `frontend/components/stores/MyStoreHub.tsx` | 196 | 196 | `{ROUTES.myStoreProducts}` | 0 | intent prefetch |
| 340 | `frontend/components/stores/MyStoreHub.tsx` | 209 | 209 | `{ROUTES.myStoreProductCreate}` | 0 | intent prefetch |
| 341 | `frontend/components/stores/MyStoreInventory.tsx` | 99 | 99 | `{ROUTES.myStoreProductEdit(id)}` | 0 | intent prefetch |
| 342 | `frontend/components/stores/MyStoreInventory.tsx` | 284 | 284 | `{ROUTES.myStoreProducts}` | 0 | intent prefetch |
| 343 | `frontend/components/stores/MyStoreInventory.tsx` | 402 | 402 | `{ROUTES.myStoreProductCreate}` | 0 | intent prefetch |
| 344 | `frontend/components/stores/MyStoreTabsHub.tsx` | 117 | 117 | `{ROUTES.myStoreProductCreate}` | 0 | intent prefetch |
| 345 | `frontend/components/stores/MyStoreTabsHub.tsx` | 173 | 173 | `{ROUTES.myStoreProductCreate}` | 0 | intent prefetch |
| 346 | `frontend/components/stores/ProductCard.tsx` | 173 | 173 | `{detailHref}` | 0 | intent prefetch |
| 347 | `frontend/components/stores/ProductCard.tsx` | 274 | 274 | `{detailHref}` | 0 | intent prefetch |
| 348 | `frontend/components/stores/ProductDetail.tsx` | 318 | 318 | `{ROUTES.storeDetail(store.slug \|\| store.id)}` | 0 | intent prefetch |
| 349 | `frontend/components/stores/ProductDetailSection.tsx` | 73 | 73 | `{ROUTES.search + '?type=products'}` | 0 | intent prefetch |
| 350 | `frontend/components/stores/ProductDetailSection.tsx` | 98 | 98 | `{ROUTES.home}` | 0 | intent prefetch |
| 351 | `frontend/components/stores/ProductDetailSection.tsx` | 100 | 100 | `{ROUTES.products}` | 0 | intent prefetch |
| 352 | `frontend/components/stores/ProductDetailSection.tsx` | 102 | 102 | `{ROUTES.storeDetail(product.store.slug \|\| product.storeId)}` | 0 | intent prefetch |
| 353 | `frontend/components/stores/PublicSalesStats.tsx` | 69 | 69 | `{`/stores/${data.storeId}`}` | 0 | intent prefetch |
| 354 | `frontend/components/stores/StoreCard.tsx` | 157 | 157 | `{ROUTES.storeDetail(store.id)}` | 0 | intent prefetch |
| 355 | `frontend/components/stores/StoreCollections.tsx` | 39 | 39 | `{`/stores/${storeId}?product=${product.id}`}` | 1 | intent prefetch |
| 356 | `frontend/components/stores/StoreDetailClient.tsx` | 44 | 44 | `{ROUTES.stores}` | 0 | intent prefetch |
| 357 | `frontend/components/stores/StoreHeader.tsx` | 273 | 273 | `{ROUTES.myStoreProductCreate}` | 0 | intent prefetch |
| 358 | `frontend/components/stores/StoreHeader.tsx` | 281 | 281 | `{ROUTES.myStoreProducts}` | 0 | intent prefetch |
| 359 | `frontend/components/stores/StoreHeader.tsx` | 284 | 284 | `{ROUTES.myStoreAnalytics}` | 0 | intent prefetch |
| 360 | `frontend/components/stores/StoreHeader.tsx` | 287 | 287 | `{ROUTES.myStore}` | 0 | intent prefetch |
| 361 | `frontend/components/stores/StorePendingBanner.tsx` | 33 | 33 | `{ROUTES.myStoreProducts}` | 0 | intent prefetch |
| 362 | `frontend/components/stores/StorePendingBanner.tsx` | 37 | 37 | `{ROUTES.myStorePromotions}` | 0 | intent prefetch |
| 363 | `frontend/components/stories/StoriesRail.tsx` | 32 | 32 | `"/stories"` | 0 | intent prefetch |
| 364 | `frontend/components/suggestions/SuggestionsPageClient.tsx` | 125 | 125 | `{ROUTES.home}` | 0 | intent prefetch |
| 365 | `frontend/components/suggestions/SuggestionsPageClient.tsx` | 144 | 144 | `{mode === 'trending' ? ROUTES.ads : '/login'}` | 0 | intent prefetch |
## التطابقات الأربعة التي كانت داخل التعليقات فقط

| # | الملف | السطر الأصلي | التصنيف | التصحيح |
|---:|---|---:|---|---|
| 366 | `frontend/components/profile/FavoritesList.tsx` | 297 | تعليق فقط | Reworded to describe a non-navigable placeholder without an executable JSX-looking attribute. |
| 367 | `frontend/components/profile/Timeline.tsx` | 156 | تعليق فقط | Updated to document the IntentPrefetchLink hover/focus policy and the avoided viewport request burst. |
| 368 | `frontend/components/search/EmptySearchAlternatives.tsx` | 27 | تعليق فقط | Reworded the historical note without retaining a regex-matching prefetch attribute literal. |
| 369 | `frontend/components/shared/ui/Pagination.tsx` | 8 | تعليق فقط | Changed the comment to refer to a disabled Link without embedding an executable-looking attribute. |

## ضمانات التحقق المضافة

- `frontend/scripts/prefetch-policy-audit.mjs` يفحص JSX AST بدل regex، ويتأكد من العدد الإجمالي، والعدد لكل ملف، وتطابق تعبيرات `href` مع الجرد الأصلي، وعدم بقاء `<Link prefetch={false}>` غير محوّل ضمن مصدر runtime.
- `frontend/__tests__/unit/navigation/IntentPrefetchLink.test.tsx` يغطي الإيقاف الأولي، وhover، والتركيز بلوحة المفاتيح، والحفاظ على callbacks، وتغيير href، وروابط التنزيل وmailto/hash، وفتح تبويب جديد.
- `frontend/__tests__/unit/homeLinksNoPrefetch.test.ts` يتحقق من سياسة روابط الصفحة الرئيسية.

تشغيل التحقق من داخل مجلد `frontend`:

```bash
npm run prefetch:policy-audit
npx vitest run __tests__/unit/navigation/IntentPrefetchLink.test.tsx __tests__/unit/homeLinksNoPrefetch.test.ts
npm run type-check
npm run build
```

نتيجة الفحص الساكن في بيئة إعداد الحزمة: **PASSED** — 365 رابطًا، 173 ملفًا، 6 روابط تبويب جديد مستثناة، ولا يوجد عنصر native `Link` ما زال يحمل `prefetch={false}`. كما انخفضت نتيجة فحص regex الخام من 369 إلى 365 بعد إزالة التطابقات الأربعة التي كانت داخل التعليقات. واجتاز 178 ملف TypeScript/TSX معدلًا فحص transpile النحوي دون أخطاء.

## حدود التأكيد

التأكيد هنا ساكن ومبني على AST ومقارنة الجرد والملفات؛ لا يثبت وحده أداء الإنتاج أو عدد طلبات RSC على Cloudflare. يجب تشغيل اختبار Vitest وTypeScript audit في بيئة المشروع بعد تثبيت التبعيات، ثم مقارنة عدد طلبات `_rsc` قبل/بعد على صفحة رئيسية وقائمة طويلة.

راجع التفاصيل الكاملة لكل موقع في `frontend/docs/prefetch-review-manifest.json`.
