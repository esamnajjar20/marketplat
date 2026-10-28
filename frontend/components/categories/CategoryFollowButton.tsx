'use client';

import { UserPlus, UserMinus } from 'lucide-react';
import { useFollowStatus } from '@/hooks/queries/useFollows';
import { useToggleFollow } from '@/hooks/mutations/useFollowMutations';
import { useAuthStore } from '@/store/auth.store';

export function CategoryFollowButton({ categoryId, categoryType }: { categoryId: string; categoryType: 'AD' | 'PRODUCT' | 'SERVICE' }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { data: following = false } = useFollowStatus('CATEGORY', `${categoryType}:${categoryId}`);
  const toggle = useToggleFollow();
  if (!isAuthenticated) return null;
  return <button type="button" aria-label={following ? 'إلغاء متابعة الفئة' : 'متابعة الفئة'} disabled={toggle.isPending} onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggle.mutate({ targetType: 'CATEGORY', targetId: `${categoryType}:${categoryId}` }); }} className="mt-1 inline-flex items-center gap-1 rounded-full border border-border bg-background/90 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50">{following ? <UserMinus className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}{following ? 'متابَع' : 'متابعة'}</button>;
}
