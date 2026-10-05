// Chat Bubbles: Claude Code's chat laid out like a messenger. Your prompts are a
// bubble on the right in a rival color, Claude's replies a quiet card on the left,
// and only running or failing tools stand out. Colors come from 441 palettes or
// one you mix. `/bubbles` opens the studio; `/bubbles help` lists the commands.
// Forked from Theme Studio by Alliance Optima (MIT).

import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, Register, RenderNode } from 'claude-code'

import type { BaseMode, MessageStyle, Palette, PromptStyle } from '../types'
import { isHex, normalizeHex } from './color'
import { lookOf, stripOf } from './look'
import type { Base, Look } from './look'
import { paint } from './markdown'
import { blocksOf, clean, remember } from './media'
import {
  DEFAULT_CUSTOM,
  GROUPS,
  MINE,
  findPreset,
  inGroup,
  isPalette,
  pickRandom,
  randomNeon,
  searchPresets,
  slug,
} from './palette'
import { PRESETS } from './presets'

const PANE = 'chat-bubbles'

// ── State ────────────────────────────────────────────────────────────────
// Session values live in $.state (they survive hot reloads); the ones worth
// keeping between sessions are mirrored to $.store under the same key.

const active = atom({ plugin: 'chat-bubbles', key: 'active' } as const, null)
const group = atom({ plugin: 'chat-bubbles', key: 'group' } as const, GROUPS[0] ?? MINE)
const query = atom({ plugin: 'chat-bubbles', key: 'query' } as const, '')
const custom = atom({ plugin: 'chat-bubbles', key: 'custom' } as const, DEFAULT_CUSTOM)
const saved = atom({ plugin: 'chat-bubbles', key: 'saved' } as const, [])
const messageStyle = atom({ plugin: 'chat-bubbles', key: 'messageStyle' } as const, 'full')
const promptStyle = atom({ plugin: 'chat-bubbles', key: 'promptStyle' } as const, 'bubble')
const media = atom({ plugin: 'chat-bubbles', key: 'media' } as const, {})
const themeChrome = atom({ plugin: 'chat-bubbles', key: 'themeChrome' } as const, true)
const base = atom({ plugin: 'chat-bubbles', key: 'base' } as const, 'auto')
const resolvedBase = atom({ plugin: 'chat-bubbles', key: 'resolvedBase' } as const, 'dark')
const bgOverride = atom({ plugin: 'chat-bubbles', key: 'bgOverride' } as const, null)
const notice = atom({ plugin: 'chat-bubbles', key: 'notice' } as const, '')
const work = atom({ plugin: 'chat-bubbles', key: 'work' } as const, {})
const sent = atom({ plugin: 'chat-bubbles', key: 'sent' } as const, {})
const turns = atom({ plugin: 'chat-bubbles', key: 'turns' } as const, [])

// A stored row's uuid and the id its drawing carries share these characters;
// the drawn id zeroes the last 12 hex digits.
const rowKey = (id: string) => id.slice(0, 23)
// Work is drawn in the look's quiet colors; inline code keeps its chip.
const dimmed = new WeakMap<Look, Look>()
const dimOf = (look: Look): Look => {
  const hit = dimmed.get(look)
  if (hit) return hit
  const dim = { ...look, text: look.quiet, accent: look.quiet, secondary: look.quiet }
  dimmed.set(look, dim)
  return dim
}
// What a tool call did, in a few words: a shell command's own description, else
// the file, pattern or path it touched, else the tool's name.
const callLabel = (call: { tool: string; input: unknown }): string => {
  const input = call.input && typeof call.input === 'object' ? (call.input as Record<string, unknown>) : {}
  for (const field of ['description', 'file_path', 'pattern', 'path', 'url', 'query', 'command']) {
    const value = input[field]
    if (typeof value !== 'string' || value.trim() === '') continue
    // `src/hooks/` names `hooks`: a trailing slash would leave an empty name.
    const text = field === 'file_path' || field === 'path' ? `${call.tool} ${value.replace(/\/+$/, '').split('/').pop() || value}` : value
    const line = text.split('\n')[0] ?? text
    return line.length > 80 ? `${line.slice(0, 79)}…` : line
  }
  return call.tool
}
// The first line of a failed call's error, whatever shape the output takes.
const errorLine = (output: unknown): string => {
  const raw =
    typeof output === 'string'
      ? output
      : output && typeof output === 'object'
        ? ['error', 'message', 'stderr', 'text'].map(k => (output as Record<string, unknown>)[k]).find(v => typeof v === 'string')
        : undefined
  const line = typeof raw === 'string' ? (raw.trim().split('\n')[0] ?? '') : ''
  return line.length > 120 ? `${line.slice(0, 119)}…` : line
}
const blockKinds = (content: unknown): string[] =>
  Array.isArray(content) ? content.map(b => (b && typeof b === 'object' && 'type' in b ? String(b.type) : '')) : ['text']
// The newest text block of the main thread's running turn; a tool call after it makes it work.
let lastText: string | null = null
let turnOpen = false
// Row keys kept in `sent` and `work`, newest last; older ones drop off.
const KEEP = 3000
// The session's spend when the running main-thread turn opened, for its cost.
let turnStartUsd: number | null = null
// A turn-end line and its turn match on the duration both carry, within this.
const SAME_TURN_MS = 250

