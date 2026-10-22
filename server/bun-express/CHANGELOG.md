# Changelog

## 2.0.0 — 2026-10-22

- `api/<module>/route.ts` is now `routes.ts`: a default-exported `Router` whose middleware
  (rate limiters, validators, role gates) is built once as named constants and whose endpoints
  are one line each, ending in a handler from `controller.ts`.
- `controller.ts` holds the business logic. Each handler, a `(req, res)` function named after
  its operation with no suffix (`createModule`, `getMe`, `login`), holds its endpoint's logic:
  rules, writes through `service.ts`, events, provider calls. Logic another module, a job, a
  subscriber or a script needs is exported as a typed rule function under a name no handler
  uses; those rules are the module's only public API. The user and auth rules that only their
  own handlers called (`updateMe`, `listUser`, `getUser`, `register`, `login`, `refresh`,
  `logout`, `requestOtp`, `verifyOtp`) are now those handlers, `getMe` becomes the rule
  `getCallerUser(caller)` that auth calls, and health's `healthHandler` and `readyHandler(list?)`
  become `getHealth` and `getReadiness(list?)`.
- `repository.ts` is now `service.ts`: the module's queries, private to its controller. The
  rules the old `service.ts` held move into `controller.ts`; `health` loses its `service.ts`
  (it has no data).
- `api/module/` shows the pattern: handlers hold the logic, `service.ts` names its queries
  after the entity (`findModuleById`, `listModules`, `createModule`, `updateModule`,
  `deleteModule`), and create publishes `module.created`, now an event in both variants.
- Password verification moves from the user module to auth; the user controller exports
  `findUserByEmail`, which returns the stored hash beside the public user.
- `schema.ts` exports `<operation>Request` objects, the request parts `validate()` checks in
  `routes.ts` and `readInput()` reads back in the controller.
- `config/routes.ts` exports `registerRoutes(app)`, one `app.use('/api/<name>', …)` per module;
  the OpenAPI registration list moves to `openapi.ts`.
- ESLint zones and `AGENTS.md` follow the new layering.

## 1.0.0 — 2026-10-22

Moved from fullstack-dev-harness `templates/backend` (plan 005 state); auth flag; lockfile committed.
