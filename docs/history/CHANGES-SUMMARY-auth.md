# ملخص التعديلات — سوق غزة (مجموعة `(auth)`)

جميع المسارات أدناه نسبية لجذر `frontend/`. انسخ كل ملف إلى نفس المسار في
مشروعك (استبدال الملفات الموجودة، وإضافة الملف الجديد `AuthDivider.tsx`).

## إصلاح الأخطاء الخمسة من تقرير الفحص

| # | الخطأ | الملفات المعدَّلة/الجديدة |
|---|---|---|
| 1🔴 | التسجيل يفقد وجهة `?from=` دائماً | `hooks/mutations/useAuthMutations.ts` (`useRegister`)، `components/auth/RegisterForm.tsx`، `components/auth/LoginForm.tsx`، `components/auth/ForgotPasswordForm.tsx` |
| 2🔴 | كل صفحة تُكرِّر `min-h-screen` فوق ما يوفره `AuthLayout` أصلاً | الصفحات الأربع في `app/(auth)/*/page.tsx` |
| 3🟡 | نمطان مختلفان لاستدعاء الـ API (React Query مقابل `useState`/`try-catch` يدوي) | `hooks/mutations/useAuthMutations.ts` (إضافة `useForgotPassword`/`useResetPassword`)، `components/auth/ForgotPasswordForm.tsx`، `components/auth/ResetPasswordForm.tsx` |
| 4🟡 | `ForgotPasswordForm` بلا رسالة خطأ ثابتة على الصفحة | `components/auth/ForgotPasswordForm.tsx` (نفس الملف أعلاه) |
| 5🟡 | `<select>` المدينة في `/register` عنصر HTML خام غير متسق | `components/auth/RegisterForm.tsx` (نفس الملف أعلاه) |

## تفاصيل كل إصلاح

**1) فقدان `from` عند التسجيل:** `useRegister` أصبح يقبل `redirectTo`
اختيارياً بنفس نمط `useLogin` بالضبط (`FIX AUTH-06` القائم أصلاً)، ويوجّه
إليه بعد النجاح بدل `/dashboard` الثابتة. `RegisterForm` يقرأ `from` من
الرابط عبر `getSafeRedirectPath` (نفس الدالة الآمنة المستخدَمة في
`LoginForm`) ويمرره. بالإضافة لذلك، كل رابط تنقّل بين صفحات `(auth)`
الأربع (تسجيل الدخول ⇄ إنشاء حساب ⇄ نسيت كلمة المرور) يُبقي على `from`
حياً عبر الـ query عند وجوده، بدل أن يُفقَد فور أول نقرة على أي رابط
مساعد.

**2) تكرار `min-h-screen`:** أُزيلت الحاوية المكررة (`min-h-screen flex
items-center justify-center px-4 bg-muted/30`) من الصفحات الأربع؛
`AuthLayout` (`app/(auth)/layout.tsx`) هو المسؤول الوحيد الآن عن
الارتفاع والتوسيط والخلفية. كل صفحة تُصدِّر محتواها المباشر
(`<div className="space-y-6">...`) فقط.

**3) توحيد نمط الـ API:** أُضيف `useForgotPassword` و`useResetPassword`
إلى `useAuthMutations.ts` بنفس شكل `useLogin`/`useRegister`
(`useMutation` من React Query). `ForgotPasswordForm` و`ResetPasswordForm`
الآن يستخدمان هذين الـ Hook بدل استدعاء `authApi` مباشرة بـ
`useState`/`try-catch` يدوي — نفس السلوك الوظيفي بالضبط، لكن بمعمارية
موحّدة عبر المجموعة الأربع كاملة.

**4) رسالة خطأ `ForgotPasswordForm`:** عند الفشل، الآن يُستدعى
`setError(...)` بالتوازي مع `toast.error(...)` — نفس نمط
`LoginForm`/`RegisterForm`/`ResetPasswordForm` الثلاثة.

**5) `<select>` المدينة:** استُبدل بمكوّن `Select` من shadcn
(`components/shared/ui/Select.tsx`) الملفوف بـ `FormField` — نفس النمط
المستخدَم فعلاً في `ProductForm`، `ServiceListingForm`،
`BecomeStoreOwnerCard`.

## كود مكرر — إصلاح إضافي غير مطلوب صراحة في التقرير

فاصل "──── أو ────" بين زر الإرسال و`GoogleAuthButton` كان مكرراً حرفياً
بين `LoginForm` و`RegisterForm`. استُخرج إلى مكوّن مشترك جديد
`components/auth/AuthDivider.tsx`.

## قائمة كاملة بالملفات في هذه الحزمة

```
frontend/app/(auth)/login/page.tsx
frontend/app/(auth)/register/page.tsx
frontend/app/(auth)/forgot-password/page.tsx
frontend/app/(auth)/reset-password/page.tsx
frontend/components/auth/LoginForm.tsx
frontend/components/auth/RegisterForm.tsx
frontend/components/auth/ForgotPasswordForm.tsx
frontend/components/auth/ResetPasswordForm.tsx
frontend/components/auth/AuthDivider.tsx        (جديد)
frontend/hooks/mutations/useAuthMutations.ts
```

لم يتغيّر `app/(auth)/layout.tsx` ولا `middleware.ts` — التعديلات كلها
داخل الصفحات الأربع ومكوّناتها ونفس ملف الـ mutations الموجود أصلاً.

## المتبقي للفحص الكامل

مجموعة `(protected)` (~24 صفحة) و`(admin)` (8 صفحات) لم تُفحصا بعد —
حسب تغطية التقرير المرفق.
