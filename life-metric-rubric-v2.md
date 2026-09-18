# Life Progress Scoring — LLM Instructions

**How to use this file:** Paste this whole document into any LLM chat (Claude, GPT, etc.), followed by a description of what's happened since your last check-in. If you have previous entries, paste the last 2–3 as context so the LLM can judge trajectory, not just the isolated period. The LLM should reply with **one JSON object and nothing else** — paste that object into the tracker app's "Add Entry" box.

---

## What you are scoring

You are scoring a period of someone's life (could be a day, a week, or several weeks — whatever period they describe) across the domains that actually came up in what they told you. Common domains:

- `mental` — mental health, mood, stress, emotional regulation
- `physical` — physical health, exercise, sleep, diet
- `academic` — coursework, exams, grades, study progress
- `entrepreneurial` — startup ideas, side projects, outreach, shipped work
- `skills` — new skills or knowledge learned, deliberate practice

You are not required to use exactly these. If something notable doesn't fit a domain above, name a new domain key that fits (lowercase, one word, e.g. `relationships`, `finances`). If nothing happened in a domain during this period, **omit it** — don't force a score for something not mentioned.

## How to score each domain (0.0–1.0)

Use flexible, holistic judgment — not a rigid points checklist. Weigh effort and consistency, not just outcomes; a hard week where they kept showing up counts for more than a good week where they coasted.

Rough anchors:
- **0.0–0.2** — active regression, gave up, or actively harmful (skipped everything, health decline, no follow-through)
- **0.3–0.4** — stalled or coasting, no real movement, some slippage
- **0.5–0.6** — steady maintenance, nothing lost but nothing gained
- **0.7–0.8** — real forward progress, visible effort and follow-through
- **0.9–1.0** — a genuine breakthrough, milestone, or exceptional period

## Aggregate score

After scoring each domain that applies, give one overall `aggregate` score (0.0–1.0). This is not necessarily the mathematical average — weigh it toward whichever domain mattered most this period, and toward overall trajectory. Explain your weighting briefly in the comment field.

## Title and comment

- `title`: a short (4–8 word) label for this period, like a diary entry heading — this is what will show up on the chart itself.
- `comment`: 2–4 sentences on what happened and why you scored it this way. This is what shows up when the person hovers over this point later, so make it something that will actually jog their memory in six months.

## Output format — respond with ONLY this JSON, no other text

```json
{
  "date": "YYYY-MM-DD",
  "aggregate": 0.0,
  "domains": {
    "mental": 0.0,
    "physical": 0.0,
    "academic": 0.0,
    "entrepreneurial": 0.0,
    "skills": 0.0
  },
  "title": "Short heading for this period",
  "comment": "2-4 sentences on what happened and why it was scored this way."
}
```

Only include the domain keys that actually apply to this period. Use today's date unless the person specifies otherwise.


## Version 2 notes

The tracker treats `aggregate` as an overall state/trajectory signal rather than a mathematical average of domains. Keep scores comparable over time and do not force a domain that was not actually discussed. The chart is responsible only for visualization; the LLM is responsible only for producing the structured entry.
