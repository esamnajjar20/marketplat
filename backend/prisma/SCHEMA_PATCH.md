# schema.prisma

## model Ad
storeId String?
store   StoreDetails? @relation(fields: [storeId], references: [id], onDelete: SetNull)
@@index([storeId])
@@index([storeId, status, createdAt])

## model StoreDetails
ads Ad[]
