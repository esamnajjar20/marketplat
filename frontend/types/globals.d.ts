/**
 * FIX CSS-MODULES-01: Next 15 no longer ships `declare module '*.css'`
 * in next-env.d.ts, and deep imports like `@fontsource/cairo/500.css`
 * are not resolved by the wildcard either. Declare them explicitly.
 */

// Bare CSS imports
declare module '*.css';
declare module '*.scss';
declare module '*.sass';

// @fontsource deep CSS imports
declare module '@fontsource/*';
declare module '@fontsource/*/*.css';
