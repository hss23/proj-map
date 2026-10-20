import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'coverage/**', 'playwright-report/**', 'test-results/**'] },
  // Playwright fixtures call `use()`, which the React hooks rule mistakes for a hook.
  { files: ['e2e/**'], rules: { 'react-hooks/rules-of-hooks': 'off' } },
];
export default config;
