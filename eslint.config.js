import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.wrangler/**',
      '**/coverage/**',
      '**/worker-configuration.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // projectService usa el tsconfig de cada paquete del workspace; los ficheros de
        // configuración quedan fuera de esos tsconfig y se analizan con el proyecto por defecto.
        projectService: {
          allowDefaultProject: ['*.js', '*.ts', '*/*.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.es2022,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      // Un rejected sin await en un Worker se pierde en silencio y la petición responde 200.
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    // La PWA corre en el navegador y sus hooks siguen las reglas de React.
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: { ...globals.es2022, ...globals.browser } },
  },
  {
    // El propio fichero de configuración no pertenece a ningún tsconfig del workspace:
    // sin información de tipos, las reglas type-checked solo producen falsos positivos.
    files: ['eslint.config.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
