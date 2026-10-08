# Social Follow System

The project now has a single social Follow graph with exactly three followable target types:

- `USER` — follow a person.
- `STORE` — follow a store.
- `CATEGORY` — follow an ad, product, or service category. Category IDs are namespaced as `AD:<id>`, `PRODUCT:<id>`, or `SERVICE:<id>` so the three existing category tables cannot collide.

Ads, products, and services are **not** followable directly. They enter the following feed because they are published by a followed person/store or belong to a followed category.

## API

- `POST /follows` — toggle `{ targetType, targetId }`.
- `GET /follows/status/:targetType/:targetId` — authenticated follow status.
- `GET /follows/me` — current user's following list, optionally filtered by `type`.
- `GET /follows/users/:id/followers` — followers of a person.
- `GET /follows/users/:id/following` — people followed by a person.
- `GET /follows/target/:targetType/:targetId/followers` — followers of any followable target.
- `GET /follows/feed` — authenticated following feed.

## Notifications

- `NEW_FOLLOWER`
- `FOLLOWED_USER_ACTIVITY`
- `FOLLOWED_STORE_ACTIVITY`
- `FOLLOWED_CATEGORY_ACTIVITY`

Users can disable these through the `followUpdates` notification preference.

## Store compatibility

The existing `StoreFollower` table remains in place for store analytics and legacy notification flows. The migration backfills it into `follows`, and the existing store follow mutation keeps both records synchronized.
