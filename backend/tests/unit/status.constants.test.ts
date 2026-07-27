import { AD_STATUS, REPORT_STATUS } from '../../src/shared/constants/status';

describe('status constants', () => {
  it('exports ad statuses', () => {
    expect(AD_STATUS.ACTIVE).toBe('ACTIVE');
    expect(AD_STATUS.SOLD).toBe('SOLD');
    expect(AD_STATUS.DELETED).toBe('DELETED');
  });

  it('exports report statuses', () => {
    expect(REPORT_STATUS.PENDING).toBe('PENDING');
    expect(REPORT_STATUS.RESOLVED).toBe('RESOLVED');
    expect(REPORT_STATUS.DISMISSED).toBe('DISMISSED');
  });
});
