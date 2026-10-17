// eslint.config.js
// ДЗ6 · Линтер в CI. Правила повторяют запреты из CLAUDE.md, чтобы их проверяла машина, а не только ревью:
// правило 13 — никакого any и @ts-ignore; 8 — только именованный экспорт; 14 — запрещённые библиотеки;
// 17 — inline-стили и console.log в клиентском коде. Плюс правила хуков React и доступности (jsx-a11y).
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Библиотеки, запрещённые правилом 14 CLAUDE.md: устаревшие или избыточные для проекта. */
const FORBIDDEN_PACKAGES = ['moment', 'jquery', 'lodash', 'lodash-es', 'classnames', 'decimal.js', 'big.js', 'dinero.js'];

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', '.vercel/'] },

  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Правило 13: any и подавление проверок типов.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': 'allow-with-description' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      // Пропсы описываются через interface (правило 9).
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      'no-restricted-imports': [
        'error',
        { paths: FORBIDDEN_PACKAGES.map((name) => ({ name, message: 'Запрещено правилом 14 CLAUDE.md' })) },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'Только именованный экспорт (правило 8 CLAUDE.md)' },
        { selector: "JSXAttribute[name.name='style']", message: 'Inline-стили запрещены, только Tailwind (правило 17)' },
        {
          selector: "MemberExpression[object.name='React'][property.name='FC']",
          message: 'React.FC запрещён (правило 15)',
        },
        {
          selector: "CallExpression[callee.property.name=/^(toFixed|parseFloat)$/], CallExpression[callee.name='parseFloat']",
          message: 'Для денег только целые копейки и formatRub (правило 17)',
        },
      ],
      'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },

  // Доступность разметки (NFR-2): дополняет проверку axe-core в тестах.
  {
    files: ['src/**/*.tsx'],
    ...jsxA11y.flatConfigs.recommended,
  },

  // Серверные функции Vercel и скрипты выполняются в Node.js.
  {
    files: ['api/**/*.ts', 'scripts/**/*.mjs', 'supabase/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },

  // Конфиги инструментов обязаны экспортировать default — так их читают Vite, Tailwind, PostCSS и ESLint.
  {
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-restricted-syntax': 'off' },
  },

  // В тестах допустимы пустые заглушки и non-null после явной проверки.
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**', 'supabase/tests/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
);
