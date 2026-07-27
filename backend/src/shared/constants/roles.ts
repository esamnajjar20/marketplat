export const ROLES = { USER: 'USER', ADMIN: 'ADMIN' } as const;
export type Role = keyof typeof ROLES;
