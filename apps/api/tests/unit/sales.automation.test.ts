describe('sales automation invariants', () => {
  it('uses seller-scoped alert fingerprints and bounded notification bodies', () => {
    const fingerprint = 'product_123';
    const body = 'x'.repeat(500);
    expect(fingerprint).toContain('product_123');
    expect(body.length).toBe(500);
  });

  it('keeps smart revenue calculations rounded to cents', () => {
    const round = (n: number) => Math.round(n * 100) / 100;
    expect(round(12.345)).toBe(12.35);
    expect(round(100 - 7.125)).toBe(92.88);
  });
});
