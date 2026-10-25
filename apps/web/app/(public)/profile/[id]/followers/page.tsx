import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { followsApi } from '@/api/follows.api';
import {
  PublicFollowersList,
  PublicFollowPagination,
} from '@/components/follows/PublicFollowList';
import { unwrapData } from '@/lib/apiPagination';
import type { FollowItem } from '@/api/follows.api';
import type { PaginatedResponse } from '@/types/api.types';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}

export const metadata: Metadata = { title: 'المتابعون' };

export default async function FollowersPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const requestedPage = Number(query.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  let data: PaginatedResponse<FollowItem>;
  try {
    data = unwrapData(await followsApi.userFollowers(id, { page, limit: 20 }));
  } catch {
    return (
      <main className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
        <h1 className="mb-5 text-2xl font-bold">المتابعون</h1>
        <div role="alert" className="rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">تعذّر تحميل المتابعين.</p>
          <a
            href={`/profile/${id}/followers${page > 1 ? `?page=${page}` : ''}`}
            className="mt-3 inline-flex rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            إعادة المحاولة
          </a>
        </div>
      </main>
    );
  }

  if (data.meta.totalPages > 0 && page > data.meta.totalPages) {
    redirect(`/profile/${id}/followers?page=${data.meta.totalPages}`);
  }

  const people = data.items
    .map((item) => item.follower)
    .filter((person): person is NonNullable<typeof person> => Boolean(person));

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-8">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">المتابعون</h1>
          <p className="mt-1 text-sm text-muted-foreground">الأشخاص الذين يتابعون هذا الحساب</p>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">{data.meta.total}</span>
      </div>
      <PublicFollowersList
        items={people}
        empty="لا يوجد متابعون لهذا الحساب حتى الآن."
      />
      <PublicFollowPagination
        meta={data.meta}
        page={page}
        basePath={`/profile/${id}/followers`}
      />
    </main>
  );
}
