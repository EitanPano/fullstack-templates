# ADR 0017: Another frontend template beside the Worker

Status: accepted under the owner's word of 2026-11-23 ("merge it", released as `v1.16.0`); built
on the owner's word of 2026-11-23 ("do option A") after the pairing failed its gates. The rows marked ▲ are the
session's. Amends [ADR 0015](0015-several-frontends-by-directory.md) F1 ("each must use the
stack's own frontend template") and builds on
[ADR 0016](0016-one-worker-with-static-assets.md) W3. Catalog release after `v1.15.0`:
`serverless/cloudflare` and `frontend/angular` each a minor.

## Context

A product on `astro-cloudflare` wants its owner console as an Angular single-page app, beside the
Astro public site, both on the one Worker. ADR 0015 refused that pairing ("no case has run it");
this ADR runs it. The pairing

    generate --stack astro-cloudflare --frontend site=frontend/astro --frontend admin=frontend/angular

failed its gates three ways:

1. **Type check.** The Angular template's `CODES: Record<ApiErrorCode, true>` lacked
   `method_not_allowed`, a code the Worker's contract has and the two Express and FastAPI
   contracts do not.
2. **End-to-end.** Angular's `playwright.config.ts` started the Worker before the Angular build
   existed, so `assemble` refused the missing `admin/dist`; and it tested through its own static
   server (`scripts/e2e-static.mjs`, proxying `/api`), which never exercises the Worker serving
   the app.
3. **Found next.** The Worker had no single-page fallback, so a deep link such as `/some/route`
   on the admin host got the 404 page; `assemble` checks each build's Content-Security-Policy and
   the Angular `index.html` is not Astro's; the Angular specs reach the API with a Node-side
   request, which cannot resolve `*.localhost`.

## Decisions

### D1. The stack names the templates (▲)

- `stack.yaml` has an optional `frontends:` list of frontend template paths the stack has been
  run with beside its own frontend. The loader checks that each exists and is a frontend.
  `astro-cloudflare` lists `frontend/angular`.
- `--frontend <dir>=<template>` is accepted when the template is the stack's own frontend
  template or is in that list. Any other is refused, naming the stack, what it takes and the
  offending pair.
- No rule is derived from a template's manifest ("declares `static`"): a pairing is a fact about a
  stack, proved by a case, and listed by hand.

### D2. Only as one of several (▲)

A template that is not the stack's own is accepted only when the request holds more than one
frontend: the several-frontends layout (a folder per host, `run_worker_first: true`). A lone
Angular frontend beside the Worker is refused with that reason; it would be a new stack. The
stack's own template need not be among the frontends.

### D3. The single-page fallback is declared by the template (▲)

- `static` in `template.yaml` takes an optional `fallback`, a file name relative to `out`.
  `frontend/angular` declares `static: { out: dist, fallback: index.html }`.
- The `__FRONTENDS__` entries carry `fallback` when declared; an entry without it is as before,
  so existing projects rebuild unchanged.
- In the several-frontends variant of `server/middleware/frontend-host.ts`, when the assets answer
  404 to a GET or HEAD on a host whose frontend has a fallback and the path's last segment has no
  dot, the Worker answers that frontend's fallback file with status 200 and
  `cache-control: no-cache`. A path with a dot stays a 404 (a missing script is never answered
  with HTML); other methods are as they were; the refusals (unknown host, encoded `%2f`, `%5c`,
  `%2e`) still come first; a redirect's `Location` still loses the folder. The assets may redirect
  `/admin/index.html` to `/admin/` (`html_handling`); the Worker follows that one same-folder
  redirect itself.
- The Worker reads which frontends have a fallback from the generated `__FRONTENDS__` list, as
  `config/env.ts` reads the directories: no new variable.

### D4. Angular knows its API's kind (▲)

- A frontend reads one more fact, `server:serverless`: the plan's API is a `serverless` package.
  The name is reserved (no flag of any template can be called `serverless`).
- `frontend/angular/base` uses it three ways. `src/app/models/api/constant.ts` lists
  `method_not_allowed` only beside a serverless API (the no-serverless variant is unchanged);
  `playwright.config.ts` has a third mode beside the Worker: the origin is
  `http://<dir>.localhost:<port>`, and one web server builds this app and then runs the Worker's
  chain with `--only <dir>`, so the e2e exercises the Worker serving the app; and the specs'
  Node-side `request` goes to `127.0.0.1` with the host header set, as in `frontend/astro`.
- ▲ The copy `errors.method_not_allowed` is in `en.json` and `he.json` for every variant: JSON has
  no marker syntax, so it cannot be conditional. It is one unused key beside an Express or FastAPI
  server.

### D5. Content-Security-Policy (▲)

Angular pages are not served beside the Worker without a script policy. Beside a serverless API
only, `src/index.html` carries `<meta http-equiv="Content-Security-Policy" content="script-src
'self'; script-src-attr 'none'">`, which `assemble` accepts (`checkPagePolicy`: 'self' and hashes only
for script and style sources). The build holds no inline script and no inline handler: the theme
script is the file `public/theme-init.js`, and `angular.json` already sets
`optimization.styles.inlineCritical: false` in every variant, so no change to it was needed.
`assemble` also writes the fixed header line under `/<dir>/*`. The two halves intersect in the
browser. `style-src` is left open: Angular inserts component styles at runtime, and the template's
nginx policy (`style-src 'self' https: 'unsafe-inline'`) does not apply beside the Worker.
The Astro frontend's policy is not touched. Open: a `style-src`, which needs a nonce Angular can
use (out of scope).

## Alternatives considered

- **A "declares `static`" rule.** Any frontend template with a static build beside a serverless
  API. It needs no list, and it promises pairings nobody has run: Vue and React beside the Worker
  would be accepted on a guess. Rejected for D1.
- **A rule-only release,** leaving the wiring to the product. The generator accepts the pairing
  and the product fixes the type check, the e2e and the fallback itself. Every product would
  repeat the same three fixes, and the harness would own a pairing the catalog never ran.
- **An `angular-cloudflare` stack.** A stack of its own (Angular alone beside the Worker). It
  answers a different question: a product whose only frontend is a single-page app. It doubles the
  Worker's cases and was not asked for.

## Consequences

- A product may serve a public Astro site and an Angular console from one Worker; the catalog
  runs that case (`frontend/astro/two-templates`) with its e2e.
- The Worker is the first server template to answer with something other than the platform's
  assets for a missing path; its tests guard on the generated list, so they run in the cases that
  hold a single-page frontend.
- `frontend/angular` keeps its Dockerfile and nginx files in a generated package beside the Worker;
  nothing uses them (a Worker plan has no Compose file).
- Policy served to Angular pages beside the Worker: the meta above plus the fixed header line
  `base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; connect-src
  'self'; img-src 'self' data:; font-src 'self'; media-src 'self'; frame-src 'self'; worker-src
  'self'; manifest-src 'self'` under `/admin/*`. Scripts are limited to the same origin; styles
  are not restricted. `ng serve` beside the Worker also reads the meta; it is not gated.
- `errors.method_not_allowed` is in `en.json` and `he.json` in every Angular variant (JSON has no
  marker syntax): one unused key beside an Express or FastAPI server. Accepted by the owner's
  delegate (the lead) on 2026-11-23, so those two files are not byte-for-byte unchanged.

## Out of scope

A lone single-page frontend beside the Worker. React or Vue beside the Worker. A nonce-based
Content-Security-Policy for Angular. A `fallback` on a server's `STATIC_DIR` serving (it has one).
