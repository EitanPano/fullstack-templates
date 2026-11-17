// Layering is enforced here, not only described in AGENTS.md: the import rules are deny zones, so a
// new file is constrained by default, and tests/unit/boundaries.test.ts lints one violation and one
// allowed case per rule through this very config. Each message names the layer to use instead.
//
//   functions/  imports controllers, schemas, server/middleware/ and server/config/
//   workers/    imports what functions/ imports; nothing imports workers/ (a job's entry)
//   server/     imports itself, by the layer map in AGENTS.md; never functions/ or workers/
//   openapi.ts  imports every module's schema.ts and services/utils/; only scripts and tests import it
import eslint from '@eslint/js'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import { importX } from 'eslint-plugin-import-x'
import tseslint from 'typescript-eslint'

const SERVER_LAYERS = ['config', 'middleware', 'services', 'infra', 'models']
const server = (...parts) => `./server/${parts.join('/')}`
const everyServerLayer = SERVER_LAYERS.map((layer) => server(layer, '**'))
const entries = ['./functions/**', './workers/**']

export const zones = [
  {
    target: [server('**'), './functions/**'],
    from: './workers/**',
    message: 'workers/ is a Worker entry: nothing imports it, move shared code under server/.',
  },
  {
    target: [server('**'), './workers/**'],
    from: './functions/**',
    message: 'functions/ is the routing: nothing imports it, move shared code under server/.',
  },
  {
    target: server('models', '**'),
    from: [
      server('api', '**'),
      ...SERVER_LAYERS.filter((l) => l !== 'models').map((l) => server(l, '**')),
    ],
    message: 'models/ is a leaf: it imports models/ only.',
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
    // A module's service and model are private to it: the gate chain, shared layers and the
    // entries reach a module through its controller.
    target: [...everyServerLayer, ...entries],
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
    // schema.ts is the leaf of its module: the contract imports no behaviour.
    target: server('api', '**', 'schema.ts'),
    from: [
      server('middleware', '**'),
      server('infra', '**'),
      server('config', 'env.{ts,mts}'),
      server('services', 'logger.{ts,mts}'),
      server('services', 'security', '**'),
      server('api', '**', '{controller,service,model}.ts'),
    ],
    message:
      'schema.ts is the leaf of a module: it imports models/, services/utils/ and config/constants only.',
  },
  {
    target: server('openapi.ts'),
    from: [
      server('middleware', '**'),
      server('infra', '**'),
      server('config', '**'),
      server('services', 'logger.{ts,mts}'),
      server('services', 'security', '**'),
      server('api', '**', '{controller,service,model}.ts'),
    ],
    message: "openapi.ts imports every module's schema.ts and services/utils/ only.",
  },
  {
    target: [...everyServerLayer, server('api', '**'), ...entries],
    from: server('openapi.ts'),
    message:
      'openapi.ts builds the contract for scripts/openapi.ts and the tests: the request path never imports it.',
  },
  {
    target: entries,
    from: [server('services', '**'), server('infra', '**'), server('models', '**')],
    message:
      'a route file or a job entry imports controllers, schemas, server/middleware/ and server/config/: a gate or a rule belongs in one of those.',
  },
]

// A module reaches another module's controller only, and only from its controller.
const otherModule = '^\\.\\./[^./][^/]*/'
const end = '(\\.m?ts)?$'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-functions/**',
      '.wrangler/**',
      '.e2e-state/**',
      'worker-configuration.d.ts',
      'node_modules/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,js,mjs}'],
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: ['./tsconfig.json'],
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
  {
    files: ['server/**', 'functions/**', 'workers/**'],
    rules: {
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
  {
    // Declaration merging (the platform's Env, the test bindings) needs an interface.
    files: ['**/*.d.ts'],
    rules: { '@typescript-eslint/consistent-type-definitions': 'off' },
  },
  {
    // Node scripts: the runtime globals the base config does not know.
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly' },
    },
  },
)