/** `14:05`: the clock time a turn ended, in the machine's time zone. */
export const clockTime = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
/** `$0.40`, or `<$0.01` for a turn that cost almost nothing. */
export const usdText = (usd: number) => (usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`)

const STYLES: readonly MessageStyle[] = ['full', 'outline', 'off']
const STYLE_LABEL: Record<MessageStyle, string> = { full: 'full color', outline: 'outline only', off: 'off' }
const PROMPTS: readonly PromptStyle[] = ['bubble', 'frame', 'native']
const PROMPT_LABEL: Record<PromptStyle, string> = { bubble: 'bubble (text only)', frame: 'frame (keeps images)', native: 'native (untouched)' }
const BASES: readonly BaseMode[] = ['auto', 'dark', 'light']

type Slot = 'accent' | 'secondary' | 'highlight' | 'text' | 'background'
const SLOTS: readonly { slot: Slot; label: string }[] = [
  { slot: 'accent', label: 'Accent    ' },
  { slot: 'secondary', label: 'Secondary ' },
  { slot: 'highlight', label: 'Highlight ' },
  { slot: 'text', label: 'Text      ' },
  { slot: 'background', label: 'Background' },
]

// How wide the studio asks to dock beside a fullscreen transcript; the person's own drag wins.
const STUDIO_COLUMNS = 64
const YOURS = ['composer', 'sdk', 'bridge']
// A folded prompt in the terminal shows this many lines; ctrl+o shows the rest.
const FOLDED_LINES = 12

// The app's row for a prompt leaves an empty pill (with no text it is only that,
// under any attachments). Measured on desktop: a margin unit is 16px, the pill is
// ~23px and starts ~12px under the attachments, and the bubble would start ~85px
// below that. Pulling it up 5 units covered the pill but left the bubble 5px from
// the image, touching it; 4.7 (75px) leaves ~10px and still covers the pill, which
// starts at ~12px. A margin unit is 16px at the default zoom.
const PILL_CELLS = 4.7

const HELP = [
  '**Chat Bubbles** — messenger-style chat for Claude Code.',
  '',
  '- `/bubbles` — open the studio (browse, search, mix your own)',
  '- `/bubbles <name>` — apply a theme by name, e.g. `/bubbles dracula`',
  '- `/bubbles random [collection]` — surprise me, e.g. `/bubbles random hockey`',
  '- `/bubbles next` · `/bubbles prev` — step through the current collection',
  '- `/bubbles list [collection]` — every theme, or one collection',
  '- `/bubbles bg <#hex | auto>` — set a background for every theme',
  '- `/bubbles base <auto | dark | light>` — tune colors for a dark or light canvas',
  '- `/bubbles prompt <bubble | frame | native>` — your prompts: a text bubble, a frame that keeps pasted images, or untouched',
  '- `/bubbles off` — back to Claude Code\'s own look',
].join('\n')

// ── Engine-facing helpers (top level, as the engine requires for `$`) ─────

// Adds a row key to `sent` or `work` and saves it, so a reload or a resumed
// session still knows which messages were sent and which text was work.
async function keep($: EngineInterface, which: 'sent' | 'work', key: string) {
  const add = (was: Record<string, true>) => {
    if (was[key]) return was
    const all: Record<string, true> = { ...was, [key]: true }
    const keys = Object.keys(all)
    return keys.length > KEEP ? Object.fromEntries(keys.slice(-KEEP).map(k => [k, true as const])) : all
  }
  // Session state now (drawings read it); the store is written once a turn, by saveMarks.
  if (which === 'sent') await update($, sent, add)
  else await update($, work, add)
}

// Writes `sent` and `work` to the store, so a reload or resume keeps them:
// once per turn, not on every row.
async function saveMarks($: EngineInterface) {
  await persist($, 'sent', await read($, sent))
  await persist($, 'work', await read($, work))
}

// What the session has spent so far, or null where the host does not say.
async function sessionUsd($: EngineInterface): Promise<number | null> {
  try {
    const usd = (await $.session.usage()).cost?.usd
    return typeof usd === 'number' ? usd : null
  } catch {
    return null
  }
}

// Typed while a turn runs, a message waits in a queue and is redrawn with a
// fresh id each time, one no sent row has; it keeps the engine's queued look.
// A stored prompt is drawn with its uuid's last 12 hex digits zeroed, so that
// id is never a queued one, recorded or not (older history included).
async function isQueued($: EngineInterface, id: string) {
  if (!turnOpen || id === 'placeholder' || id.endsWith('-000000000000')) return false
  return (await read($, sent))[rowKey(id)] !== true
}

async function persist($: EngineInterface, key: string, value: unknown) {
  try {
    await $.store.set(key, value)
  } catch {
    // The store refuses only non-JSON or oversize data; the session value stands.
  }
}

async function apply($: EngineInterface, palette: Palette | null) {
  await update($, active, () => palette)
  await persist($, 'active', palette)
  await update($, notice, () => (palette ? `Applied ${palette.name}` : "Theme off: Claude Code's own look"))
  $.ui.toast(palette ? `🎨 ${palette.name}` : '🎨 Theme off')
}

