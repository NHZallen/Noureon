// Static checks of the code (npm run lint): the recommended rules only, no style rules. What the code does with a name nothing defines, a key written
// twice or a name nobody uses is not caught by a build, and a part of the page that no test loads is not caught by a test.
import js from '@eslint/js';
import globals from 'globals';

export default [
  // Other people's code, and what the build writes.
  { ignores: ['dist/**', 'public/vendor/**', 'public/sandbox/pyodide/**', 'node_modules/**', 'reports/**', '.stryker-tmp/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      // `__LANGUAGE_SPLIT__` is set by the build (scripts/language-split.mjs).
      globals: { ...globals.browser, ...globals.node, ...globals.serviceworker, __LANGUAGE_SPLIT__: 'readonly' }
    },
    rules: {
      // A name with a leading underscore is the way to leave a field out (`const { a, _left, ...rest } = x`), and a field next to a rest is left out on purpose.
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
      'no-empty': 'off'
    }
  }
];
