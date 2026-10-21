# togglebox

A small feature-flag evaluation service. One JSON config file, an in-memory
store, and a JSON HTTP API. No runtime dependencies.

## Requirements

Node.js 22.18 or newer. Node runs the TypeScript files directly ("type
stripping"), so there is no build step and nothing to install.

## Commands

```sh
npm test                                   # same as: node --test
node --test test/store.test.ts             # one test file
node --test --test-name-pattern="split"    # tests whose name matches
npm start                                  # node src/main.ts config/flags.example.json
PORT=9000 TOGGLEBOX_ADMIN_TOKEN=dev node src/main.ts config/flags.example.json
```

Then, in another terminal:

```sh
curl -s localhost:9000/v1/flags
curl -s -X POST localhost:9000/v1/evaluate/new-onboarding \
  -d '{"context":{"targetingKey":"u-7","attributes":{"email":"ana@example.test"}}}'
```

Send `SIGHUP` to the process to reload the config file.

## Layout

| File | What it does |
|---|---|
| `src/types.ts` | Config, context and result types. |
| `src/validate.ts` | `validateConfig` and `validateContext`: untrusted JSON in, typed objects or errors out. |
| `src/conditions.ts` | One targeting condition against one context. |
| `src/hash.ts` | Bucketing hash (contract: `docs/bucketing.md`). |
| `src/rollout.ts` | Percent weights → variant for a bucket. |
| `src/evaluate.ts` | `evaluateFlag`: one flag, one context, one result. |
| `src/store.ts` | `FlagStore`: load, version, evaluate, change listeners. |
| `src/server.ts` | HTTP handler and server (`docs/http-api.md`). |
| `src/log.ts` | JSON-lines logger. |
| `src/main.ts` | Process entry point. |
| `src/index.ts` | Public API. Import from here. |

The config format and evaluation rules are in `docs/flag-format.md`.

## Public API

`src/index.ts` exports `FlagStore`, `evaluateFlag`, `validateConfig`,
`validateContext`, `createServer`, `createHandler`, `createLogger` and the types.
Everything else is internal.

## Writing TypeScript in this repo

- Node only strips types; it does not compile. Use erasable syntax only: no
  `enum`, no `namespace` with values, no constructor parameter properties.
- Import local files with the `.ts` extension: `import { x } from './x.ts'`.
- Import types with `import type`, or Node treats them as values and fails.
- `tsconfig.json` is for editors and an optional `tsc` type check. Node does not read it.
