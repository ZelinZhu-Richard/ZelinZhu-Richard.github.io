# freebusy-merge: a task and its grader

This folder holds one eval task in the Harbor layout, plus a corpus of candidate solutions.
Your job is to make the grader trustworthy.

```
task/
  instruction.md        the prompt an agent gets (the spec)
  task.toml             Harbor task settings
  environment/          Dockerfile + the app the agent works in (/app)
  solution/solve.sh     the reference solution
  tests/test.sh         the verifier: writes 1 or 0 to /logs/verifier/reward.txt
solutions/              other candidate solutions (alt-*, wrong-*, do-nothing)
run_task.sh             runs a solution against the verifier, like one Harbor trial
```

## What is yours to change

Only `task/tests/`. Keep `test.sh` as the entry point. Add any files you need next to it.
Do not change `instruction.md`, `environment/` or `solutions/`.

## Run

```sh
bash run_task.sh reference            # one trial; prints the verifier output; writes reward.txt
bash run_task.sh wrong-2              # any folder name under solutions/
bash run_task.sh --all                # the validation matrix for the current verifier
bash run_task.sh --all --runs 3       # same, 3 runs each, to catch flaky checks
bash run_task.sh --all --docker       # inside Docker with no network (needs Docker)
```

Logs go to `runs/`. Each trial starts from a fresh copy of `task/environment/app`.
The solution runs first. The tests are copied in only after it finishes, as in Harbor.

Local mode is fast but it is not a sandbox: a solution runs as you, on your machine.
Use `--docker` for any solution you did not write or read yourself.

## Expected rewards

`reference` and every `alt-*` are correct and must get 1.
Every `wrong-*` and `do-nothing` must get 0.
The matrix prints `FALSE ACCEPT`, `FALSE REJECT` or `UNSTABLE` for every miss.
