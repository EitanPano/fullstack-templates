import eslint from '@eslint/js'
import importX, { createNodeResolver } from 'eslint-plugin-import-x'
import tseslint from 'typescript-eslint'

// Layering is enforced here, not only described in backend/AGENTS.md: the import table there is
// encoded as deny zones, so a new file or subdirectory is constrained by default. Leaves:
// models/ imports models/ only; config/constants.ts and config/env.ts import nothing from
// src/; config/cors.ts imports config/env.ts; services/utils/ is pure. Named rules:
// config/routes.ts is imported by server.ts and openapi.ts only and imports route.ts and
// schema.ts only; infra/dependency.ts is open except to the leaves; stores (infra/ files other
// than dependency.ts and pubsub.ts) are reached through services/db.ts and cache.ts, the bus
// through services/event.ts; route/controller/service/schema never touch db.ts or cache.ts,
// controllers and routes never publish. Per layer, the table's "may import" lists are deny
// zones for everything else (route, controller, service, schema, repository/model, middleware,
// services, infra, server.ts, openapi.ts, index.ts). infra/ imports api/ only in jobs/,
// subscribers/ and scripts/, and there only controllers, schemas (type-only) and, in scripts,
// model.ts. Nothing imports index.ts; only index.ts imports server.ts; only config/routes.ts
// imports a route.ts. Cross-module imports are the regex blocks below.
// Not enforced (review): a vendor SDK package is imported only by its services/<vendor>.ts;
// a route holds no logic beyond mounting, validating, one controller call and the response;
// a controller forwards the caller; a cross-module flow is not atomic; which module has a // @auth
// a cross-module flow is not atomic; which module has a // @noauth
// service.ts.
// src() turns a trailing `.ts` into `.{ts,mts}`, so every single-file pattern ends in a brace
// and is recognised as a glob on Windows (a pattern with a single `*` or `!(…)` and no brace
// is not), which also keeps `from` from mixing globs and plain paths. A directory pattern
// ends in `**` and carries no extension: it matches every file below it.
const src = (p) => `./src/${p.replace(/\.ts$/, '.{ts,mts}')}`
const moduleFile = (names) => src(`api/**/${names}.ts`)

// Every group of src/ files, so a rule can say "everything except".
const g = {
  models: src('models/**'),
  config: src('config/**'),
  middleware: src('middleware/**'),
  api: src('api/**'),
  infra: src('infra/**'),
  services: src('services/**'),
  server: src('server.ts'),
  index: src('index.ts'),
  openapi: src('openapi.ts'),
}
const everythingBut = (...keep) =>
  Object.entries(g)
    .filter(([k]) => !keep.includes(k))
    .map(([, v]) => v)

// "All of services/ except …": top-level files, then directories, then single files inside a
// kept directory (`inside: { security: ['cookies'] }`). Unlisted files and directories are in. // @auth
// kept directory (`inside: { <directory>: ['<file>'] }`). Unlisted files and directories are in. // @noauth
const servicesExcept = ({ files = [], dirs = [], inside = {} } = {}) => {
  const skipDirs = [...dirs, ...Object.keys(inside)]
  return [
    files.length > 0 ? `services/!(${files.join('|')}).ts` : 'services/*.ts',
    skipDirs.length > 0 ? `services/!(${skipDirs.join('|')})/**` : 'services/*/**',
    ...Object.entries(inside).flatMap(([dir, kept]) => [
      `services/${dir}/!(${kept.join('|')}).ts`,
      `services/${dir}/*/**`,
    ]),
  ].map(src)
}
// "All of infra/ except …": top-level files, then directories.
const infraExcept = ({ files = [], dirs = [] } = {}) =>
  [
    files.length > 0 ? `infra/!(${files.join('|')}).ts` : 'infra/*.ts',
    dirs.length > 0 ? `infra/!(${dirs.join('|')})/**` : 'infra/*/**',
  ].map(src)
const configExcept = (...kept) => src(`config/!(${kept.join('|')}).ts`)
const NOT_STORE_DIRS = ['jobs', 'subscribers', 'scripts']
const stores = infraExcept({ files: ['dependency', 'pubsub'], dirs: NOT_STORE_DIRS })
const outsideInfra = (...serviceExceptions) => [
  g.models,
  g.config,
  g.api,
  g.middleware,
  g.server,
  g.index,
  g.openapi,
  ...serviceExceptions,
]

