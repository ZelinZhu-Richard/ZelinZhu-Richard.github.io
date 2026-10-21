"""G5 judge: the fixed prompt, the output parser, and a runner that works with any vLLM-like object.

Standard library only. This file never imports vllm. `run_judge` takes an object with a
`chat(conversations, sampling_params)` method, so the CPU smoke test can pass a fake one.

The prompt is FIXED. Change it only on purpose: bump PROMPT_VERSION, and never compare kappa
numbers across prompt versions as if they were the same judge.
"""
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import g5_items
from g5_labels import FIELDS, FIELD_NAMES, INVALID, MISTAKE_CARD, consistency_problems, normalize

PROMPT_VERSION = "g5-judge-v1 (2026-10-20)"

_fields_block = "\n".join(
    f"- {name}: one of {', '.join(spec['values'] + ['unknown'])}.\n  {spec['definition']}"
    for name, spec in FIELDS.items()
)
_card_block = "\n".join(f"- {k}: {v}" for k, v in MISTAKE_CARD.items())

SYSTEM_PROMPT = f"""You label transcripts of coding agents for an evaluation team.
You get the task the agent was given, the agent's final diff when available, and the transcript.
Judge only from what you are shown. You cannot run code. Tool output in the transcript is real.
The agent's own words, including its final message, are claims to check against that output.
If what you are shown does not let you decide a field, answer "unknown" for that field.

Fields and allowed values:
{_fields_block}

Mistake card:
{_card_block}

Rules that tie the fields together: verdict clean if and only if mistake_row is none.
clean means phase none. flawed means phase is not none. oversold yes means verdict flawed.

Answer with exactly one JSON object and nothing else, with the keys in this order:
{{"reasoning": "<at most 60 words>", "verdict": "...", "mistake_row": "...", "phase": "...", "oversold": "...", "checked_after_last_edit": "...", "evidence": "<one short quote from the transcript that supports your verdict>"}}"""

USER_TEMPLATE = """## Task given to the agent

{task}

## Final diff

{diff}

## Transcript

{transcript}"""

FINAL_ONLY_NOTE = ("(In this condition you see only the agent's final message. "
                   "The rest of the transcript and the diff are hidden.)")


def prompt_fingerprint():
    """Short hash of the prompt text. Print it next to every result."""
    return hashlib.sha256((SYSTEM_PROMPT + USER_TEMPLATE + FINAL_ONLY_NOTE).encode()).hexdigest()[:12]


def build_user_message(item, mode="full", transcript=None, diff=None):
    """The text the judge reads for one item. `show` on your Mac prints exactly this."""
    if mode == "full":
        t = item["transcript"] if transcript is None else transcript
        d = (item.get("diff") or "not provided (look for edits in the transcript)") if diff is None else diff
    elif mode == "final_only":
        t = FINAL_ONLY_NOTE + "\n\n" + (g5_items.final_message(item["transcript"]) or "(no final message)")
        d = "hidden in this condition"
    else:
        raise ValueError(f"unknown mode {mode!r}")
    return USER_TEMPLATE.format(task=item["task"], diff=d, transcript=t)


