export interface FavoriteList {
  id: string;
  name: string;
  sortOrder: number;
  itemsCount: number;
  createdAt: string;
}

export interface CreateFavoriteListPayload {
  name: string;
}

export interface RenameFavoriteListPayload {
  name: string;
}

export interface MoveFavoritePayload {
  listId: string | null;
}
