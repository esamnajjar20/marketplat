# Frontend integration patches

## 1. `lib/constants.ts` — add route

Inside `ROUTES`:

```ts
  myStoreMembers:        '/my-store/members',
```

Place next to the other `myStore*` routes.

## 2. `lib/queryKeys.ts` — add keys under `stores`

```ts
  stores: {
    // ... existing keys ...
    members: (storeId: string, params?: object) =>
      ['stores', 'members', storeId, params ?? {}] as const,
    memberInvites: () => ['stores', 'member-invites'] as const,
  },
```

## 3. `components/stores/MyStoreHub.tsx` — add team shortcut

Import:
```ts
import { Users } from 'lucide-react'; // add to existing lucide import
```

In the quick-actions grid (next to products / promotions / collections / analytics):

```tsx
<Button asChild variant="outline" className="h-auto flex-col gap-1 py-3">
  <Link href={ROUTES.myStoreMembers}>
    <Users className="h-4 w-4" />
    الفريق
  </Link>
</Button>
```

## 4. Optional: re-export API from `stores.api.ts`

```ts
export { storeMembersApi } from './store-members.api';
```

Or keep hooks importing `@/api/store-members.api` directly (current approach).

## 5. ConfirmDialog props

If your `ConfirmDialog` uses different prop names (`onConfirm` vs `onConfirmClick`, `variant` vs `confirmVariant`), adjust `MemberRow` accordingly. Check:

```ts
// components/shared/feedback/ConfirmDialog.tsx
```

## 6. EmptyState `icon` prop

If EmptyState expects a ReactNode instead of a Lucide component, change to:

```tsx
<EmptyState
  icon={<Shield className="h-10 w-10" />}
  title="..."
  description="..."
/>
```

## 7. LoadingSpinner `className`

If LoadingSpinner does not accept `className`, wrap it or omit the prop.