const layering = [
  // Leaves
  {
    target: g.models,
    from: everythingBut('models'),
    message: 'models/ imports models/ only',
  },
  {
    target: [src('config/constants.ts'), src('config/env.ts')],
    from: [...everythingBut('config'), src('config/cors.ts'), src('config/routes.ts')],
    message: 'config/constants.ts and config/env.ts import nothing from src/',
  },
  {
    target: src('config/constants.ts'),
    from: src('config/env.ts'),
    message: 'config/constants.ts imports nothing from src/',
  },
  {
    target: src('config/env.ts'),
    from: src('config/constants.ts'),
    message: 'config/env.ts imports nothing from src/',
  },
  {
    target: src('config/cors.ts'),
    from: [...everythingBut('config'), src('config/constants.ts'), src('config/routes.ts')],
    message: 'config/cors.ts imports config/env.ts only',
  },
  {
    target: src('services/utils/**'),
    from: [
      g.api,
      g.middleware,
      g.infra,
      ...servicesExcept({ dirs: ['utils'] }),
      g.server,
      g.index,
      g.openapi,
      src('config/cors.ts'),
      src('config/routes.ts'),
    ],
    message:
      'services/utils/ is pure: it imports models/, config/constants.ts, config/env.ts and services/utils/ only',
  },

  // config/routes.ts
  {
    target: src('config/routes.ts'),
    from: [
      g.models,
      g.middleware,
      g.infra,
      g.services,
      g.server,
      g.index,
      g.openapi,
      configExcept('routes'),
      moduleFile('{controller,service,repository,model}'),
    ],
    message: 'config/routes.ts imports every module route.ts and schema.ts and nothing else',
  },
  {
    target: [g.models, g.api, g.middleware, g.infra, g.services, g.index, configExcept('routes')],
    from: src('config/routes.ts'),
    message: 'config/routes.ts is imported by server.ts and openapi.ts only',
  },

  // infra/dependency.ts and the stores
  {
    target: [g.models, g.config, src('services/utils/**')],
    from: src('infra/dependency.ts'),
    message: 'infra/dependency.ts is not imported by models/, config/ or services/utils/',
  },
  {
    target: outsideInfra(...servicesExcept({ files: ['db', 'cache'] })),
    from: stores,
    message:
      'a store (infra/memory.ts, infra/<engine>.ts) is imported by services/db.ts, services/cache.ts and infra/ only',
  },
  {
    target: outsideInfra(...servicesExcept({ files: ['event'] })),
    from: src('infra/pubsub.ts'),
    message: 'infra/pubsub.ts is imported by services/event.ts and infra/ only',
  },

  // The store seams
  {
    target: [
      moduleFile('{route,controller,service,schema}'),
      g.middleware,
      g.server,
      g.index,
      g.openapi,
    ],
    from: src('services/db.ts'),
    message:
      'only repository.ts and model.ts (and services/) use services/db.ts: a route, controller, service, schema, middleware or entry never touches a store',
  },
  {
    target: [
      moduleFile('{route,controller,service,schema}'),
      src('middleware/!(rate-limit).ts'),
      g.server,
      g.index,
      g.openapi,
    ],
    from: src('services/cache.ts'),
    message:
      'only repository.ts and model.ts (and services/, and middleware/rate-limit.ts) use services/cache.ts',
  },
  {
    target: moduleFile('{controller,route}'),
    from: src('services/event.ts'),
    message: 'a controller or route never publishes events: a service does',
  },

  // services/
  {
    target: src('services/{db,cache}.ts'),
    from: [
      g.api,
      g.middleware,
      ...servicesExcept({ files: ['logger'], dirs: ['utils'] }),
      src('infra/{dependency,pubsub,scheduler}.ts'),
      src('infra/*/**'),
      g.server,
      g.index,
      g.openapi,
      src('config/routes.ts'),
    ],
    message:
      'services/db.ts and cache.ts import the store (infra/), services/logger.ts, services/utils/, config/ and models/ only',
  },
  {
    target: src('services/event.ts'),
    from: [
      g.api,
      g.middleware,
      ...servicesExcept({ files: ['logger'], dirs: ['utils'] }),
      ...infraExcept({ files: ['pubsub'] }),
      g.server,
      g.index,
      g.openapi,
      src('config/routes.ts'),
    ],
    message:
      'services/event.ts imports infra/pubsub.ts, services/logger.ts, services/utils/, config/ and models/ only',
  },
  {
    target: g.services,
    from: g.middleware,
    message: 'services/ never imports middleware/',
  },
  {
    target: g.services,
    from: [g.server, g.index],
    message: 'services/ never imports the server or the entry',
  },
  {
    target: servicesExcept({ files: ['db', 'cache', 'event'] }),
    from: infraExcept({ files: ['dependency'] }),
    message:
      'services/ outside the db, cache and event seams reaches infra/ through infra/dependency.ts only',
  },

  // Inside a module: what each file may import
  {
    target: moduleFile('schema'),
    from: [
      moduleFile('{route,controller,service,repository,model}'),
      g.middleware,
      g.infra,
      ...servicesExcept({ dirs: ['utils'] }),
      configExcept('constants'),
    ],
    message:
      "schema.ts is the leaf of a module: it imports services/utils/, models/, config/constants.ts and another module's schema.ts only",
  },
  {
    target: moduleFile('route'),
    from: [
      moduleFile('{service,repository,model}'),
      ...servicesExcept({ dirs: ['utils'], inside: { security: ['cookies'] } }), // @auth
      ...servicesExcept({ dirs: ['utils'] }), // @noauth
      ...infraExcept({ files: ['dependency'] }),
      configExcept('constants'),
    ],
    message:
      'a route adapts HTTP to its controller: it imports its controller and schema, middleware/, services/utils/, services/security/cookies.ts, models/, config/constants.ts and infra/dependency.ts types only', // @auth
      'a route adapts HTTP to its controller: it imports its controller and schema, middleware/, services/utils/, models/, config/constants.ts and infra/dependency.ts types only', // @noauth
  },
  {
    target: moduleFile('controller'),
    from: [
      moduleFile('{route,repository,model}'),
      g.middleware,
      ...infraExcept({ files: ['dependency'] }),
      src('config/routes.ts'),
    ],
    message:
      "a controller calls its service or another module's controller; it never touches the data layer, a route, middleware/ or infra/ (except dependency.ts)",
  },
  {
    target: moduleFile('service'),
    from: [
      moduleFile('{route,controller}'),
      g.middleware,
      ...infraExcept({ files: ['dependency'] }),
      src('config/routes.ts'),
    ],
    message:
      'a service never imports a route, a controller, middleware/ or infra/ (except dependency.ts)',
  },
  {
    target: moduleFile('{repository,model}'),
    from: [
      moduleFile('{route,controller,service,schema}'),
      g.middleware,
      g.infra,
      ...servicesExcept({ files: ['logger', 'db', 'cache'], dirs: ['utils'] }),
      configExcept('constants'),
    ],
    message:
      'the data layer is the bottom of a module: it imports services/db.ts, services/cache.ts, services/logger.ts, services/utils/, models/ and config/constants.ts only',
  },

  // api/ is reached from above only
  {
    target: [g.middleware, g.services],
    from: g.api,
    message: 'middleware/ and services/ never import api/',
  },
  {
    target: g.middleware,
    from: g.infra,
    message: 'middleware/ never imports infra/',
  },
  {
    target: [src('infra/*.ts'), src('infra/!(jobs|subscribers|scripts)/**')],
    from: g.api,
    message:
      'infra/ imports api/ only from jobs/, subscribers/ and scripts/, and only controllers and schemas',
  },
  {
    target: src('infra/{jobs,subscribers,scripts}/**'),
    from: moduleFile('{route,service,repository}'),
    message:
      'jobs, subscribers and scripts reach a module through its controller.ts and schema.ts (scripts also model.ts)',
  },
  {
    target: src('infra/{jobs,subscribers}/**'),
    from: moduleFile('model'),
    message: 'only infra/scripts/ imports a model.ts: jobs and subscribers use controllers',
  },
  {
    target: g.infra,
    from: g.middleware,
    message: 'infra/ never imports middleware: it serves it',
  },
  {
    target: g.infra,
    from: [g.server, g.index],
    message: 'infra/ never imports the server or the entry: it serves them',
  },
  {
    target: infraExcept({ dirs: ['jobs', 'subscribers', 'scripts'] }),
    from: servicesExcept({ files: ['logger', 'db', 'cache', 'session', 'event'], dirs: ['utils'] }), // @auth
    from: servicesExcept({ files: ['logger', 'db', 'cache', 'event'], dirs: ['utils'] }), // @noauth
    message:
      'infra/ outside jobs/, subscribers/ and scripts/ imports services/logger.ts, db.ts, cache.ts, session.ts, event.ts and services/utils/ only', // @auth
      'infra/ outside jobs/, subscribers/ and scripts/ imports services/logger.ts, db.ts, cache.ts, event.ts and services/utils/ only', // @noauth
  },

  // Entry points
  {
    target: [
      g.models,
      g.api,
      g.middleware,
      g.infra,
      g.services,
      g.openapi,
      configExcept('routes'),
      g.server,
      g.index,
    ],
    from: moduleFile('route'),
    message: 'only config/routes.ts imports a route.ts',
  },
  {
    target: g.server,
    from: [g.api, g.infra, g.models, ...servicesExcept({ files: ['logger'] })],
    message:
      'server.ts mounts config/routes.ts: it imports middleware/, config/, openapi.ts and services/logger.ts only',
  },
  {
    target: g.openapi,
    from: [
      g.api,
      g.infra,
      g.middleware,
      g.models,
      ...servicesExcept({ dirs: ['utils'] }),
      configExcept('routes'),
    ],
    message: 'openapi.ts imports config/routes.ts and services/utils/ only',
  },
  {
    target: g.index,
    from: [
      g.api,
      g.middleware,
      g.models,
      g.openapi,
      ...infraExcept({ files: ['dependency'] }),
      ...servicesExcept({ files: ['logger'] }),
      configExcept('env'),
    ],
    message:
      'index.ts imports config/env.ts, infra/dependency.ts, services/logger.ts and server.ts only',
  },
  {
    target: [g.models, g.api, g.middleware, g.infra, g.services, g.config, g.openapi],
    from: g.server,
    message: 'only index.ts imports the server',
  },
  {
    target: src('**'),
    from: g.index,
    message: 'nothing imports the entry',
  },
]

