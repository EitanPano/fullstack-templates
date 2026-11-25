// Layering is enforced here, not only described in AGENTS.md: the import rules are deny zones, so a
// new file is constrained by default, and tests/unit/boundaries.test.ts lints one violation and one
// allowed case per rule through this very config. Each message names the layer to use instead.
//
//   entries     server/server.ts, server/index.ts and every api/<entity>/routes.ts import
//               controllers, schemas, server/middleware/ and server/config/; nothing imports them
//   server/     imports itself, by the layer map in AGENTS.md
//   hono        only the entries, the routes.ts files and middleware/handler.ts import it
//   admin       api/admin/<entity>/ is an entity like any other; api/admin/routes.ts mounts them
//   sdk         api/sdk/<entity>/ likewise; api/sdk/routes.ts mounts them // @sdk
//   openapi.ts  imports every entity's schema.ts and services/utils/; only scripts and tests import it
import eslint from '@eslint/js'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import { importX } from 'eslint-plugin-import-x'
import tseslint from 'typescript-eslint'

const SERVER_LAYERS = ['config', 'middleware', 'services', 'infra', 'models']
const server = (...parts) => `./server/${parts.join('/')}`
const everyServerLayer = SERVER_LAYERS.map((layer) => server(layer, '**'))
const entries = [server('@(server|index).ts'), server('api', '**', 'routes.ts')]

export const zones = [
  {
    target: [
      ...everyServerLayer,
      server('api', '**', '{controller,service,model,schema}.ts'),
      server('openapi.ts'),
    ],
    from: entries,
    message:
      'server.ts, index.ts and the routes.ts files are the routing: nothing imports them, move shared code to middleware/ or the entity.',
  },
  {
    // Hono is the routing's library: a controller, a service, a schema, a model and every layer
    // but the handler adapter stay free of it, so an entity can move to another runtime.
    target: [
      server('config', '**'),
      server('services', '**'),
      server('infra', '**'),
      server('models', '**'),
      server('middleware', '**', '!(handler).ts'),
      server('api', '**', '{controller,service,model,schema}.ts'),
      server('openapi.ts'),
    ],
    from: './node_modules/hono/**',
    message:
      'Hono is imported by index.ts, server.ts, a routes.ts and middleware/handler.ts only: read the request through ctx.',
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
    message: 'middleware/ never imports api/: a gate is shared, an entity is not.',
  },
  {
    // An entity's service and model are private to it: the gate chain, shared layers and the
    // entries reach an entity through its controller.
    target: [...everyServerLayer, ...entries],
    from: server('api', '**', '{service,model}.ts'),
    message:
      "an entity's service.ts and model.ts are private: reach an entity through its controller.ts.",
  },
  {
    target: server('api', '**', '{service,model}.ts'),
    from: server('middleware', '**'),
    message:
      'the data layer never sees HTTP: the controller reads the request and calls the service.',
  },
  {
    // schema.ts is the leaf of its entity: the contract imports no behaviour.
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
      'schema.ts is the leaf of an entity: it imports models/, services/utils/ and config/constants only.',
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
    message: "openapi.ts imports every entity's schema.ts and services/utils/ only.",
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
      'an entry or a routes.ts imports controllers, schemas, server/middleware/ and server/config/: a gate or a rule belongs in one of those.',
  },
  {
    // server.ts mounts every entity's routes.ts; api/admin/routes.ts, the admin namespace's router,
    // mounts the routes.ts of the entities under it. Nothing else imports one.
    target: [
      ...everyServerLayer,
      server('api', '!(admin)', '**'), // @nosdk
      server('api', '!(admin|sdk)', '**'), // @sdk
      server('api', 'admin', '!(routes).ts'),
      server('api', 'admin', '*', '**'),
      server('api', 'sdk', '!(routes).ts'), // @sdk
      server('api', 'sdk', '*', '**'), // @sdk
      server('index.ts'),
      server('openapi.ts'),
    ],
    from: server('api', '**', 'routes.ts'),
    message:
      'only server.ts imports a routes.ts (api/admin/routes.ts imports the routes.ts of its admin entities).', // @nosdk
      'only server.ts imports a routes.ts (api/admin/routes.ts and api/sdk/routes.ts import the routes.ts of the entities under them).', // @sdk
  },
]

// An entity reaches another entity's controller only, and only from its controller.
const otherEntity = '^\\.\\./[^./][^/]*/'
const end = '(\\.m?ts)?$'
// An api/admin/<entity>/ file sits one directory deeper: a sibling admin entity is `../<entity>/`
// (otherEntity above) and a top-level entity is `../../<entity>/`.
const topLevelEntity = '^\\.\\./\\.\\./[^./][^/]*/'
// The same boundary spelled around it (`../../api/other/service`) is refused too.
const throughApi = {
  regex: '^(\\.\\./)+api/',
  message: "reach another entity as ../<entity>/controller, never through server/api/'s own path",
}

export default tseslint.config(
  {
    ignores: [
      'dist/**',
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
    files: ['server/**'],
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
              regex: `${otherEntity}(?!controller${end})`,
              message:
                'another entity is reached through its controller.ts, and only a controller.ts imports it',
            },
            throughApi,
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
              regex: `${otherEntity}`,
              message:
                "the data layer never crosses an entity boundary: a controller calls the other entity's controller",
            },
            throughApi,
          ],
        },
      ],
    },
  },
  // api/admin/<entity>/: an entity like any other, so a top-level entity two levels up counts as
  // another entity too. Each block restates its whole policy.
  {
    files: ['server/api/admin/*/**'], // @nosdk
    files: ['server/api/{admin,sdk}/*/**'], // @sdk
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `${otherEntity}(?!controller${end})`,
              message:
                'another entity is reached through its controller.ts, and only a controller.ts imports it',
            },
            {
              regex: `${topLevelEntity}(?!controller${end})`,
              message:
                "an admin entity reaches a top-level entity's data through that entity's controller.ts, and only a controller.ts imports it", // @nosdk
                "an admin or SDK entity reaches a top-level entity's data through that entity's controller.ts, and only a controller.ts imports it", // @sdk
            },
            throughApi,
          ],
        },
      ],
    },
  },
  {
    files: ['server/api/admin/*/{service,model}.ts'], // @nosdk
    files: ['server/api/{admin,sdk}/*/{service,model}.ts'], // @sdk
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `${otherEntity}`,
              message:
                "the data layer never crosses an entity boundary: a controller calls the other entity's controller",
            },
            {
              regex: `${topLevelEntity}`,
              message:
                "the data layer never crosses an entity boundary: a controller calls the entity's controller",
            },
            throughApi,
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
