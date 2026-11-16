// Layering is enforced here, not only described in AGENTS.md: the import rules are deny zones, so a
// new file is constrained by default, and tests/unit/boundaries.test.ts lints one violation and one
// allowed case per rule through this very config. Each message names the layer to use instead.
//
//   src/        imports shared/ only (never server/ or functions/)
//   functions/  imports controllers, server/middleware/, server/config/ and shared/
//   server/     imports shared/ and itself, by the layer map in AGENTS.md; never src/
//   shared/     imports nothing of the three: it is a leaf
//
// The alias hazard: import-x resolves `@alias` through whichever tsconfig owns the file, so an
// alias a project does not declare cannot match a zone. The specifier bans below match the text.
import eslint from '@eslint/js'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import astro from 'eslint-plugin-astro'
import { importX } from 'eslint-plugin-import-x'
import tseslint from 'typescript-eslint'

const SERVER_LAYERS = ['config', 'middleware', 'services', 'infra', 'models']
const server = (...parts) => `./server/${parts.join('/')}`
const everyServerLayer = SERVER_LAYERS.map((layer) => server(layer, '**'))

export const zones = [
  {
    target: './src/**',
    from: ['./server/**', './functions/**'],
    message: 'Browser code must not import server code: what both halves need goes in shared/.',
  },
  {
    target: ['./server/**', './functions/**'],
    from: './src/**',
    message: 'Server code must not import browser code: what both halves need goes in shared/.',
  },
  {
    target: './shared/**',
    from: ['./src/**', './server/**', './functions/**'],
    message: 'shared/ is a leaf: it imports nothing of src/, server/ or functions/.',
  },
  {
    target: server('models', '**'),
    from: [
      server('api', '**'),
      ...SERVER_LAYERS.filter((l) => l !== 'models').map((l) => server(l, '**')),
    ],
    message: 'models/ is a leaf: it imports models/ and shared/ only.',
  },
  {
    target: server('config', '**'),
    from: [
      server('api', '**'),
      ...SERVER_LAYERS.filter((l) => l !== 'config').map((l) => server(l, '**')),
    ],
    message: 'config/ imports nothing of server/: read the bindings here, nothing else.',
  },
  {
    target: server('services', 'utils', '**'),
    from: [
      server('api', '**'),
      server('middleware', '**'),
      server('infra', '**'),
      server('services', 'logger.{ts,mts}'),
      server('services', 'security', '**'),
    ],
    message: 'services/utils/ is pure: it imports models/, config/ and services/utils/ only.',
  },
  {
    target: server('services', '**'),
    from: [server('middleware', '**'), server('api', '**')],
    message: 'services/ never imports middleware/ or api/: they call services, not the reverse.',
  },
  {
    target: server('infra', '**'),
    from: [server('middleware', '**'), server('api', '**'), server('services', '**')],
    message: 'infra/ imports config/ and models/ only: it serves the layers above it.',
  },
  {
    target: server('middleware', '**'),
    from: server('api', '**'),
    message: 'middleware/ never imports api/: a gate is shared, a module is not.',
  },
  {
    // A module's service and model are private to it: the gate chain, shared layers and route
    // files reach a module through its controller.
    target: [...everyServerLayer, './functions/**', './shared/**'],
    from: server('api', '**', '{service,model}.ts'),
    message:
      "a module's service.ts and model.ts are private: reach a module through its controller.ts.",
  },
  {
    target: server('api', '**', '{service,model}.ts'),
    from: server('middleware', '**'),
    message:
      'the data layer never sees HTTP: the controller reads the request and calls the service.',
  },
  {
    target: './functions/**',
    from: [server('services', '**'), server('infra', '**'), server('models', '**')],
    message:
      'a route file imports controllers, server/middleware/, server/config/ and shared/: a gate or a rule belongs in one of those.',
  },
]

const toServer = {
  group: ['@server', '@server/*', '@functions', '@functions/*'],
  message: 'Browser and shared code must not import server code: what both need goes in shared/.',
}
const toSrc = {
  group: ['@src', '@src/*'],
  message: 'Server and shared code must not import browser code: what both need goes in shared/.',
}
// A module reaches another module's controller only, and only from its controller.
const otherModule = '^\\.\\./[^./][^/]*/'
const end = '(\\.m?ts)?$'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-functions/**',
      '.astro/**',
      '.wrangler/**',
      '.e2e-state/**',
      'worker-configuration.d.ts',
      'node_modules/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    files: ['**/*.{ts,js,mjs,astro}'],
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: ['./tsconfig.json', './tsconfig.server.json'],
          noWarnOnMultipleProjects: true,
        }),
      ],
    },
    rules: {
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'import-x/no-restricted-paths': ['error', { basePath: import.meta.dirname, zones }],
    },
  },
  // Alias specifiers are matched by name, so they do not depend on which tsconfig resolves them.
  // One block per directory: a later block replaces an earlier one's options for the same rule.
  { files: ['src/**'], rules: { 'no-restricted-imports': ['error', { patterns: [toServer] }] } },
  {
    files: ['shared/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [toServer, toSrc] }] },
  },
  {
    files: ['server/**', 'functions/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [toSrc] }],
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            "Read configuration through server/config/env.ts: the bindings are the request's env.",
        },
      ],
    },
  },
  {
    files: ['server/api/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            toSrc,
            {
              regex: `${otherModule}(?!controller${end})`,
              message:
                'another module is reached through its controller.ts, and only a controller.ts imports it',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['server/api/**/{service,model}.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            toSrc,
            {
              regex: `${otherModule}`,
              message:
                "the data layer never crosses a module boundary: a controller calls the other module's controller",
            },
          ],
        },
      ],
    },
  },
  { files: ['src/env.d.ts'], rules: { '@typescript-eslint/triple-slash-reference': 'off' } },
  {
    // Declaration merging (the platform's Env, the test bindings) needs an interface.
    files: ['**/*.d.ts'],
    rules: { '@typescript-eslint/consistent-type-definitions': 'off' },
  },
  {
    // The no-flash theme script runs in the browser, as a plain script.
    files: ['public/**/*.js'],
    languageOptions: {
      globals: { document: 'readonly', localStorage: 'readonly', matchMedia: 'readonly' },
    },
  },
  {
    // Node scripts: the runtime globals the base config does not know.
    files: ['**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
)
