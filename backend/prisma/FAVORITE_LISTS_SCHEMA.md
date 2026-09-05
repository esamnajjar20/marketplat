# schema.prisma — قوائم المفضلة

## داخل model User
```prisma
  favoriteLists             FavoriteList[]
```

## model جديد (بعد Favorite)
```prisma
model FavoriteList {
  id        String     @id @default(cuid())
  userId    String
  name      String
  sortOrder Int        @default(0)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  favorites Favorite[]

  @@unique([userId, name])
  @@index([userId, sortOrder])
  @@map("favorite_lists")
}
```

## داخل model Favorite أضف
```prisma
  listId     String?
  list       FavoriteList?       @relation(fields: [listId], references: [id], onDelete: SetNull)
```
وفهرس:
```prisma
  @@index([listId])
```
