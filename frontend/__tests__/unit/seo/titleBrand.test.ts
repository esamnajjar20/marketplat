import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_NAME } from '@/lib/constants';

/**
 * The root layout applies `title.template = "%s | APP_NAME"`, and buildMetadata()
 * appends the brand to the Open Graph / Twitter titles as well. A route title that
 * already contains the brand therefore renders it twice
 * ("الرائج — سوق غزة | سوق غزة"). Keep brand names out of per-route titles.
 */
function collect(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (/^(page|layout)\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

describe('route metadata titles', () => {
  it('never repeat the brand name already added by the root title template', () => {
    const offenders: string[] = [];
    for (const file of collect(join(process.cwd(), 'app'))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/\btitle:\s*(['"`])((?:(?!\1).)*)\1/g)) {
        const value = match[2];
        if (value === APP_NAME) continue; // root layout default / manifest-style entries
        if (value.includes(APP_NAME) && !/\$\{APP_NAME\}/.test(value)) offenders.push(`${file}: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
