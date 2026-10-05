// A small markdown painter for Claude's replies, in a Look's colors.
//
// It draws what it can style better than the engine's renderer can be
// recolored: headings, lists (nested, numbered, tasks), quotes, rules and
// inline `code`, **bold**, *italic*, ~~strike~~. Code fences go to the
// surface's Code element (its own highlighting); tables and lines holding
// links go to the surface's Markdown element, so links stay clickable.

import type { ElementTable, RenderNode } from 'claude-code'

import type { Look } from './look'

export type Kit = Pick<ElementTable, 'Box' | 'Text' | 'Code' | 'Markdown'>

// `code` | **bold** | __bold__ | ~~strike~~ | *italic* | _italic_. The last
// needs a non-word character (or the start) before it and none after, so
// snake_case_names stay as written; no lookbehind, for older runtimes.
const INLINE =
  /(`[^`\n]+`)|(\*\*(?!\s)[^*\n]+?\*\*)|(__(?!\s)[^_\n]+?__)|(~~(?!\s)[^~\n]+?~~)|(\*(?![\s*])[^*\n]+?\*)|(^|[^\w])(_(?![\s_])[^_\n]+?_)(?!\w)/g

export const inline = (K: Kit, line: string, look: Look): RenderNode[] => {
  const { Text } = K
  const out: RenderNode[] = []
  let last = 0
  for (const m of line.matchAll(INLINE)) {
    // For _italic_, group 6 is the boundary character consumed before it.
    const lead = m[7] !== undefined ? (m[6] ?? '') : ''
    const at = (m.index ?? 0) + lead.length
    const tok = m[7] ?? m[0]
    if (at > last) out.push(line.slice(last, at))
    // Not `highlight`: it can match your bubble's colour (Tokyo Night: orange),
    // and that colour means "you".
    if (m[1]) {
      out.push(
        <Text color={look.code} backgroundColor={look.codeBg}>
          {` ${tok.slice(1, -1)} `}
        </Text>,
      )
    } else if (m[2] || m[3]) {
      out.push(
        <Text bold color={look.text}>
          {tok.slice(2, -2)}
        </Text>,
      )
    } else if (m[4]) {
      out.push(
        <Text strikethrough color={look.quiet}>
          {tok.slice(2, -2)}
        </Text>,
      )
    } else {
      out.push(
        <Text italic color={look.secondary}>
          {tok.slice(1, -1)}
        </Text>,
      )
    }
    last = at + tok.length
  }
  if (last < line.length) out.push(line.slice(last))
  return out
}

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)/
const TABLE = /^\s*\|/
const LINK = /\[[^\]]*\]\([^)]*\)|<https?:\/\/[^>]+>/
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$/
const QUOTE = /^\s*>\s?(.*)$/
// Prose wider than this is hard to read on a wide terminal (DESIGN.md rule 5).
const PROSE = 100

export const paint = (K: Kit, md: string, look: Look, columns = PROSE): RenderNode[] => {
  // Prose is capped at PROSE, and never wider than the room it is given.
  const proseWidth = Math.max(20, Math.min(PROSE, columns))
  const { Box, Text, Code, Markdown } = K
  const lines = md.split('\n')
  const out: RenderNode[] = []
  // Prose lines gather into blocks capped at PROSE columns; code cards and
  // tables sit between them at the full width.
  let prose: RenderNode[] = []
  let blocks = 0
  const flush = () => {
    if (prose.length === 0) return
    blocks++
    out.push(
      <Box key={`prose-${blocks}`} flexDirection="column" width={proseWidth}>
        {prose}
      </Box>,
    )
    prose = []
  }
  let i = 0
  let cards = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''

    const fence = line.match(FENCE)
    if (fence) {
      const marker = fence[1] ?? '```'
      const close = new RegExp(`^\\s*${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`)
      const body: string[] = []
      i++
      while (i < lines.length && !close.test(lines[i] ?? '')) body.push(lines[i++] ?? '')
      i++
      // A card of its own: bare, a block in a plain language read as reply text.
      const language = fence[2] || undefined
      cards++
      flush()
      out.push(
        <Box key={cards === 1 ? 'code-card' : `code-card-${cards}`} flexDirection="column" backgroundColor={look.codeBg} paddingX={1} marginY={1}>
          {language ? <Text color={look.quiet}>{language}</Text> : null}
          <Code source={body.join('\n')} language={language} />
        </Box>,
      )
      continue
    }

    if (TABLE.test(line)) {
      const rows: string[] = []
      while (i < lines.length && TABLE.test(lines[i] ?? '')) rows.push(lines[i++] ?? '')
      flush()
      out.push(<Markdown text={rows.join('\n')} />)
      continue
    }

    i++

    if (LINK.test(line)) {
      prose.push(<Markdown text={line} />)
      continue
    }

    const heading = line.match(HEADING)
    if (heading) {
      const level = (heading[1] ?? '#').length
      const title = heading[2] ?? ''
      // Weight, not colour: a heading is bold in the text colour (DESIGN.md
      // never-use: accent-coloured headings in prose). A top heading is underlined.
      prose.push(
        <Text bold underline={level === 1} color={look.text}>
          {inline(K, title, look)}
        </Text>,
      )
      continue
    }

    if (RULE.test(line)) {
      prose.push(
        <Text color={look.muted}>
          {'─'.repeat(28)}
        </Text>,
      )
      continue
    }

    const item = line.match(LIST)
    if (item) {
      const indent = (item[1] ?? '').replace(/\t/g, '  ')
      const marker = item[2] ?? '-'
      const task = item[3]
      const mark = task ? (/[xX]/.test(task) ? '☑ ' : '☐ ') : /\d/.test(marker) ? `${marker} ` : indent.length >= 2 ? '◦ ' : '• '
      prose.push(
        <Text color={look.text}>
          {indent}
          <Text bold color={look.secondary}>
            {mark}
          </Text>
          {inline(K, item[4] ?? '', look)}
        </Text>,
      )
      continue
    }

    const quote = line.match(QUOTE)
    if (quote) {
      prose.push(
        <Text>
          <Text color={look.secondary}>{'▌ '}</Text>
          <Text italic color={look.text}>
            {inline(K, quote[1] ?? '', look)}
          </Text>
        </Text>,
      )
      continue
    }

    prose.push(<Text color={look.text}>{line.trim() === '' ? ' ' : inline(K, line, look)}</Text>)
  }
  flush()
  return out
}
