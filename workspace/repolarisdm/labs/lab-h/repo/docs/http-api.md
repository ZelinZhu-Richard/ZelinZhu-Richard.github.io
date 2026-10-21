# HTTP API

All bodies are JSON. Errors look like `{ "error": "message" }`, sometimes with a
`details` array of strings. Request bodies are limited to 1 MiB (413 above that).

| Method and path | Body | Success | Errors |
|---|---|---|---|
| `GET /healthz` | — | `200 { "status": "ok", "version": 3 }` | 405 |
| `GET /v1/flags` | — | `200 { "version", "flags": [summary, ...] }`, sorted by key | 405 |
| `POST /v1/evaluate/:key` | `{ "context": {...} }` | `200` evaluation result | 400 bad JSON or context, 404 unknown flag |
| `POST /v1/evaluate` | `{ "context": {...} }` | `200 { "version", "results": { key: result } }` | 400 |
| `PUT /v1/config` | a full config | `200 { "version", "changed": [keys] }` | 400 invalid config (`details` = errors), 401, 403 |

## Context

```json
{ "context": { "targetingKey": "u-7", "attributes": { "plan": "pro", "seats": 3, "tags": ["eu"] } } }
```

Attribute values are strings, numbers, booleans or arrays of strings. Unknown
context fields are a 400. An empty body means an empty context.

## Flag summary (`GET /v1/flags`)

```json
{
  "key": "maintenance-banner",
  "description": "",
  "enabled": false,
  "variants": ["show", "hide"],
  "defaultVariant": "show",
  "offVariant": "hide",
  "rules": 0,
  "rollout": false
}
```

`rules` is the number of rules. `rollout` says whether the flag has a fallthrough
rollout. Variant values are not listed.

## Admin

`PUT /v1/config` replaces the whole config. It needs the header
`Authorization: Bearer <token>`, where the token comes from the
`TOGGLEBOX_ADMIN_TOKEN` environment variable. Without that variable the endpoint
answers 403. A rejected config changes nothing.
