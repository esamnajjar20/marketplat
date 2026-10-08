# Stories System

## Scope
Stories are user-authored ephemeral posts. Each story expires automatically after 24 hours and can contain either an image, text, or both.

## Visibility
- `PUBLIC`: visible to anyone who can open the profile story endpoint.
- `FOLLOWERS`: visible only to the author and users who follow the author.

## Backend
- `POST /stories` — create a story (multipart `image`, optional `text`, `background`, `visibility`).
- `GET /stories/feed` — active stories from the signed-in user and followed users, grouped into story rings.
- `GET /stories/user/:userId` — active stories for a profile; public stories can be read without authentication.
- `POST /stories/:id/view` — mark a story as viewed.
- `GET /stories/:id/viewers` — owner-only viewer list.
- `DELETE /stories/:id` — owner-only delete.

The database keeps a unique `(storyId, viewerId)` view row and indexes active-story queries. A daily scheduled cleanup removes expired stories and their Cloudinary media.

## Frontend
- Story rail on the homepage.
- Story ring on public profiles when active stories exist.
- Fullscreen viewer with progress bars, automatic advancement, previous/next controls, owner viewer list, and delete action.
- Composer for image/text stories with 24-hour visibility, background presets, and `PUBLIC`/`FOLLOWERS` privacy.
- Dedicated `/stories` page.

## Product decisions
Stories do not become followable entities and do not create broadcast notifications for every new post. The existing follow graph remains `USER / STORE / CATEGORY` only.
