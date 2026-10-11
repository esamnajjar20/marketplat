import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('service provider public-list cache invalidation', () => {
  const source = readFileSync(join(__dirname, '../../src/modules/service-providers/service-providers.service.ts'), 'utf8');

  it('invalidates the public directory after a provider is created', () => {
    expect(source).toContain("await bumpPublicListCache('service-providers');\n    return created;");
  });

  it('hard-hides providers transitioned to UNAVAILABLE', () => {
    expect(source).toContain("if (updated.availabilityStatus === 'UNAVAILABLE') {");
    expect(source).toContain("await hidePublicEntities('service-providers');");
  });
});
