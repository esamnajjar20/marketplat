/** Public, non-personalized seller ranking row returned by GET /sellers/ranking. */
export interface SellerRankingRow {
  rank: number;
  medal: 'gold' | 'silver' | 'bronze' | null;
  sellerProfileId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
  verified: boolean;
  averageRating: number;
  totalRatings: number;
  responseTimeMinutes: number | null;
  score: number;
}
