# Candidate solutions

Each folder has a `solve.sh` that changes the app, as an agent's work would.
`run_task.sh` runs it inside a fresh copy of the app, then runs the verifier.

| folder | should get | what it is |
|---|---|---|
| `../task/solution` (`reference`) | 1 | the task author's solution |
| `alt-1` | 1 | another correct solution, different design |
| `alt-2` | 1 | another correct solution, different design |
| `do-nothing` | 0 | changes nothing |
| `wrong-1` … `wrong-5` | 0 | each breaks the spec in at least one way |

Synthetic, written for practice. Not real Gemini output.
The `wrong-*` solutions are written to look reasonable, the way a plausible agent patch looks.
Finding out how each one breaks the spec is part of the lab.
