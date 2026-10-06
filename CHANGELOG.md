# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
versions follow [Semantic Versioning](https://semver.org/).

## Chat Bubbles [0.3.1] — 2026-10-06 (orzazade fork)

One footer row instead of two.

### Changed

- **The session facts sit at the right end of Claude Code's own footer row**,
  as buttons: `Opus 5.5 ▾` opens `/model` (the model picker), the cost opens
  `/cost`, and the context bar opens `/context`. The branch is plain text. A
  custom status line can't share that row (it always draws its own line above
  it), so this replaces one.
- **A coloured context bar comes last**: 10 cells where 100% is where
  auto-compact starts (its real threshold, read from Claude Code; the whole
  window when auto-compact is off); green below 63%, yellow below 81%, orange
  below 95%, then red. Light themes get their own four colours.
- **No theme chip in the footer.** `/bubbles` still opens the theme studio.
- The model name reads as people say it (`Opus 5.5`, `Sonnet 4`, `Opus 5.5 1M`).
- The facts are worked out at session start, at each turn's end, after a footer
  button's command and after a compaction; never per redraw. A detached HEAD
  shows no branch.

## Chat Bubbles [0.3.0] — 2026-10-06 (orzazade fork)

A redesign for reading speed. The rules are in [DESIGN.md](DESIGN.md).

### Changed

- **Answer vs work.** Claude's text has no card, border or header any more, so it
  looks the same while it streams and after it lands (no jump). A text block
  followed by a tool call is work: grey, under a `┊`. The newest text stays bright
  with `✦`, so the last one in a turn is the answer.
- **Tool rows are one line** saying what the call did (`┊ ✓ Show the fork's
  uncommitted changes  +1 more`); running is `●` in blue. A failed call is a red
  line with the start of its error, next to the rest of its group.
- **A full-width rule ends each turn**: `── Baked for 1m 51s · 02:59 · $1.95 ──…`
  (duration, end time, what the turn cost).
- **Readable colours, tested on all 441 themes, dark and light**: secondary text
  (`quiet`) at least 5:1, the answer at least 9:1 and 1.5x the work, inline code
  4.5:1 on a neutral grey chip. Orange means you and nothing else: bold, inline
  code and running marks no longer use the theme's `highlight`. Headings are bold
  text, not accent colour.
- **Prose is capped at 100 columns** (less on a narrow terminal); code and tables
  use the full width.
- **No timers.** The spinner is Claude Code's own; the 260 ms shimmer is gone.

### Fixed

- Your bubble sat 18% in from the left (0.1.9): back at the right edge.
- One blank line above your bubble, not three.
- A message typed while a turn runs (queued) looked like a sent one. It keeps
  Claude Code's queued look until delivered. Sent rows and work marks are kept
  across reloads and resumes; subagent rows are ignored.

### Known limits

- Two sessions in one desktop process share the turn tracking.

## Chat Bubbles [0.1.9] — 2026-10-06 (orzazade fork)

### Fixed

- In the terminal your prompts were never the text bubble. The terminal draws
  every prompt folded (`isExpanded` false), and a folded prompt fell to the frame
  around the engine's own row, which carried its `❯` and an empty top line into
  the bubble. The terminal now gets the mod's own text bubble. A folded prompt
  longer than 12 lines shows its head and `… N more lines · ctrl+o shows all`.
- Fenced code in a reply was drawn bare, so a block in a plain language read as
  reply text. Each block now sits on a card in the theme's code color, with its
  language above it.

## Chat Bubbles [0.1.8] — 2026-10-05

### Fixed

- Two fragments of what you typed could end up in the plugin store. Versions up to
  0.1.5 kept the start of each prompt as a record key in session state, session
  state outlives a reload, and 0.1.6 and 0.1.7 wrote the whole record to disk. The
  record is now cleaned to row ids (uuids) with a yes/no on every write and when
  the mod loads, which also cleans a store written by those versions.

## Chat Bubbles [0.1.7] — 2026-10-05

### Fixed

- With an image, a gray ear showed at the bubble's top-right corner. It was the
  app's empty pill seen through the bubble's rounded corner (transparent outside
  the arc), and it grew when the bubble was moved off the image. The bubble now
  sits on a plate of the canvas color.

### Changed

- The record keeps only the row id and a yes/no. The text key it also kept as a
  fallback is gone: slash command rows (noted by id alone) came out clean, which
  confirms that the id a row is stored under is the one it is drawn with.

## Chat Bubbles [0.1.6] — 2026-10-05

### Fixed

- A gray bump showed at the corner of slash command bubbles (`/reload-plugins`,
  `/bubbles`…): those rows come in by another door that the mod did not note, so
  it drew the app's row (with its empty pill) for them. They are noted now.

