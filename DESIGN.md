# DESIGN.md: the terminal transcript

This file is the source of truth for how the fork draws a session. Read the
never-use list first. When a screen still looks noisy, add what caused it to
the list and redraw.

## The idea

The turn is the unit. A turn has three voices, and each one has its own weight:

| Voice | What it is | How it is drawn |
|---|---|---|
| You | Your prompt | Orange bubble on the right. The only coloured box. |
| Work | Claude's notes between tools, and the tool calls | Dim, one line each, under a `┊` line. Finished steps fold into one summary line. |
| Answer | The last reply of the turn | Bright text, no box, labelled `✦` once per turn. |

```text
───────────────────────────────────────────────────────── 02:15 ─
                               ╭─────────────────────────────╮
                               │ fix the bubble alignment    │
                               ╰─────────────────────────────╯
 ┊ Wrapper is a row, so the bubble can't move right. Fixing.
 ┊ ✓ 2 edits  ✓ 50/50 tests  ✓ installed 0.1.10 (local)
 ┊ ✗ typecheck failed: claude-code types missing

 ✦ Fixed. Your bubble sits on the right again.
   Run /reload-plugins and send a message.
──────────────────────────────────────── 58s · $0.40 · ctx 31% ─
```

## Rules

1. **No jump at the end.** The engine draws a streaming reply itself, then swaps
   in our row once the block is stored. So our finished row must look like the
   engine's live text: plain text, no card, no border, no header. Only weight
   and colour may differ.
2. **Answer vs work.** Every text block is drawn bright when it lands, the way
   it looked while streaming. It turns dim (work) when a later `tool_use` row
   lands in the same turn. The newest text block stays bright, so the last one
   is the answer, and nothing changes when the turn ends. Matching: a drawn
   row's `requestId` is the stored `response` uuid with its last 12 hex digits
   zeroed, so match on the first 23 characters.
3. **Fold finished work.** A finished, passing tool step is one line. A failed
   or running step stays open. ctrl+o (`isExpanded`) shows everything.
4. **Label once.** `✦` shows on the answer only, not on every paragraph.
5. **Prose is capped at 100 columns.** Code, diffs and tables may use the full width.
6. **Colour budget.** Orange = you. Blue = Claude's answer and running work.
   Red = failed, and nothing else. Yellow = waiting for you, and nothing else.
   Everything else is grey on the canvas. One exception: the footer's context
   bar (rule 8) uses green, yellow, orange and red for how full the context is.
   - **Contrast is tested on all 441 themes, dark and light**
     (`tests/readability.test.ts`): answer text ≥ 9:1, secondary text
     (`quiet`: work notes, tool lines, turn time) ≥ 5:1, and the answer at
     least 1.5× the work's contrast, so the hierarchy holds.
   - `quiet` is a near-neutral grey. `muted` (3:1) is for decoration only, never
     words: the `┊` gutter, rules, stripe marks.
   - Bold is weight in the text colour, not a colour. Inline code uses `code`
     (≥ 4.5:1) on a neutral grey chip; chips and code cards are never tinted
     with a theme colour. The theme's `highlight` is not used for text: it can
     match your bubble's orange.
7. **A full-width rule ends each turn.** The engine's turn-end line becomes it:
   `── Sautéed for 1m 22s · 14:05 · $0.40 ──────────…` to the viewport's width
   (rule in `muted`, words in `quiet`). No second line: your bubble marks where
   a turn starts. Context stays in the footer's bar only (each number once).
   User's choice, 10-06 ("where is separation?": the short grey line was not enough).
8. **One footer line.** A custom `statusLine` always renders in its own row
   *above* Claude Code's badge row (documented; no mod can merge them), so there
   is no custom status line. The engine's badge row keeps the live
   permission-mode badge on the left; the mod puts the session facts at its
   right end (`SessionMode`) as buttons: `[Opus 5.5 ▾]` opens `/model` (Claude
   Code's own picker), `[$32.46]` opens `/cost`, and the context bar
   `█████████░ [98%]` comes last, at the row's right edge, and opens `/context`
   (user's choice, 10-06). The branch is plain text. No theme chip (`/bubbles`
   opens the studio). The context bar is the one place colour reports a level
   (an exception to rule 6, the user's choice): 100% is where auto-compact
   starts (its real threshold; the whole window when auto-compact is off),
   green < 63 ≤ yellow < 81 ≤ orange < 95 ≤ red, judged on the exact value.
   Dark and light canvases each have their own four colours, all ≥ 3:1 and never
   darkened, so yellow and orange stay apart. Right after a compaction there is
   no bar until the next reply (no stale red). The permission mode gets no
   button on purpose: a mod must never switch it, only shift+tab does. The facts
   are worked out at session start, turn end, after a footer button's command
   and after a compaction, never per redraw. Each value appears once.

## Never use

- A border around Claude's text. (0.1.x drew a card per paragraph: five cards
  for five one-line notes on one screen.)
- A `✦ Claude` label on every reply row.
- Narration in the same weight as the answer.
- Multi-line blocks for a tool that finished fine ("Ran 1 shell command" took
  three lines with a stripe).
- The same number twice on screen (flightdeck `ctx 24%` and the status line
  `31%` at the same time).
- More than one line of chrome between the transcript and the prompt.
- Colour as decoration: tinted backgrounds on every row, coloured stripes on
  finished tools, accent-coloured headings in normal prose.
- Words in a tinted, low-contrast colour. (Work text was the theme's purple
  mixed toward the canvas: 3.2:1 on Tokyo Night, unreadable. Now grey, 5.6:1.)
- The bubble's colour anywhere else: orange bold words and orange running dots
  made Claude's text look like yours.
- Prose lines wider than 100 columns.
- Our own drawing of code, diffs or tables. Wrap the engine's `Code` and
  `Markdown`; don't repaint them.

## Performance

- No timers. No `$.clock.every` for shimmer or animation.
- A finished turn's rows never change. Resolve the look once per theme and
  draw each row once for its id and text.
- One mod owns the space under the transcript. The bands from prompt-rail,
  cache-tax and flightdeck move into the single footer line, or are turned off.
- Keep the engine's own elements for code, diffs and tables (fast and correct).
