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
    // Where a temporal dead zone is a crash rather than a curiosity.
    //
    // A const read before its own declaration throws the instant the code
    // runs. In a lib file that is usually harmless — a module-scope const
    // referenced inside a function that is called later never sees the dead
    // zone. In a component it is fatal and immediate: the body runs top to
    // bottom on every render, so the throw happens for everybody, on first
    // paint, with no data required.
    //
    // "Cannot access 'Q' before initialization" shipped to production and
    // into a TestFlight build exactly this way — a useEffect placed above the
    // const it depends on. Nothing else in the pipeline could see it: the
    // unit tests never mount a component, and the smoke check walks the app
    // signed-out where Photos is a trip tab and unreachable.
    files: ['src/App.jsx', 'src/components/**/*.jsx', 'src/tabs/**/*.jsx'],
    rules: {
      // A const read before its own declaration.
      //
      // "Cannot access 'Q' before initialization" shipped to production and
      // into a TestFlight build: a useEffect placed above the const it
      // depends on. It throws the instant the component renders, for
      // everybody, with no data needed — and nothing in the pipeline could
      // see it. The unit tests never mount a component; the smoke check
      // walks the app signed-out, where Photos is a trip tab and therefore
      // unreachable; and the bundler has no opinion about the order in which
      // a function reads its own variables.
      //
      // This does. It is the only check here that is *static* about
      // ordering, which is exactly what a temporal dead zone is.
      //
      // functions:false because hoisted function declarations are fine and
      // used deliberately throughout — it is let/const/class that bite.
      'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
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
