/**
 * PostCSS configuration — required by Tailwind CSS v3.
 *
 * FIX POSTCSS-01: File was missing entirely. Without this, Tailwind CSS
 * does not process @tailwind directives and the app ships with zero styles.
 *
 * tailwindcss  — processes @tailwind base/components/utilities
 * autoprefixer — adds vendor prefixes for cross-browser compatibility
 */

/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss:  {},
    autoprefixer: {},
  },
};

export default config;