/** The Look every drawing uses, or null when no theme is on. */
async function currentLook($: EngineInterface): Promise<{ pal: Palette; look: Look } | null> {
  const pal = await read($, active)
  if (!pal) return null
  const look = lookOf(pal, (await read($, resolvedBase)) as Base, await read($, bgOverride))
  return { pal, look }
}

/** Whether the tool rows, spinner, footer and panes follow the theme. */
async function chromeLook($: EngineInterface) {
  if (!(await read($, themeChrome))) return null
  return currentLook($)
}

async function resolveBase($: EngineInterface) {
  const mode = await read($, base)
  let next: Base = mode === 'light' ? 'light' : 'dark'
  if (mode === 'auto') {
    try {
      const row = (await $.config.list()).find(r => r.key === 'theme')
      next = String(row?.value ?? '').startsWith('light') ? 'light' : 'dark'
    } catch {
      next = 'dark'
    }
  }
  await update($, resolvedBase, () => next)
}

/** Bring back what was picked in earlier sessions, skipping anything malformed. */
async function restore($: EngineInterface) {
  const get = async (key: string) => {
    try {
      return await $.store.get(key)
    } catch {
      return undefined
    }
  }
  const storedActive = await get('active')
  if (storedActive === null || isPalette(storedActive)) await update($, active, () => storedActive)
  const storedCustom = await get('custom')
  if (isPalette(storedCustom)) await update($, custom, () => storedCustom)
  const storedSaved = await get('saved')
  if (Array.isArray(storedSaved)) await update($, saved, () => storedSaved.filter(isPalette))
  const storedStyle = await get('messageStyle')
  if (STYLES.includes(storedStyle as MessageStyle)) await update($, messageStyle, () => storedStyle as MessageStyle)
  const storedPrompt = await get('promptStyle')
  if (PROMPTS.includes(storedPrompt as PromptStyle)) await update($, promptStyle, () => storedPrompt as PromptStyle)
  const storedChrome = await get('themeChrome')
  if (typeof storedChrome === 'boolean') await update($, themeChrome, () => storedChrome)
  const storedBase = await get('base')
  if (BASES.includes(storedBase as BaseMode)) await update($, base, () => storedBase as BaseMode)
  // Only row ids stay: a store or session state from an older version can hold text.
  const storedMedia = await get('media')
  const stored = typeof storedMedia === 'object' && storedMedia !== null && !Array.isArray(storedMedia) ? storedMedia : {}
  await persist($, 'media', await update($, media, seen => clean({ ...stored, ...seen })))
  // Which messages were sent and which text was work, from earlier runs: row keys only.
  const keys = (raw: unknown): Record<string, true> =>
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? Object.fromEntries(Object.keys(raw).filter(k => /^[0-9a-f-]{23}$/.test(k)).map(k => [k, true as const]))
      : {}
  const storedSent = keys(await get('sent'))
  await update($, sent, was => ({ ...storedSent, ...was }))
  const storedWork = keys(await get('work'))
  await update($, work, was => ({ ...storedWork, ...was }))
  const storedBg = await get('bgOverride')
  if (storedBg === null || isHex(storedBg)) await update($, bgOverride, () => storedBg)
}

async function step($: EngineInterface, delta: number) {
  const pal = await read($, active)
  const list = inGroup(pal?.group ?? (await read($, group)), await read($, saved))
  if (list.length === 0) return null
  const at = pal ? list.findIndex(one => one.id === pal.id) : -1
  const next = list[(at + delta + list.length) % list.length] ?? null
  if (next) await apply($, next)
  return next
}

async function setBackground($: EngineInterface, raw: string) {
  const arg = raw.trim().toLowerCase()
  if (arg === '' || arg === 'auto' || arg === 'off' || arg === 'none') {
    await update($, bgOverride, () => null)
    await persist($, 'bgOverride', null)
    return 'Background back to each theme\'s own tint.'
  }
  const hex = normalizeHex(arg)
  if (!hex) return `\`${raw.trim()}\` isn't a hex color. Try \`/bubbles bg #1a1a2e\` or \`/bubbles bg auto\`.`
  await update($, bgOverride, () => hex)
  await persist($, 'bgOverride', hex)
  return `Background set to \`${hex}\` for every theme. Text is re-checked for contrast against it.`
}

async function setBase($: EngineInterface, mode: BaseMode) {
  await update($, base, () => mode)
  await persist($, 'base', mode)
  await resolveBase($)
}

/** Opens the studio: docked beside the transcript where the surface docks panes, else above the prompt. */
async function openStudio($: EngineInterface) {
  return $.ui.open({ id: PANE, title: 'Chat Bubbles', focus: true, closeOnEscape: true, columns: STUDIO_COLUMNS })
}

// ── Pure drawing helpers ─────────────────────────────────────────────────

const formatDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

const listing = (collection?: string, mine: readonly Palette[] = []) => {
  const groups = collection ? GROUPS.filter(g => slug(g).includes(slug(collection))) : GROUPS
  const all = [...PRESETS, ...mine]
  const lines = groups
    .map(g => {
      const names = all.filter(one => one.group === g).map(one => one.name)
      return names.length ? `**${g}** (${names.length}): ${names.join(', ')}` : ''
    })
    .filter(Boolean)
  if (lines.length === 0) return `No collection matches \`${collection}\`. Try \`/bubbles list\`.`
  return `${all.length} themes in ${GROUPS.length - 1} collections. Apply one with \`/bubbles <name>\`.\n\n${lines.join('\n\n')}`
}

