:::card id="mistakes" title="Mistake card M1–M10"
Ten ways coding agents go wrong, how to catch each one, and the audit step that catches it. Evidence and labs: [[agent-patch-audit#mistake-card|the full mistake card]].

| # | Agent mistake | Detect with | Step |
|---|---|---|---|
| M1 | Invented API, flag or package | Run it; `--help`; try the import; check the lock file | [[S4]], [[S11]] |
| M2 | Wrong root cause, or a symptom-only fix | Repro red → green; a second input; probe the value before the symptom | [[S6]]–[[S7]], [[S12]] |
| M3 | Test gaming: special-cased inputs, edited or skipped tests, `conftest.py` exit, always-true `__eq__` | Diff test files; `shasum -c`; held-out tests | [[S10]]–[[S12]] |
| M4 | Silent damage: deleted logic, scope creep, swallowed errors, unasked behavior changes | `git diff --stat`; read deleted lines; baseline diff; old-vs-new probe | [[S10]]–[[S13]] |
| M5 | Similar-but-different logic | Differential and property tests; vary the environment (`TZ`, locale) | [[S12]] |
| M6 | Overselling: "tests pass" with no output, claims no run supports | Re-run yourself; read the JSON `status`; claims table | [[S11]], [[S14]] |
| M7 | Solution lookup: `git log --all`, upstream fetch, memorized code | Fresh git, no remotes, canary; transcript search | [[S0]], [[S14]] |
| M8 | Answering from memory, not from the code | file:line for every claim; check with `sed -n 'Np'` or `rg` | [[S3]]–[[S4]] |
| M9 | C++ memory errors, undefined behavior | `-fsanitize=address,undefined -fno-sanitize-recover=all`; `lldb` (no LeakSanitizer on Apple clang) | [[S11]] |
| M10 | Security and dependencies: `shell=True`, `eval`/`exec`, `verify=False`, secrets, new packages | Red-flag scan; dependency diff; check each new package exists | [[S10]] |

**Red flags in a diff or a transcript** (each is a question, not a verdict)

- The same file edited and tested many times in a loop.
- A comment that names a specific test, or literals equal to expected outputs.
- Changes to tests, `conftest.py`, fixtures, CI config, requirements or lock files.
- `sys.exit`, `os._exit`, a custom `__eq__`, a broad `except:` or `except Exception: pass`.
- New `skip`/`xfail` markers, `# type: ignore`, `# noqa`, `@ts-nocheck`, `--no-verify`.
- `git log --all`, `git show` of other refs, `git cherry-pick`, `curl`/`wget`, web fetches.
- "Tests pass" with no command output shown, or an exit code read instead of `status`.
- A deleted line whose job no added line takes over.

**Scan commands** (run in the repo, `BASE` = your base SHA or tag). Line 1 scans code outside `tests/`; line 2 scans test files and every `conftest.py`; line 3 lists added or changed test and config files (only the ones you wrote may appear); line 4 shows test and dependency changes. Keep the quotes: zsh stops with "no matches found" on an unquoted pattern that matches no file.

```bash
git diff BASE -- . ':!tests' | rg -n '^\+.*(skip|xfail|sys\.exit|os\._exit|__eq__|except:|except Exception|shell=True|eval\(|exec\(|verify=False|type: ?ignore|noqa|pragma)'
git diff BASE -- tests '*conftest.py' | rg -n '^\+.*(skip|xfail|sys\.exit|os\._exit|__eq__|pytest_collection|pytest_runtest)'
git diff --name-status BASE -- tests '*conftest.py' pytest.ini tox.ini setup.cfg pyproject.toml
git diff --stat BASE -- tests/ pyproject.toml 'requirements*.txt'
```
:::
