export type CardDensity = 'default' | 'compact';

export function isCompactDensity(value: CardDensity | string | null | undefined): value is 'compact' {
  return value === 'compact';
}