// Cross-module imports. A path of the form ../<module>/... is another module. The default
// block refuses all of it except a type-only import of the other module's schema.ts (a type
// carries no behaviour). Two blocks widen that for the files that may cross: controller.ts
// (the other module's controller, and its schema as a value) and schema.ts (the other
// module's schema as a value, to embed its entity). A later flat-config block replaces the
// rule for the files it matches, so each block states its whole policy.
const otherModule = '^\\.\\./[^./][^/]*/'
// A trailing .ts or .mts must not slip past an anchored name.
const end = '(\\.m?ts)?$'

export default tseslint.config(
  { ignores: ['node_modules/', 'openapi.json'] },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'import-x': importX },
    settings: {
      // no-restricted-paths needs resolved file paths; the default resolver skips .ts.
      'import-x/resolver-next': [
        createNodeResolver({ extensions: ['.ts', '.mts', '.js', '.mjs'] }),
      ],
    },
    rules: {
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read configuration through src/config/env.ts',
        },
        { object: 'Bun', property: 'env', message: 'Read configuration through src/config/env.ts' },
      ],
      'import-x/no-unresolved': ['error', { ignore: ['^bun(:|$)'] }],
      'import-x/no-useless-path-segments': 'error',
      'import-x/no-restricted-paths': ['error', { basePath: import.meta.dirname, zones: layering }],
    },
  },
  {
    files: ['src/api/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `${otherModule}(?!schema${end})`,
              message:
                "a module's behaviour is reached through its controller.ts, and only a controller.ts imports it; only controller.ts and schema.ts import another module's schema.ts as a value",
            },
            {
              regex: `${otherModule}schema${end}`,
              allowTypeImports: true,
              message:
                "another module's schema.ts is a type-only import here; only controller.ts and schema.ts import it as a value",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/api/**/controller.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'express',
              message:
                'a controller never sees HTTP: no req, res, status or Express types; the route adapter does that',
            },
          ],
          patterns: [
            {
              regex: `${otherModule}(?!(controller|schema)${end})`,
              message:
                "a controller crosses a module boundary through the other module's controller.ts (and its schema.ts)",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/api/**/schema.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `${otherModule}(?!schema${end})`,
              message:
                "a schema imports another module's schema.ts (to embed its entity) and nothing else of it",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/infra/{jobs,subscribers,scripts}/**'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `^(\\.\\./)+api/[^/]+/schema${end}`,
              allowTypeImports: true,
              message:
                "a module's schema.ts is a type-only import in jobs, subscribers and scripts",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/config/env.ts', 'tests/**'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    // Declaration merging (Express.Locals) needs an interface.
    files: ['**/*.d.ts'],
    rules: { '@typescript-eslint/consistent-type-definitions': 'off' },
  },
  {
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
)
