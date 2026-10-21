# ringlog

A fixed-size, in-memory log for C++17. It keeps the newest `capacity` records and
overwrites the oldest one when it is full. Each message keeps at most `max_text` bytes.

```cpp
#include "ringlog.h"

ringlog::RingLog log(256, 120);
log.push(ringlog::Level::kWarn, "disk at 91%");
std::fputs(log.dump().c_str(), stderr);   // "1 WARN disk at 91%"
```

## Build and test

```bash
make test    # optimized build, runs the tests
make asan    # AddressSanitizer + UndefinedBehaviorSanitizer build, runs the tests
make debug   # -O0 -g build for lldb
```

Needs clang++ with C++17. On macOS, Apple clang has no LeakSanitizer, so `make asan`
does not check for leaks.

## Proposed changes

`patches/` holds three proposed changes that are waiting for review. Apply one with
`git apply patches/<name>.patch` and undo it with `git checkout -- .`.

To commit a patch, use a branch, so that `main` keeps the original code: `git switch -C try main`,
then apply and commit. Go back with `git switch -f main`. `git checkout -- .` does not undo a commit.
Run `make clean` after every checkout or switch.
