import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

// Narrow on purpose.
//
// This exists because of one bug: a sibling component read `coversIn` out of
// another component's scope, which is a ReferenceError the moment it renders.
// `vite build` was perfectly happy — bundlers treat an unknown identifier as a
// global and leave it for the browser to complain about — so it shipped, and
// the whole app came up as "That didn't work" on a cold load.
//
// So this is not a style pass. Nothing here is about formatting or preference,
// and it is deliberately not the recommended set: a hundred warnings nobody
// reads is worse than no linter at all. Every rule below is a thing that
// breaks the app in front of somebody.
// Stamped in at build time by vite.config.js `define`, so they are real at
// runtime and unknown to a linter reading the source.
const BUILD_STAMPS = { __BUILD_ID__: 'readonly', __BUILT_AT__: 'readonly' }

export default [
  {
    // The codebase carries `eslint-disable-next-line
    // react-hooks/exhaustive-deps` comments in a couple of dozen places,
    // each one a note about why a dependency is deliberately left out. That
    // rule is not switched on here, which makes every one of those an
    // "unused directive" — twenty warnings about the absence of a rule
    // nobody asked for. The comments are worth more than the report.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  {
    files: ['src/**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, ...BUILD_STAMPS },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The one that matters.
      'no-undef': 'error',
      // A hook called conditionally corrupts React's state on the render
      // after the condition flips, which surfaces somewhere else entirely.
      'react-hooks/rules-of-hooks': 'error',
      // Assigning to a const, duplicate keys silently dropping one, an
      // unreachable branch: all of these are somebody's edit half-applied.
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',
      'no-self-assign': 'error',
      // Left-over variables are how a rename gets missed halfway.
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['api/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-undef': 'error',
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
    },
  },
]
