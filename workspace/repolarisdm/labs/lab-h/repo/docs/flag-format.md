# Flag config format

A config is one JSON object with a `flags` array. `validateConfig` checks it.
If any flag has an error, the whole config is rejected and the store keeps the
config it had before. Unknown fields are errors, so typos do not pass silently.

```json
{
  "flags": [
    {
      "key": "new-onboarding",
      "description": "Three-step onboarding",
      "enabled": true,
      "variants": { "on": true, "off": false },
      "defaultVariant": "off",
      "offVariant": "off",
      "salt": "onboarding-2026",
      "rules": [
        {
          "name": "internal",
          "conditions": [{ "attribute": "email", "op": "ends_with", "value": "@example.test" }],
          "variant": "on"
        }
      ],
      "rollout": [
        { "variant": "on", "weight": 20 },
        { "variant": "off", "weight": 80 }
      ]
    }
  ]
}
```

## Flag fields

| Field | Required | Meaning |
|---|---|---|
| `key` | yes | Unique. Lowercase letters, digits, `.`, `_`, `-`; at most 64 characters. |
| `description` | no | Free text. |
| `enabled` | yes | `false` serves `offVariant` to everyone. |
| `variants` | yes | Name → JSON value. At least one. |
| `defaultVariant` | yes | Served when nothing else applies. |
| `offVariant` | no | Served when the flag is disabled. Defaults to `defaultVariant`. |
| `salt` | no | Bucketing seed (see `bucketing.md`). Defaults to `key`. |
| `rules` | no | Targeting rules, checked in order. Defaults to `[]`. |
| `rollout` | no | Fallthrough split, used when no rule matches. |

A **rule** has `conditions` (all must match; an empty list matches everyone) and
exactly one of `variant` (serve that variant) or `rollout` (split the matching users).

A **rollout** is a list of `{ "variant", "weight" }`. Weights are percents from 0
to 100 with at most two decimals, and they add up to exactly 100.

## Conditions

`{ "attribute": "plan", "op": "in", "value": ["pro", "team"] }`

The attribute is read from `context.attributes`. The special name `targetingKey`
reads `context.targetingKey`. **A missing attribute never matches**, for every
operator, including `neq` and `not_in`.

| `op` | `value` type | Matches when |
|---|---|---|
| `eq`, `neq` | string, number or boolean | strict equality (no type coercion) / its negation |
| `in`, `not_in` | array of strings | the string attribute is / is not in the array |
| `gt`, `gte`, `lt`, `lte` | number | the attribute is a number and the comparison holds |
| `starts_with`, `ends_with` | string | the string attribute starts / ends with `value` |
| `contains` | string | substring of a string attribute, or exact element of a list attribute |

## Evaluation order

1. Flag disabled → `offVariant`, reason `DISABLED`.
2. First rule whose conditions all match → its variant (`TARGETING_MATCH`) or its
   split (`SPLIT`). The result carries `ruleIndex`.
3. No rule matched and the flag has a `rollout` → split (`SPLIT`, no `ruleIndex`).
4. Otherwise → `defaultVariant`, reason `DEFAULT`.

A split needs `context.targetingKey`. Without it the result is `defaultVariant`
with reason `ERROR` and `errorCode: "TARGETING_KEY_MISSING"`.

## Result shape

```json
{ "flagKey": "new-onboarding", "value": true, "variant": "on", "reason": "TARGETING_MATCH", "ruleIndex": 0 }
```

| `reason` | Meaning |
|---|---|
| `DISABLED` | Flag is off. |
| `TARGETING_MATCH` | A rule served a fixed variant. |
| `SPLIT` | A percentage split chose the variant. |
| `DEFAULT` | Nothing matched. |
| `ERROR` | See `errorCode`: `FLAG_NOT_FOUND` or `TARGETING_KEY_MISSING`. |
