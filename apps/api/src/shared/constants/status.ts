export const AD_STATUS = { ACTIVE: 'ACTIVE', SOLD: 'SOLD', DELETED: 'DELETED' } as const;
export type AdStatus = keyof typeof AD_STATUS;

export const REPORT_STATUS = {
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED',
} as const;
export type ReportStatus = keyof typeof REPORT_STATUS;
