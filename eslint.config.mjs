import antfu from '@antfu/eslint-config';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default antfu(
  {
    formatters: true,
    react: true,
    typescript: true,
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'ts/consistent-type-imports': 'warn',
    },
  },
  {
    rules: {
      'style/semi': 'off',
      'style/comma-dangle': 'off',
      'style/member-delimiter-style': 'off',
      'style/jsx-one-expression-per-line': 'off',
      'node/prefer-global/process': 'off',
      'style/brace-style': 'off',
      'style/arrow-parens': ['warn', 'always'],
      'ts/consistent-type-definitions': 'off',
      'style/indent': 'off',
      'style/indent-binary-ops': 'off',
      'style/no-irregular-whitespace': 'off',
      'antfu/top-level-function': 'off',
      'prefer-template': 'off',
      'react/prefer-destructuring-assignment': 'off',
      'style/quote-props': 'off',
      'react-refresh/only-export-components': 'off',
      'node/prefer-global/buffer': 'off',
      'no-console': ['warn', { allow: ['info', 'warn', 'error'] }],
      'perfectionist/sort-imports': 'warn',
      'perfectionist/sort-exports': 'warn',
      'perfectionist/sort-named-imports': 'warn',
      'prettier/prettier': 'warn',
      'ts/no-use-before-define': 'off',
      'style/operator-linebreak': 'off',
      'react/no-array-index-key': 'off',
      'style/jsx-curly-newline': 'off',
      'style/multiline-ternary': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'jsonc/sort-keys': 'warn',
      'antfu/consistent-list-newline': 'off',
    },
  },
  {
    ignores: ['node_modules', '**/*.html'],
  },
  eslintPluginPrettierRecommended
);
