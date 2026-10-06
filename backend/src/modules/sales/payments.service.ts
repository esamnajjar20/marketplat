// Payment orchestration intentionally lives in sales.service.ts for Phase 1.
// This facade keeps the planned module boundary stable for Phase 3 without
// duplicating payment business rules today.
export const paymentsService = {};
