# Issue #212: 10% rollout reaches about half of our users

**Reporter:** growth team · **Version:** togglebox 0.4.0 · **Runtime:** Node 22

## What happened

We rolled out `search-v2` to 10% of users with this flag:

```json
{
  "key": "search-v2",
  "enabled": true,
  "variants": { "treatment": true, "control": false },
  "defaultVariant": "control",
  "rollout": [
    { "variant": "treatment", "weight": 10 },
    { "variant": "control", "weight": 90 }
  ]
}
```

The dashboard shows a little more than half of all users in `treatment`.

Our nightly email job uses the Python SDK. It disagrees with the service for
many users. One example: the Python SDK puts `u-1004` in `control`, but the
service says `treatment`:

```sh
curl -s -X POST localhost:8080/v1/evaluate/search-v2 -d '{"context":{"targetingKey":"u-1004"}}'
{"flagKey":"search-v2","value":true,"variant":"treatment","reason":"SPLIT"}
```

## What we expected

- About 10% of users in `treatment`.
- Every user in the same variant as in the Python SDK. Both are supposed to
  follow `docs/bucketing.md`.

## Notes

- The Python SDK has run in production for a year. Its unit tests check the
  reference values in `docs/bucketing.md`.
- CI is green on the service.
- Users who already saw `treatment` will move when this is fixed. Product says
  that is fine: matching the contract matters more.