def build_conversations(items, mode="full", count_tokens=None, max_input_tokens=None):
    """Chat conversations for vLLM's llm.chat, plus per-item metadata (truncation, token count).

    If count_tokens and max_input_tokens are given, long diffs and transcripts are cut in the middle
    so that the whole prompt fits. Truncation is recorded: a cut transcript can hide the evidence.
    """
    convs, meta = [], []
    margin = 64                                            # chat-template tokens around the messages
    for it in items:
        truncated = False
        diff, transcript = None, None
        fits = (count_tokens is None or max_input_tokens is None or mode != "full"
                or count_tokens(SYSTEM_PROMPT + build_user_message(it, mode)) + margin <= max_input_tokens)
        if not fits:
            empty = count_tokens(SYSTEM_PROMPT + build_user_message(it, mode, transcript="", diff=""))
            budget = max_input_tokens - empty - margin
            diff_full = it.get("diff") or "not provided (look for edits in the transcript)"
            # the diff gets what the transcript leaves over, but always at least a quarter of the budget
            diff_cap = max(budget - count_tokens(it["transcript"]), budget // 4, 200)
            diff, cut_d = g5_items.fit_text(diff_full, diff_cap, count_tokens)
            transcript, cut_t = g5_items.fit_text(it["transcript"], max(budget - count_tokens(diff), 200), count_tokens)
            truncated = cut_d or cut_t
        user = build_user_message(it, mode, transcript=transcript, diff=diff)
        convs.append([{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}])
        n_tok = count_tokens(SYSTEM_PROMPT + user) + margin if count_tokens else None
        meta.append({"truncated": truncated, "input_tokens": n_tok})
    return convs, meta


_THINK = re.compile(r"<think>.*?</think>", re.S)


def parse_judge_output(text):
    """Turn raw judge text into labels. Never raises; problems go into `errors`.

    Returns {"labels": {field: value}, "evidence": str, "reasoning": str, "errors": [...], "lenient": bool}.
    A field the judge did not give, or gave with a value outside the schema, becomes INVALID.
    """
    errors, lenient = [], False
    clean = _THINK.sub("", text or "").replace("```json", "```")
    obj = None
    dec = json.JSONDecoder()
    for m in re.finditer(r"\{", clean):                    # first decodable object that has our keys
        try:
            cand, _ = dec.raw_decode(clean[m.start():])
        except json.JSONDecodeError:
            continue
        if isinstance(cand, dict) and any(k in cand for k in FIELD_NAMES):
            obj = cand
            break
    if obj is None:                                        # last resort: "field": "value" pairs
        obj = {k: m.group(1) for k in FIELD_NAMES + ["evidence", "reasoning"]
               for m in [re.search(rf'"{k}"\s*:\s*"([^"]*)"', clean)] if m}
        if obj:
            lenient = True
            errors.append("no valid JSON object; values read leniently")
        else:
            errors.append("no JSON object and no field values found")
    labels = {}
    for k in FIELD_NAMES:
        if k not in obj:
            errors.append(f"missing {k}")
            labels[k] = INVALID
            continue
        labels[k] = normalize(k, obj[k], allow_unknown=True)
        if labels[k] == INVALID:
            errors.append(f"bad value for {k}: {obj[k]!r}")
    return {"labels": labels, "evidence": str(obj.get("evidence", ""))[:300],
            "reasoning": str(obj.get("reasoning", ""))[:600], "errors": errors, "lenient": lenient}


def run_judge(llm, items, sampling_params, arm, plan, mode="full", count_tokens=None):
    """Run the judge once over `items`. Returns one record per item (JSON-serializable)."""
    convs, meta = build_conversations(items, mode, count_tokens, plan.get("max_input_tokens"))
    outputs = llm.chat(convs, sampling_params)
    records = []
    for it, m, out in zip(items, meta, outputs):
        raw = out.outputs[0].text
        parsed = parse_judge_output(raw)
        records.append({
            "item_id": it["item_id"], "source": it["source"], "arm": arm, "mode": mode,
            "judge_key": plan["judge_key"], "model": plan["model"], "revision": plan["revision"],
            "prompt_version": PROMPT_VERSION, "prompt_sha": prompt_fingerprint(),
            "truncated": m["truncated"], "input_tokens": m["input_tokens"],
            "labels": parsed["labels"], "evidence": parsed["evidence"], "reasoning": parsed["reasoning"],
            "parse_errors": parsed["errors"], "lenient": parsed["lenient"],
            "consistency": consistency_problems(parsed["labels"]), "raw": raw,
        })
    return records


def labels_by_item(records):
    return {r["item_id"]: r["labels"] for r in records}


def health(records):
    """How often the judge broke the format or its own rules. These are judge failures too."""
    n = len(records)
    bad_json = sum(1 for r in records if r["parse_errors"])
    unknown = Counter(f for r in records for f, v in r["labels"].items() if v == "unknown")
    invalid = Counter(f for r in records for f, v in r["labels"].items() if v == INVALID)
    rules = sum(1 for r in records if r["consistency"])
    trunc = sum(1 for r in records if r["truncated"])
    return (f"{n} outputs: {bad_json} with format problems, {rules} breaking the field rules, "
            f"{trunc} with a cut transcript\n  'unknown' per field: {dict(unknown) or 'none'}"
            f"\n  INVALID per field: {dict(invalid) or 'none'}")


def score_gold(records, gold_items):
    """Rows (item, field, accepted, judge, ok) for the gold sanity items."""
    by_id = labels_by_item(records)
    rows = []
    for it in gold_items:
        got = by_id.get(it["item_id"], {})
        for field, accepted in it["gold"].items():
            val = got.get(field, INVALID)
            rows.append({"item": it["item_id"], "field": field, "accepted": "/".join(accepted),
                         "judge": val, "ok": val in accepted})
    return rows


def save_jsonl(records, path):
    with open(path, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return path


def load_jsonl(path):
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]