### Changed

- A prompt the mod never saw (sent before it was installed) keeps the app's own
  look instead of getting a bubble over the app's row: no stray pill, no image lost.
- The row ids and a yes/no (never text) are written to the plugin store, so earlier
  prompts keep their look after a restart.
- On the terminal a prompt is just the bubble again, as before 0.1.3.
- Tests store rows through the plugin's real `session.append` hook, so the whole
  path (store the row, then draw it) is covered.

## Chat Bubbles [0.1.5] — 2026-10-05

### Fixed

- The bubble touched the image (5px apart). It is pulled up 4.7 cells instead of 5,
  which leaves ~10px and still covers the app's empty pill (it starts ~12px under
  the image).

## Chat Bubbles [0.1.4] — 2026-10-04

### Fixed

- Attachments drifted to the middle of the chat and an empty pill appeared on the
  left: a Box around the app's row shrinks it and breaks its own right alignment.
  The row is now drawn bare, so it stays on the right as the app places it.
- The empty pill the app's row leaves is now covered: the bubble is pulled up
  5 cells (80px, measured on desktop: a cell is 16px, the pill ~23px) and
  positioned so it paints over the pill.

## Chat Bubbles [0.1.3] — 2026-10-04

### Added

- Pasted images and files now show with the `bubble` mode: the app draws them
  above your bubble, outside the colored block. The mod learns which prompts
  carry media from the `session.append` event (a prompt with only text is just
  the bubble; one never seen, as after a resume, keeps the app's row so nothing
  is lost). The record is plugin state, so it survives a reload.

## Chat Bubbles [0.1.2] — 2026-10-04

### Added

- `/bubbles prompt <bubble | frame | native>` (and a studio button) to choose how
  your prompts are drawn.

### Changed

- The default is now `bubble`: the mod draws your prompt's text itself, so the
  bubble is right-aligned, sized to the text and never squeezed. Measured on the
  desktop app: a frame around the app's own row wrapped text at ~330px with empty
  space below, and a frame that shrinks to fit collapsed to nothing.
- `frame` is the previous behavior (keeps pasted images). `native` leaves the row alone.

## Chat Bubbles [0.1.1] — 2026-10-04

### Fixed

- Your prompts were never restyled on desktop: the tree wrapped the engine's own
  row in a Box with `width`, which the engine refuses (it then draws its own row,
  unchanged). The row now takes its width from the parent.
- Tests draw a real engine node instead of a Text stand-in, so a refused tree
  like this one fails in CI.

## Chat Bubbles [0.1.0] — 2026-10-04

Forked from Theme Studio 1.1.0.

### Changed

- Your prompts are a right-aligned bubble, the way messengers lay them out.
- Your bubble takes a rival color: orange under a cool theme, sky blue under a
  warm one, contrast-checked on dark and light canvases.
- Claude's replies are a quiet card with a `✦ Claude` label instead of a solid bar;
  `#` headings are underlined instead of filled.
- Every theme color is pulled 25% toward neutral ink; backgrounds are softer.
- Finished tools are gray, so only running and failing tools stand out.
- The command is `/bubbles`, so Claude Code's built-in `/theme` keeps working.

### Fixed

- Desktop app: no more empty colored bars under the app's own tool summary.
- Desktop app: images and attachments pasted into a prompt stay visible.

### Removed

- Neon Usage (the usage band); use any usage mod alongside.

---

Theme Studio's history, before the fork:

## [1.1.0] — 2026-10-04

### Theme Studio

- The 🎨 theme chip in the footer is now a button: click it to open the studio,
  docked beside the transcript where the surface docks panes. Escape closes it.

## [1.0.0] — 2026-10-04

First public release.

### Theme Studio

- 441 palettes in 63 collections, each contrast-checked on dark and light canvases.
- Recolors prompts, replies (headings, lists, quotes, bold, italic, inline code,
  strikethrough), tool rows, folded tool runs, tool results, the spinner, the
  footer, the end-of-turn line, slash-command output and every mod pane.
- `/theme <name | random | next | prev | list | bg | base | off | help>`.
- The studio pane: search across every theme, browse by collection, mix and save
  your own, and options for message style, chrome, canvas and background.
- A background override for every theme (`/theme bg`), with text re-checked for
  contrast against it.
- Follows Claude Code's dark/light theme setting and `prefersReducedMotion`.
- Theme, saved mixes and options persist across sessions; stored data is
  validated on load.

### Neon Usage

- One-line band above the prompt: context fill, five-hour and seven-day windows
  with reset countdowns, session cost and a mood emoji.
- Follows Theme Studio's colors and canvas when it is installed.
- `/neon-usage [on | off]`.
