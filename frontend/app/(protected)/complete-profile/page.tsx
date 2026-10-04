import type { Metadata } from 'next';
import { CompleteProfileForm } from '@/components/auth/CompleteProfileForm';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'استكمال التسجيل', noIndex: true });

/**
 * /complete-profile — FEAT-GOOGLE-COMPLETE-PROFILE.
 *
 * Lives under (protected) so ProtectedLayout's existing auth guard
 * (redirect to /login if not signed in) applies here for free — this
 * page only ever makes sense for an already-authenticated session
 * (the account was already created by the time Google redirects here;
 * see authController.googleCallback). No new layout/guard needed.
 */
export default function CompleteProfilePage() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-8 px-3 py-10 sm:px-4 lg:py-14">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary sm:text-4xl">أهلاً بك 👋</h1>
        <p className="mt-3 text-muted-foreground">
          خطوة أخيرة لإكمال حسابك — أخبرنا باسمك ومدينتك
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-md sm:p-8">
        <CompleteProfileForm />
      </div>
    </div>
  );
}
