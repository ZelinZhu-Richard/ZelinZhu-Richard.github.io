# Feature request: prerequisite flags

## Why

The checkout team ships `new-checkout` only to users who already get the new
payments backend (`payments-v2` = `on`). Today they copy the targeting rules of
`payments-v2` into `new-checkout` by hand, and the copies drift. They want to
say "this flag depends on that flag" once.

## Config

A flag gets an optional field `prerequisites`: a list of
`{ "flag": "<flag key>", "variant": "<variant name>" }`.

```json
{
  "key": "new-checkout",
  "enabled": true,
  "variants": { "on": true, "off": false },
  "defaultVariant": "on",
  "offVariant": "off",
  "prerequisites": [{ "flag": "payments-v2", "variant": "on" }]
}
```

## Evaluation rules

1. A disabled flag still serves `offVariant` with reason `DISABLED`. Its
   prerequisites are not checked.
2. For an enabled flag, check the prerequisites **in list order, before any
   rule**. Evaluate each prerequisite flag with the **same context**, including
   that flag's own prerequisites.
3. A prerequisite is **met** only when the prerequisite flag's result has reason
   `TARGETING_MATCH`, `SPLIT` or `DEFAULT`, **and** its variant is the required
   variant. So a disabled prerequisite flag, or one whose own prerequisites
   failed, never meets a prerequisite, even if it serves the required variant.
4. If a prerequisite is not met, stop. The result is the flag's `offVariant`,
   with reason `PREREQUISITE_FAILED` and a new field `prerequisite` set to the
   key of the **first** unmet prerequisite.
5. If all prerequisites are met, evaluate the flag as today (rules, rollout, default).
   The result has no `prerequisite` field.

Example result:

```json
{ "flagKey": "new-checkout", "value": false, "variant": "off", "reason": "PREREQUISITE_FAILED", "prerequisite": "payments-v2" }
```

## Validation

A config is rejected as a whole (as today) when:

- `prerequisites` is not an array, or an item is not `{ "flag": string, "variant": string }`;
- a prerequisite names a flag that is not in the same config (the error message
  must contain both flag keys);
- a prerequisite names a variant that the prerequisite flag does not have (the
  error message must contain the prerequisite flag key and the variant name);
- prerequisites form a cycle, directly (`a` needs `a`) or through other flags
  (`a` → `b` → `c` → `a`). The error message must contain the word `cycle`.

Two flags may share a prerequisite. For example `a` needs `b` and `c`, and both
`b` and `c` need `d`. That is not a cycle and must load.

## API

- `FlagStore#evaluate` and `FlagStore#evaluateAll` apply prerequisites.
- `POST /v1/evaluate/:key` and `POST /v1/evaluate` return the new reason and field.
- `GET /v1/flags`: each summary gets `prerequisites`, the list of prerequisite
  flag keys in config order (`[]` when there are none).
- `PUT /v1/config` with an invalid prerequisite answers 400 with the errors in `details`.
- Configs without `prerequisites` behave exactly as before. `evaluateFlag` keeps
  working for flags without prerequisites.

## Done when

- The behavior above works through `FlagStore` and the HTTP API.
- `docs/flag-format.md` documents the field and the new reason.
- Tests cover the rules above. All old tests still pass.
