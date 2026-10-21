:::card id="say-it" title="Say it out loud"
Short sentences. Fill the brackets. Pause instead of "um". Use it in every mock in [[interview]].

**0 · Clarify and buy time**

- "Let me restate the problem to check I understood."
- "Can I assume [X]? What should happen when [edge case]?"
- "Sorry, could you repeat the last part?"
- "Give me 30 seconds to think."
- "Brute force is O([cost]). For n = [N], that is too slow, so I'll [idea]."
- "I'm not sure yet. Here is what I know, and here is how I'd find out."

**1 · Baseline (before any change)**

- "Before I change anything, I'll run the tests to get a baseline."
- "Baseline: [N] tests pass and [M] fail. The failures are [names]."
- "I'll run them a second time. If the results differ, something is flaky."

**2 · Hypothesis (before you prompt)**

- "My guess is the bug is in [function], because [evidence]."
- "If I'm right, [input] should fail. Let me write that as a test first."
- "The AI thinks it's [X]. That's a second hypothesis. I'll test both."

**3 · Rejecting a suggestion**

- "This fixes the symptom, not the cause. [Input] would still fail."
- "I'm not sure this function exists in this version. Let me check."
- "It edited the test to make it pass. I'm reverting that."

**4 · Validating**

- "The new test failed before the fix. It passes now, and it fails again with the fix reverted."
- "Full suite: [N] pass, same as the baseline, plus my [K] new tests."
- "Passing tests are evidence, not proof. One case I didn't cover is [case]."

**5 · Closing (the last minute)**

- "Root cause: [one sentence]."
- "I changed [files]. The diff is [N] lines."
- "I checked it with [test, revert check, edge cases]."
- "I did not check [X]. With more time, I would [Y]."
- "The AI helped with [X]. I overrode it on [Y], because [Z]."

**6 · Talking about a grader** (frames: [[grader-validity#frame-sentence|the frame sentence]])

- "It rejected [K] of [K] hand-written wrong solutions. That is a count, not an error rate."
- "On a random sample of [N] mutants from [space], it killed [k]. The 95% Wilson interval is [a–b], for that frame only."
- "v0 is agent-built. I passed the ownership gate myself: I [reproduced / diagnosed / changed] [X]." Say this only after you did it.
:::
