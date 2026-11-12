import fs from 'fs';
import path from 'path';

/**
 * Guards the folder layout described in docs/ARCHITECTURE.md:
 *
 *   src/modules/<domain>/<module>/   feature code (controller/service/repository/...)
 *   src/routes/<domain>.routes.ts    one route registry per domain
 *   src/shared, src/config, src/middlewares   must NOT depend on src/modules
 *
 * Pure filesystem checks — no DB / Redis needed.
 */
const SRC = path.resolve(__dirname, '../../src');
const MODULES = path.join(SRC, 'modules');
const IMPORT_RE = /(?:from|import|require\(|mock\()\s*['"](\.[^'"]*)['"]/g;

// Known, deliberate exceptions. Keep this list shrinking, never growing.
const SHARED_TO_MODULES_ALLOWLIST = new Set<string>([
  // Key constants kept next to home.validation (HOME_CITIES); see home.cache.keys.ts header.
  'shared/cache/publicListCache.ts -> modules/discovery/home/home.cache.keys',
]);

// Domain-to-domain imports that exist today (a ratchet, not an endorsement:
// many are mutual). A NEW edge fails the test -- decide deliberately, then add it here.
const ALLOWED_DOMAIN_EDGES = new Set<string>([
  'classifieds>commerce',
  'classifieds>discovery',
  'classifieds>engagement',
  'classifieds>identity',
  'classifieds>services',
  'classifieds>trust',
  'commerce>discovery',
  'commerce>engagement',
  'commerce>identity',
  'commerce>trust',
  'discovery>classifieds',
  'discovery>commerce',
  'discovery>services',
  'engagement>classifieds',
  'engagement>commerce',
  'engagement>identity',
  'engagement>services',
  'engagement>trust',
  'identity>classifieds',
  'identity>commerce',
  'identity>engagement',
  'identity>services',
  'identity>trust',
  'platform>classifieds',
  'platform>commerce',
  'platform>engagement',
  'platform>identity',
  'services>engagement',
  'services>identity',
  'services>trust',
  'trust>classifieds',
  'trust>commerce',
  'trust>engagement',
  'trust>identity',
  'trust>services',
]);

function listTs(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listTs(full, out);
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function importsOf(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8');
  const found: string[] = [];
  let m: RegExpExecArray | null;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(text))) {
    found.push(path.relative(SRC, path.resolve(path.dirname(file), m[1])).split(path.sep).join('/'));
  }
  return found;
}

const rel = (f: string): string => path.relative(SRC, f).split(path.sep).join('/');

describe('backend architecture', () => {
  const domains = fs
    .readdirSync(MODULES, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  it('src/modules contains only domain folders, each with a route registry', () => {
    expect(domains.length).toBeGreaterThan(0);
    for (const domain of domains) {
      expect(fs.existsSync(path.join(SRC, 'routes', `${domain}.routes.ts`))).toBe(true);
    }
  });

  it('every module folder sits inside a domain (modules/<domain>/<module>/...)', () => {
    for (const domain of domains) {
      const entries = fs.readdirSync(path.join(MODULES, domain), { withFileTypes: true });
      const strayFiles = entries.filter(e => e.isFile()).map(e => `${domain}/${e.name}`);
      expect(strayFiles).toEqual([]); // a domain only holds module folders
    }
  });

  it('shared/, config/ and middlewares/ do not depend on modules/', () => {
    const violations: string[] = [];
    for (const layer of ['shared', 'config', 'middlewares']) {
      for (const file of listTs(path.join(SRC, layer))) {
        for (const target of importsOf(file)) {
          if (target.startsWith('modules/')) {
            const edge = `${rel(file)} -> ${target}`;
            if (!SHARED_TO_MODULES_ALLOWLIST.has(edge)) violations.push(edge);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('every module is reachable from exactly one domain (no duplicate module names)', () => {
    const seen = new Map<string, string>();
    for (const domain of domains) {
      for (const mod of fs.readdirSync(path.join(MODULES, domain), { withFileTypes: true }).filter(e => e.isDirectory())) {
        expect(seen.has(mod.name)).toBe(false);
        seen.set(mod.name, domain);
      }
    }
  });

  it('module files use kebab-case names (shared/ keeps camelCase)', () => {
    const bad = listTs(MODULES)
      .map(rel)
      .filter(f => /[A-Z]/.test(path.basename(f)));
    expect(bad).toEqual([]);
  });

  it('every module folder exposes an index.ts', () => {
    const missing: string[] = [];
    for (const domain of domains) {
      for (const mod of fs.readdirSync(path.join(MODULES, domain), { withFileTypes: true }).filter(e => e.isDirectory())) {
        if (!fs.existsSync(path.join(MODULES, domain, mod.name, 'index.ts'))) missing.push(`${domain}/${mod.name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('no new domain-to-domain dependencies appear (ratchet)', () => {
    const found = new Set<string>();
    for (const file of listTs(MODULES)) {
      const from = rel(file).split('/')[1];
      for (const target of importsOf(file)) {
        const parts = target.split('/');
        if (parts[0] === 'modules' && parts[1] && parts[1] !== from && domains.includes(parts[1])) found.add(`${from}>${parts[1]}`);
      }
    }
    const added = [...found].filter(e => !ALLOWED_DOMAIN_EDGES.has(e)).sort();
    expect(added).toEqual([]);
  });
});
