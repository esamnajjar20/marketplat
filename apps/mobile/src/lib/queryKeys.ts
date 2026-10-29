/**
 * مفاتيح استعلام موحّدة — جاهزة لـ TanStack Query أو لأي طبقة cache.
 * استخدمها بدل سلاسل نصية مبعثرة.
 */
export const queryKeys = {
  home: {
    ads: (params: { search?: string; city?: string; minPrice?: number; maxPrice?: number; sortBy?: string; sortOrder?: string }) =>
      ['home', 'ads', params] as const,
    services: () => ['home', 'services'] as const,
  },
  ads: {
    detail: (id: string) => ['ads', 'detail', id] as const,
    mine: () => ['ads', 'mine'] as const,
    favorites: (userId?: string | null) => ['ads', 'favorites', userId ?? 'guest'] as const,
  },
  messages: {
    threads: () => ['messages', 'threads'] as const,
    thread: (id: string) => ['messages', 'thread', id] as const,
    unread: () => ['messages', 'unread'] as const,
  },
  account: {
    profile: () => ['account', 'profile'] as const,
  },
  categories: {
    all: () => ['categories', 'all'] as const,
  },
} as const;