// ── Hooks ────────────────────────────────────────────────────────────────

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'bubbles',
      description: 'Recolor the chat: open the studio, or /bubbles <name> | random | next | list | bg | base | off',
      argumentHint: '[name | random | next | prev | list | bg <hex> | base <mode> | off | help]',
    })
    await restore($)
    await resolveBase($)
    return next(e)
  })

  // Follow Claude Code's own dark/light setting while the base is `auto`.
  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const done = await next(e)
    await resolveBase($)
    return done
  })

  // No shimmer timer: a redraw every 260 ms for a whole turn costs more than a
  // moving spark is worth (DESIGN.md, performance).
  on('turn.complete', async ($, e, next) => {
    // No main-thread turn runs now, so nothing is queued. A subagent's turn
    // ending (`agentId`) leaves the main one open.
    if (e.agentId === undefined) {
      turnOpen = false
      // When it ended and what it cost, for its turn-end line (matched on duration).
      const end = await sessionUsd($)
      const usd = end !== null && turnStartUsd !== null ? Math.max(0, end - turnStartUsd) : null
      const at = await $.clock.now()
      await update($, turns, was => [...was.slice(-199), { durationMs: e.durationMs, at, usd }])
      await saveMarks($)
    }
    return next(e)
  })

  on('command.run', { command: 'bubbles' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = rest.join(' ')
    switch (verb.toLowerCase()) {
      case '':
        await openStudio($)
        return { text: 'Chat Bubbles studio opened.' }
      case 'help':
      case '?':
        return { text: HELP }
      case 'off':
      case 'reset':
      case 'none':
        await apply($, null)
        return { text: 'Theme off.' }
      case 'list':
      case 'all':
        return { text: listing(arg || undefined, await read($, saved)) }
      case 'random': {
        const pick = pickRandom(arg || undefined)
        if (!pick) return { text: `No collection matches \`${arg}\`. Try \`/bubbles list\`.` }
        await apply($, pick)
        return { text: `🎲 ${pick.name} · ${pick.group}` }
      }
      case 'next':
      case 'prev': {
        const one = await step($, verb.toLowerCase() === 'next' ? 1 : -1)
        return { text: one ? `🎨 ${one.name} · ${one.group}` : 'Nothing to step through yet.' }
      }
      case 'bg':
      case 'background':
        return { text: await setBackground($, arg) }
      case 'prompt': {
        const mode = arg.toLowerCase() as PromptStyle
        if (!PROMPTS.includes(mode)) return { text: `Use \`/bubbles prompt ${PROMPTS.join('\`, \`/bubbles prompt ')}\`. Now: ${PROMPT_LABEL[await read($, promptStyle)]}.` }
        await update($, promptStyle, () => mode)
        await persist($, 'promptStyle', mode)
        return { text: `Your prompts: ${PROMPT_LABEL[mode]}.` }
      }
      case 'base': {
        const mode = arg.toLowerCase() as BaseMode
        if (!BASES.includes(mode)) return { text: 'Use `/bubbles base auto`, `/bubbles base dark` or `/bubbles base light`.' }
        await setBase($, mode)
        return { text: `Colors tuned for a ${await read($, resolvedBase)} canvas (${mode}).` }
      }
      default: {
        const hit = findPreset(e.args, await read($, saved))
        if (!hit) {
          const near = searchPresets(e.args, await read($, saved), 5).map(one => `\`${one.name}\``)
          return { text: `No theme matches "${e.args.trim()}".${near.length ? ` Close: ${near.join(', ')}.` : ''} Try \`/bubbles list\`.` }
        }
        await apply($, hit)
        return { text: `🎨 ${hit.name} · ${hit.group}` }
      }
    }
  })

  // Note which prompts carry media, before they are drawn. A slash command's own
  // row comes in by another door. Only the row id and a yes/no are kept.
  for (const door of ['prompt', 'command'] as const) {
    on('session.append', { door }, async ($, e, next) => {
      const blocks = blocksOf(e.message.content)
      await persist($, 'media', await update($, media, was => remember(was, e.uuid, blocks)))
      return next(e)
    })
  }

  // Answer vs work. Each block of a reply is its own `response` row. A text
  // block is bright when it lands, as it looked while streaming; a tool call
  // after it in the same turn makes it work. The newest text stays bright, so
  // the turn's last text is the answer and nothing changes when the turn ends.
  // A prompt, or a queued message once delivered, opens a turn. A subagent's
  // rows (`agentId`) belong to its own loop and leave the main thread alone.
  for (const door of ['prompt', 'delivery'] as const) {
    on('session.append', { door }, async ($, e, next) => {
      // Recorded first: a redraw between opening the turn and recording the
      // row would show the message just sent in the queued look.
      await keep($, 'sent', rowKey(e.uuid))
      if (e.agentId === undefined) {
        lastText = null
        // A prompt always opens a new turn; a queued message delivered into a
        // running one does not, so the turn keeps its starting spend.
        if (door === 'prompt' || !turnOpen) turnStartUsd = await sessionUsd($)
        turnOpen = true
      }
      return next(e)
    })
  }
  on('session.append', { door: 'command' }, async ($, e, next) => {
    await keep($, 'sent', rowKey(e.uuid))
    return next(e)
  })
  on('session.append', { door: 'response' }, async ($, e, next) => {
    if (e.agentId === undefined) {
      const kinds = blockKinds(e.message.content)
      const hasTool = kinds.includes('tool_use')
      if (hasTool && lastText) {
        const key = lastText
        lastText = null
        await keep($, 'work', key)
      }
      // A row holding text and a tool call: its own call follows its text.
      if (kinds.includes('text')) {
        if (hasTool) await keep($, 'work', rowKey(e.uuid))
        else lastText = rowKey(e.uuid)
      }
    }
    return next(e)
  })

  // Your prompts: a bubble on the right in the rival color, the way every
  // messenger does it. Other user-role rows (task notifications, messages from
  // agents) stay on the left with a quiet stripe.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const style = await read($, messageStyle)
    const current = await currentLook($)
    if (!current || style === 'off') return next(e)
    const { look } = current
    const { Box, Text } = $.ui.resolve(e)
    const isYours = YOURS.includes(e.props.origin.kind)
    // Still waiting in the queue: the engine's own queued look says so.
    if (isYours && (await isQueued($, e.requestId))) return next(e)

    if (!isYours) {
      if (!(await read($, themeChrome))) return next(e)
      return (
        <Box flexDirection="row">
          <Text color={look.muted}>{'▏'}</Text>
          <Box flexDirection="column" flexGrow={1}>
            {await next(e)}
          </Box>
        </Box>
      )
    }
    // Room on the left pushes the bubble right; long prompts wrap inside it.
    // The engine's own row may not sit under a Box that has `width` or
    // `minWidth` (the engine refuses the tree and draws its own), so the row
    // takes its width from the parent and only the spacer beside it has one.
    // `up` pulls the row over the app's row above it, onto the empty pill that row
    // leaves. The bubble's rounded corners are transparent, so the pill would show
    // through them: the bubble sits on a plate of the canvas color. Only then:
    // `frame` puts the app's row inside this Box, and the engine refuses
    // `position` on a Box above it.
    const right = (bubble: RenderNode, up = 0) => (
      <Box key="you-bubble" flexDirection="row" justifyContent="flex-end" {...(up ? { marginTop: -up, position: 'relative' as const } : {})}>
        <Box width="18%" flexShrink={0} />
        {up ? (
          <Box backgroundColor={look.canvas} flexShrink={1}>
            {bubble}
          </Box>
        ) : (
          bubble
        )}
      </Box>
    )
    // `bubble` draws the prompt's text itself: predictable size and color, but
    // the app's own row also carries pasted images and files, which `text` does
    // not, so `frame` wraps that row instead (the app sizes it, so the frame
    // can be tighter than a bubble) and `native` leaves it alone.
    const mode = style === 'outline' ? 'frame' : await read($, promptStyle)
    if (mode === 'native') return next(e)
    // The terminal draws every prompt folded (`isExpanded` false). Framing the
    // engine's row there brings its `❯` and empty top line into the bubble, and
    // the terminal shows images as text anyway, so it gets the text bubble below.
    const isTerminal = e.surface === 'terminal'
    if (mode === 'frame' || (!e.props.isExpanded && !isTerminal)) {
      return right(
        <Box borderStyle="round" borderColor={look.you} backgroundColor={look.youBg} paddingX={1} flexShrink={1}>
          {await next(e)}
        </Box>,
      )
    }
    // Only text: the app's own row is all there is to draw.
    if (e.props.text.trim() === '') return next(e)
    // Folded, a long prompt shows its head and says how much ctrl+o adds.
    const lines = e.props.text.split('\n')
    const cut = !e.props.isExpanded && lines.length > FOLDED_LINES
    const text = (
      <Box flexDirection="column" borderStyle="round" borderColor={look.you} backgroundColor={look.youBg} paddingX={1} flexShrink={1}>
        <Text color={look.youText} wrap="wrap">
          {cut ? lines.slice(0, FOLDED_LINES).join('\n') : e.props.text}
        </Text>
        {cut ? (
          <Text key="you-more" color={look.youQuiet}>
            {`… ${lines.length - FOLDED_LINES} more lines · ctrl+o shows all`}
          </Text>
        ) : null}
      </Box>
    )
    // A prompt known to have no media is just the bubble. One with media also
    // gets the app's own row without its text above the bubble: the images and
    // files, outside the colored block. Nothing wraps
    // that row (a wrapper shrinks it and breaks its own right alignment); the
    // empty pill it leaves is covered by pulling the bubble up.
    // The terminal draws images as text inside the prompt, so there it is just the bubble.
    // A column, so the row inside stretches to full width and can push right.
    // No margin: the transcript already leaves a line between rows.
    if (isTerminal)
      return (
        <Box key="you-air" flexDirection="column">
          {right(text)}
        </Box>
      )
    // Never seen (sent before the mod was installed): the app's own row, so
    // nothing is lost and no empty pill is left behind.
    const known = (await read($, media))[e.requestId]
    if (known === undefined) return next(e)
    if (!known) return right(text)
    return (
      <Box flexDirection="column">
        {await next({ ...e, props: { ...e.props, text: '' } })}
        {right(text, PILL_CELLS)}
      </Box>
    )
  })

  // Claude's replies: plain text, as the engine draws them while they stream, so
  // nothing jumps when the stored row replaces the live one (no card, no border,
  // no header). Work is dim under a `┊`; the newest text is bright, `✦` on the
  // block that opens a reply. Replies have no fill in any style now, so `outline`
  // draws them like `full`; `off` and huge rows keep the engine's own.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const style = await read($, messageStyle)
    const current = await currentLook($)
    if (!current || style === 'off' || e.props.text.length > 30000) return next(e)
    const { look } = current
    const els = $.ui.resolve(e)
    const { Box, Text } = els
    // The room beside the 2-column mark, and the engine's 4 at the right; wide when unknown.
    const room = (e.viewport?.columns ?? 106) - 6
    const isWork = e.props.isSummary === true || (await read($, work))[rowKey(e.requestId)] === true
    if (isWork) {
      return (
        <Box key="work" flexDirection="row">
          <Text color={look.muted}>{'┊ '}</Text>
          <Box flexDirection="column" flexShrink={1}>
            {paint(els, e.props.text, dimOf(look), room)}
          </Box>
        </Box>
      )
    }
    return (
      <Box key="answer" flexDirection="row">
        <Text bold color={look.accent}>
          {e.props.isFirstOfReply ? '✦ ' : '  '}
        </Text>
        <Box flexDirection="column" flexShrink={1}>
          {paint(els, e.props.text, look, room)}
        </Box>
      </Box>
    )
  })

  // The footer's mode labels, then the theme's name as a button that opens the studio.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const current = await currentLook($)
    if (!current) return next(e)
    const { pal, look } = current
    const isChrome = await read($, themeChrome)
    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" gap={1}>
        {e.props.modes.length > 0 ? (
          isChrome ? (
            <Text color={look.quiet}>{e.props.modes.join(' & ')}</Text>
          ) : (
            <Text dimColor>{e.props.modes.join(' & ')}</Text>
          )
        ) : null}
        <Box key="theme-chip" flexDirection="row">
          {isChrome ? <Text color={look.accent}>{'▍'}</Text> : null}
          <Button
            key="open-studio"
            label={`🎨 ${pal.name}`}
            plain
            hover={{ underline: true }}
            onPress={() => void openStudio($)}
          />
        </Box>
      </Box>
    )
  })

  // The hint under the prompt, in the theme's quiet color. The terminal keeps
  // its own line (its pills stay live); other surfaces take the tree.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const current = await chromeLook($)
    if (!current || e.surface === 'terminal') return next(e)
    const { Text } = $.ui.resolve(e)
    return <Text color={current.look.quiet}>{e.props.tail ? `${e.props.hint} ${e.props.tail}` : e.props.hint}</Text>
  })

  // "Baked for 12s" at the end of a turn, quiet: `✦` belongs to the answer alone.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const current = await chromeLook($)
    if (!current) return next(e)
    const { look } = current
    const { Text } = $.ui.resolve(e)
    // The turn's end time and cost join the same line: no divider of its own.
    // Until turn.complete has run (or for a turn from before the mod) it is the bare line.
    const turn = (await read($, turns)).findLast(t => Math.abs(t.durationMs - e.props.durationMs) <= SAME_TURN_MS)
    const extra = turn ? ` · ${clockTime(turn.at)}${turn.usd !== null ? ` · ${usdText(turn.usd)}` : ''}` : ''
    const label = ` ${e.props.word} for ${formatDuration(e.props.durationMs)}${extra} `
    // A full-width rule ends the turn, so turns read as separate blocks. Sized
    // to the viewport (a cut line would end in an ellipsis), less 4 for the gutter.
    const columns = e.viewport?.columns ?? 80
    const tail = '─'.repeat(Math.max(2, columns - 4 - 2 - label.length))
    return (
      <Text key="turn-rule">
        <Text color={look.muted}>{'──'}</Text>
        <Text color={look.quiet}>{label}</Text>
        <Text color={look.muted}>{tail}</Text>
      </Text>
    )
  })

  // Tool rows, folded runs, results and command output: a stripe and a strip.
  const striped = (look: Look, mark: string, drawn: RenderNode, K: Pick<ElementTable, 'Box' | 'Text'>, strength = 0.1, glyph = '▍') => (
    <K.Box flexDirection="row" backgroundColor={strength > 0 ? stripOf(look, mark, strength) : undefined}>
      <K.Text bold color={mark}>
        {glyph}
      </K.Text>
      <K.Box flexDirection="column" flexGrow={1}>
        {drawn}
      </K.Box>
    </K.Box>
  )

  // Tool rows are work: in the terminal they sit under the same `┊` as the notes.
  // A failed call keeps the engine's full drawing on a red strip, so its error
  // reads; the rest stay quiet. The desktop app draws its own folded summary.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const current = await chromeLook($)
    if (!current || e.surface !== 'terminal') return next(e)
    const { look } = current
    if (e.props.isErrored) return striped(look, look.error, await next(e), $.ui.resolve(e), 0.16)
    return striped(look, e.props.isRunning ? look.accent : look.muted, await next(e), $.ui.resolve(e), 0, '┊ ')
  })

  // A folded run is one line saying what it did: the first call's own
  // description, and how many more. ctrl+o (`isExpanded`) shows each call.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const current = await chromeLook($)
    if (!current || e.surface !== 'terminal') return next(e)
    const { look } = current
    const { calls } = e.props
    if (e.props.isExpanded || calls.length === 0) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    // A failed call is a red line of its own with the start of its error: the
    // engine's folded block said only "Called <tool>", on an empty red strip.
    // The rest of the group (running or fine) keeps its one summary line beside them.
    const failed = calls.filter(c => c.isErrored)
    const rest = calls.filter(c => !c.isErrored)
    const running = rest.some(c => c.isRunning)
    const first = rest[0]
    const summary = first ? (
      <Box key="tool-line" flexDirection="row">
        <Text color={look.muted}>{'┊ '}</Text>
        {/* Running is the accent: `highlight` can be the orange that means "you". */}
        <Text color={running ? look.accent : look.quiet} wrap="truncate-end">
          {`${running ? '●' : '✓'} ${callLabel(first)}${rest.length > 1 ? `  +${rest.length - 1} more` : ''}`}
        </Text>
      </Box>
    ) : null
    if (failed.length === 0) return summary ?? next(e)
    return (
      <Box key="tool-failed" flexDirection="column">
        {failed.map((c, i) => {
          const error = errorLine(c.output)
          return (
            <Box key={`failed-${c.tool_use_id ?? i}`} flexDirection="row">
              <Text color={look.muted}>{'┊ '}</Text>
              <Text color={look.error} wrap="truncate-end">
                {`✗ ${callLabel(c)}${error ? ` — ${error}` : ''}`}
              </Text>
            </Box>
          )
        })}
        {summary}
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const current = await chromeLook($)
    if (!current || e.surface !== 'terminal') return next(e)
    const { look } = current
    return striped(look, e.props.isErrored ? look.error : look.muted, await next(e), $.ui.resolve(e), 0, '▏')
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    const current = await chromeLook($)
    if (!current || e.surface !== 'terminal') return next(e)
    const { look } = current
    return striped(look, e.props.isErrored ? look.error : look.highlight, await next(e), $.ui.resolve(e), 0.08)
  })

  // Every pane a mod opens, this one included: a tinted backdrop.
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    const current = await chromeLook($)
    if (!current) return next(e)
    const { Box } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" backgroundColor={current.look.replyBg} paddingX={1}>
        {await next(e)}
      </Box>
    )
  })

  // ── The studio ──────────────────────────────────────────────────────────
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    // Mobile draws no fields: collections become buttons and the mixer is hidden.
    const Input = 'Input' in els ? els.Input : undefined
    const Select = 'Select' in els ? els.Select : undefined

    const pal = await read($, active)
    const shown = await read($, group)
    const search = await read($, query)
    const mixer = await read($, custom)
    const mine = await read($, saved)
    const style = await read($, messageStyle)
    const prompt = await read($, promptStyle)
    const isChrome = await read($, themeChrome)
    const mode = await read($, base)
    const canvas = (await read($, resolvedBase)) as Base
    const bg = await read($, bgOverride)
    const said = await read($, notice)
    const ui = lookOf(pal ?? DEFAULT_CUSTOM, canvas, bg)

    const results = search ? searchPresets(search, mine, 40) : inGroup(shown, mine)
    const swatch = (one: Palette) => (
      <Text>
        <Text color={one.accent}>██</Text>
        <Text color={one.secondary}>██</Text>
        <Text color={one.highlight}>██</Text>
        <Text color={one.text}>██</Text>
        <Text color={lookOf(one, canvas, bg).replyBg}>██</Text>
      </Text>
    )
    const heading = (label: string) => (
      <Text bold color={ui.accent}>
        {label}
      </Text>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          {heading('💬 CHAT BUBBLES')}
          <Box gap={1}>
            <Text color={ui.text}>Active:</Text>
            {pal ? swatch(pal) : null}
            <Text bold color={ui.secondary}>
              {pal ? `${pal.name} · ${pal.group}` : "Claude Code's own look"}
            </Text>
          </Box>
        </Box>

        <Box flexDirection="column">
          {Input ? (
            <Input
              key="search"
              label="Search"
              value={search}
              placeholder={`${PRESETS.length} themes: try "hockey", "neon", "gryffindor"`}
              submitLabel="search"
              onInput={value => void update($, query, () => value)}
              onSubmit={value => void update($, query, () => value)}
            />
          ) : null}
          {search ? (
            <Box gap={1}>
              <Text color={ui.quiet}>{`${results.length === 40 ? '40+' : results.length} match${results.length === 1 ? '' : 'es'}`}</Text>
              <Button key="clear-search" label="Clear" plain dimColor onPress={() => update($, query, () => '')} />
            </Box>
          ) : Select ? (
            <Select
              key="group"
              label="Collection"
              value={shown}
              options={GROUPS.map(g => ({ value: g, label: g === MINE ? `${g} (${mine.length})` : g }))}
              onSelect={value => update($, group, () => value)}
            />
          ) : (
            <Box flexWrap="wrap" gap={1}>
              {GROUPS.map(g => (
                <Button key={`g-${slug(g)}`} label={g} dimColor={g !== shown} onPress={() => update($, group, () => g)} />
              ))}
            </Box>
          )}
          {results.length === 0 ? (
            <Text color={ui.quiet}>{search ? 'No theme matches that.' : 'No saved themes yet. Mix one below and press Enter on "Save as".'}</Text>
          ) : null}
          {results.map(one => (
            <Box key={`row-${one.id}`} gap={1}>
              {swatch(one)}
              <Button
                key={`apply-${one.id}`}
                label={search ? `${one.name} · ${one.group}` : one.name}
                variant={pal?.id === one.id ? 'primary' : undefined}
                onPress={() => apply($, one)}
              />
              {pal?.id === one.id ? <Text color={ui.highlight}>◆ on</Text> : null}
            </Box>
          ))}
        </Box>

        {Input ? (
          <Box flexDirection="column">
            {heading('MIX YOUR OWN')}
            {SLOTS.map(({ slot, label }) => (
              <Box key={`slot-${slot}`} gap={1}>
                <Text color={mixer[slot] ?? lookOf(mixer, canvas).replyBg}>██</Text>
                <Input
                  key={`hex-${slot}`}
                  label={label}
                  value={mixer[slot] ?? ''}
                  placeholder={slot === 'background' ? 'auto (tinted from the accent)' : '#ff2bd6'}
                  submitLabel="set"
                  onSubmit={async value => {
                    if (slot === 'background' && value.trim() === '') {
                      const next = await update($, custom, c => ({ ...c, background: undefined }))
                      await persist($, 'custom', next)
                      await update($, notice, () => 'Mixer background back to auto')
                      return
                    }
                    const hex = normalizeHex(value)
                    if (!hex) {
                      await update($, notice, () => `"${value}" isn't a hex color. Try #ff2bd6 or f0f.`)
                      return
                    }
                    const next = await update($, custom, c => ({ ...c, [slot]: hex }))
                    await persist($, 'custom', next)
                    await update($, notice, () => `${slot} set to ${hex}`)
                  }}
                />
              </Box>
            ))}
            <Box gap={1} flexWrap="wrap">
              {swatch(mixer)}
              <Button
                key="apply-custom"
                label="Apply custom"
                variant="primary"
                onPress={async () => apply($, { ...(await read($, custom)), id: 'custom', name: 'Custom', group: MINE })}
              />
              <Button
                key="random-neon"
                label="🎲 Random neon"
                onPress={async () => {
                  const next = await update($, custom, () => randomNeon())
                  await persist($, 'custom', next)
                  await apply($, next)
                }}
              />
            </Box>
            <Input
              key="save-name"
              label="Save as"
              placeholder="name your theme, Enter to save"
              submitLabel="save"
              onSubmit={async value => {
                const name = value.trim().slice(0, 60)
                if (!name) return
                const one: Palette = { ...(await read($, custom)), name, group: MINE, id: `mine:${slug(name)}` }
                const list = await update($, saved, l => [...l.filter(x => x.id !== one.id), one])
                await persist($, 'saved', list)
                await update($, group, () => MINE)
                await update($, query, () => '')
                await apply($, one)
              }}
            />
          </Box>
        ) : null}

        <Box flexDirection="column">
          {heading('LOOK')}
          <Box gap={1} flexWrap="wrap">
            <Button
              key="style-toggle"
              label={`Messages: ${STYLE_LABEL[style]}`}
              onPress={async () => {
                const next = await update($, messageStyle, v => STYLES[(STYLES.indexOf(v) + 1) % STYLES.length] ?? 'full')
                await persist($, 'messageStyle', next)
              }}
            />
            <Button
              key="prompt-toggle"
              label={`Prompts: ${PROMPT_LABEL[prompt]}`}
              onPress={async () => {
                const next = await update($, promptStyle, v => PROMPTS[(PROMPTS.indexOf(v) + 1) % PROMPTS.length] ?? 'bubble')
                await persist($, 'promptStyle', next)
              }}
            />
            <Button
              key="chrome-toggle"
              label={`Tools, spinner & panes: ${isChrome ? 'on' : 'off'}`}
              onPress={async () => {
                const next = await update($, themeChrome, v => !v)
                await persist($, 'themeChrome', next)
              }}
            />
            <Button
              key="base-toggle"
              label={`Canvas: ${mode}${mode === 'auto' ? ` (${canvas})` : ''}`}
              onPress={async () => setBase($, BASES[(BASES.indexOf(mode) + 1) % BASES.length] ?? 'auto')}
            />
          </Box>
          {Input ? (
            <Box gap={1}>
              <Text color={bg ?? ui.replyBg}>██</Text>
              <Input
                key="bg-override"
                label="Background for every theme"
                value={bg ?? ''}
                placeholder="auto — or a hex like #1a1a2e"
                submitLabel="set"
                onSubmit={async value => {
                  await update($, notice, () => '')
                  const said = await setBackground($, value)
                  await update($, notice, () => said.replace(/`/g, ''))
                }}
              />
            </Box>
          ) : null}
          <Box gap={1} flexWrap="wrap">
            {mine.length > 0 && shown === MINE && !search ? (
              <Button
                key="clear-mine"
                label="Clear my themes"
                dimColor
                onPress={async () => {
                  await update($, saved, () => [])
                  await persist($, 'saved', [])
                }}
              />
            ) : null}
            <Button key="off" label="Theme off" dimColor onPress={() => apply($, null)} />
          </Box>
        </Box>
        {said ? <Text color={ui.highlight}>{said}</Text> : null}
      </Box>
    )
  })
}
