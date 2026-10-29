/**
 * مسارات التطبيق المركزية — مصدر واحد بدل سلاسل مبعثرة في الشاشات.
 * متوافق مع expo-router (مسارات ملفات app/).
 */
export const routes = {
  tabs: {
    home: '/',
    explore: '/explore',
    add: '/add',
    messages: '/messages',
    account: '/account',
  },
  auth: {
    login: '/login',
    register: '/register',
    forgotPassword: '/forgot-password',
    resetPassword: '/reset-password',
  },
  ads: {
    detail: (id: string) => `/ads/${id}` as const,
    editor: '/ad-editor',
    myAds: '/my-ads',
    favorites: '/favorites',
  },
  search: '/search',
  categories: {
    list: '/categories',
    detail: (id: string) => `/categories/${id}` as const,
  },
  messages: {
    list: '/messages',
    thread: (id: string) => `/messages/${id}` as const,
  },
  services: {
    list: '/services',
    detail: (id: string) => `/services/${id}` as const,
    editor: '/service-editor',
  },
  stores: {
    list: '/stores',
    detail: (id: string) => `/stores/${id}` as const,
  },
  settings: '/settings',
  activity: '/activity',
} as const;

/** مسارات التبويبات السفلية */
export const TAB_ROUTES = [
  routes.tabs.home,
  routes.tabs.explore,
  routes.tabs.add,
  routes.tabs.messages,
  routes.tabs.account,
] as const;

export type TabRoute = (typeof TAB_ROUTES)[number];
