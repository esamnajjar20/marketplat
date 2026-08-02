import { Request, Response, NextFunction } from 'express';
import { searchService } from './search.service';
import { searchQuerySchema, searchSuggestionsQuerySchema } from './search.validation';
import { successResponse } from '../../shared/types/api-response.types';

export const searchController = {
  // Response shape follows every other paginated list endpoint in the
  // codebase (data: T[] directly, meta.pagination separately) — see
  // frontend's lib/apiPagination.ts's FIX API-SHAPE-01 comment for why
  // that specific split is load-bearing: unwrapPaginated() (reused
  // as-is by search.api.ts) assumes it verbatim for every list hook in
  // the app. A results-nested-under-data shape would silently break
  // that shared helper for this one endpoint only.
  search: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = searchQuerySchema.parse({ query: req.query });
      const result = await searchService.search(query);
      res
        .status(200)
        .json(successResponse('Search results', result.results, { pagination: result.pagination }));
    } catch (error) {
      next(error);
    }
  },

  suggest: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = searchSuggestionsQuerySchema.parse({ query: req.query });
      const suggestions = await searchService.suggest(query);
      res.status(200).json(successResponse('Search suggestions', { suggestions }));
    } catch (error) {
      next(error);
    }
  },
};
