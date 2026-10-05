// Engine tests for the fork's fixes: the terminal sends prompts with
// `isExpanded: false`, and a fenced block in a reply needs its own card.

import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { clockTime } from '../hooks/register'

const ENGINE = { timeoutMs: 20_000 }

const theme = ($: Engine, args: string) =>
  $.command.run({
    command: 'bubbles',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })

describe('terminal prompts', () => {
  // The real terminal draws a prompt row folded (`isExpanded: false`). Wrapping
  // the engine's own row there brought its `❯` and its empty top line into the
  // bubble, so the mod draws the text itself.
  test('a folded prompt is the mod\'s own text bubble, not the engine row', ENGINE, async ($, on) => {
    on('ui.render', { component: 'UserMessage' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>❯ engine row</Text>
    })
    await theme($, 'tokyo night')
    const ui = await $.ui.mount({
      plugin: 'chat-bubbles',
      surface: 'terminal',
      component: 'UserMessage',
      props: { text: 'make it pop', origin: { kind: 'composer' }, isExpanded: false },
    })
    expect(await ui.find({ type: 'Text', text: 'make it pop' })).toBeTruthy()
    expect(await ui.find({ type: 'Box', key: 'you-bubble' })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: '❯ engine row' })).toBe(undefined)
    // A row-direction wrapper shrinks the bubble's row to its content, and the
    // bubble then sits on the left: the wrapper must be a column.
    expect((await ui.find({ type: 'Box', key: 'you-air' }))?.props.flexDirection).toBe('column')
    // The transcript already leaves a line between rows; a margin doubled it.
    expect((await ui.find({ type: 'Box', key: 'you-air' }))?.props.marginTop).toBe(undefined)
  })

  test('a long folded prompt is cut, with a note of what ctrl+o shows', ENGINE, async ($, on) => {
    on('ui.render', { component: 'UserMessage' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>engine row</Text>
    })
    await theme($, 'tokyo night')
    const long = Array.from({ length: 40 }, (_, n) => `line ${n + 1}`).join('\n')
    const ui = await $.ui.mount({
      plugin: 'chat-bubbles',
      surface: 'terminal',
      component: 'UserMessage',
      props: { text: long, origin: { kind: 'composer' }, isExpanded: false },
    })
    expect(await ui.find({ type: 'Text', text: '… 28 more lines · ctrl+o shows all' })).toBeTruthy()
  })

  test('an expanded prompt (ctrl+o) is drawn in full', ENGINE, async ($, on) => {
    on('ui.render', { component: 'UserMessage' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>engine row</Text>
    })
    await theme($, 'tokyo night')
    const long = Array.from({ length: 40 }, (_, n) => `line ${n + 1}`).join('\n')
    const ui = await $.ui.mount({
      plugin: 'chat-bubbles',
      surface: 'terminal',
      component: 'UserMessage',
      props: { text: long, origin: { kind: 'composer' }, isExpanded: true },
    })
    expect(await ui.find({ type: 'Text', text: long })).toBeTruthy()
  })
})

/** A reply block stored the way the engine does; the test host has no bottom for it. */
const respond = ($: Engine, uuid: string, content: { type: string; text?: string }[]) =>
  $.session
    .append({ message: { type: 'assistant', role: 'assistant', content }, door: 'response', origin: { kind: 'model' }, uuid } as never)
    .catch(() => undefined)

const prompt = ($: Engine, uuid: string) =>
  $.session
    .append({ message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'go' }] }, door: 'prompt', origin: { kind: 'composer' }, uuid } as never)
    .catch(() => undefined)

// The drawn id is the stored uuid with its last 12 hex digits zeroed.
const drawn = (uuid: string) => `${uuid.slice(0, 23)}-000000000000`

const reply = ($: Engine, surface: 'terminal' | 'desktop', uuid: string, text: string) =>
  $.ui.mount({
    plugin: 'chat-bubbles',
    surface,
    component: 'AssistantMessage',
    requestId: drawn(uuid),
    props: { text, isFirstOfReply: true },
  })

describe('answer vs work', () => {
  const NOTE = '11111111-1111-4111-8111-111111111111'
  const TOOL = '22222222-2222-4222-8222-222222222222'
  const ANSWER = '33333333-3333-4333-8333-333333333333'

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`text followed by a tool call is work; the newest text is the answer on ${surface}`, ENGINE, async $ => {
      await theme($, 'tokyo night')
      await prompt($, '00000000-0000-4000-8000-000000000099')
      await respond($, NOTE, [{ type: 'text', text: 'Checking the log.' }])
      await respond($, TOOL, [{ type: 'tool_use' }])
      await respond($, ANSWER, [{ type: 'text', text: 'Fixed.' }])

      const note = await reply($, surface, NOTE, 'Checking the log.')
      expect(await note.find({ type: 'Box', key: 'work' })).toBeTruthy()
      expect(await note.find({ type: 'Text', text: '┊ ' })).toBeTruthy()

      const answer = await reply($, surface, ANSWER, 'Fixed.')
      expect(await answer.find({ type: 'Box', key: 'answer' })).toBeTruthy()
      expect(await answer.find({ type: 'Text', text: '✦ ' })).toBeTruthy()
    })
  }

  test('a reply is plain text: no border, so nothing jumps when it lands', ENGINE, async $ => {
    await theme($, 'tokyo night')
    const ui = await reply($, 'terminal', ANSWER, 'Fixed.')
    const row = await ui.find({ type: 'Box', key: 'answer' })
    expect(row).toBeTruthy()
    expect(row?.props.borderStyle).toBe(undefined)
    expect(await ui.find({ type: 'Text', text: '✦ Claude' })).toBe(undefined)
  })

  test('a delivered queued message opens a turn: the last answer stays the answer', ENGINE, async $ => {
    await theme($, 'tokyo night')
    const A = 'abababab-abab-4bab-8bab-abababababab'
    await prompt($, '00000000-0000-4000-8000-000000000097')
    await respond($, A, [{ type: 'text', text: 'answer A' }])
    await $.turn.complete({ reason: 'answer' } as never).catch(() => undefined)
    await $.session
      .append({ message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'queued' }] }, door: 'delivery', origin: { kind: 'composer' }, uuid: 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd' } as never)
      .catch(() => undefined)
    await respond($, 'efefefef-efef-4fef-8fef-efefefefefef', [{ type: 'tool_use' }])
    const ui = await reply($, 'terminal', A, 'answer A')
    expect(await ui.find({ type: 'Box', key: 'answer' })).toBeTruthy()
  })

  test("a subagent's rows leave the main thread's answer alone", ENGINE, async $ => {
    await theme($, 'tokyo night')
    const MAIN = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
    await prompt($, '00000000-0000-4000-8000-000000000096')
    await respond($, MAIN, [{ type: 'text', text: 'main answer' }])
    await $.session
      .append({ message: { type: 'assistant', role: 'assistant', content: [{ type: 'tool_use' }] }, door: 'response', origin: { kind: 'model' }, uuid: 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', agentId: 'sub-1' } as never)
      .catch(() => undefined)
    const ui = await reply($, 'terminal', MAIN, 'main answer')
    expect(await ui.find({ type: 'Box', key: 'answer' })).toBeTruthy()
  })

  test('a new prompt starts a new turn: its first text is not marked by the last turn', ENGINE, async $ => {
    await theme($, 'tokyo night')
    const OLD = '44444444-4444-4444-8444-444444444444'
    const NEW = '55555555-5555-4555-8555-555555555555'
    await respond($, OLD, [{ type: 'text', text: 'old answer' }])
    await prompt($, '00000000-0000-4000-8000-000000000098')
    await respond($, '66666666-6666-4666-8666-666666666666', [{ type: 'tool_use' }])
    await respond($, NEW, [{ type: 'text', text: 'new answer' }])
    const old = await reply($, 'terminal', OLD, 'old answer')
    expect(await old.find({ type: 'Box', key: 'answer' })).toBeTruthy()
  })
})

describe('queued messages', () => {
  // A message typed while a turn runs is drawn with a fresh id no stored row has.
  const user = ($: Engine, requestId: string) =>
    $.ui.mount({
      plugin: 'chat-bubbles',
      surface: 'terminal',
      component: 'UserMessage',
      requestId,
      props: { text: 'queued one', origin: { kind: 'composer' }, isExpanded: false },
    })
  test('while a turn runs, a message no stored row matches keeps the engine look', ENGINE, async ($, on) => {
    on('ui.render', { component: 'UserMessage' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>engine queued row</Text>
    })
    await theme($, 'tokyo night')
    await prompt($, '77777777-7777-4777-8777-777777777777')
    const ui = await user($, '88888888-8888-4888-8888-888888888888')
    expect(await ui.find({ type: 'Text', text: 'engine queued row' })).toBeTruthy()
    expect(await ui.find({ type: 'Box', key: 'you-bubble' })).toBe(undefined)
  })

  test('once delivered (stored), the same message is a bubble', ENGINE, async ($, on) => {
    on('ui.render', { component: 'UserMessage' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>engine queued row</Text>
    })
    await theme($, 'tokyo night')
    const DELIVERED = '99999999-9999-4999-8999-999999999999'
    await prompt($, '77777777-7777-4777-8777-777777777770')
    await $.session
      .append({ message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'queued one' }] }, door: 'delivery', origin: { kind: 'composer' }, uuid: DELIVERED } as never)
      .catch(() => undefined)
    const ui = await user($, DELIVERED)
    expect(await ui.find({ type: 'Box', key: 'you-bubble' })).toBeTruthy()
  })

  test('when no turn runs, an unknown message (older history) keeps its bubble', ENGINE, async ($, on) => {
    on('ui.render', { component: 'UserMessage' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>engine queued row</Text>
    })
    await theme($, 'tokyo night')
    await $.turn.complete({ reason: 'answer' } as never).catch(() => undefined)
    const ui = await user($, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(await ui.find({ type: 'Box', key: 'you-bubble' })).toBeTruthy()
  })
})

describe('tool rows', () => {
  const group = ($: Engine, calls: unknown[], isActive = false, isExpanded = false) =>
    $.ui.mount({ plugin: 'chat-bubbles', surface: 'terminal', component: 'ToolGroup', props: { calls, isActive, isExpanded } as never })
  const bash = (over: Record<string, unknown> = {}) => ({
    tool: 'Bash',
    input: { command: 'git status --short', description: "Show the fork's uncommitted changes" },
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
    ...over,
  })
  type On = Parameters<Extract<Parameters<typeof test>[2], (...args: never[]) => unknown>>[1]
  const ENGINE_GROUP = ($: Engine, on: On) =>
    on('ui.render', { component: 'ToolGroup' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>Ran 1 shell command</Text>
    })

  test('a finished run is one quiet line saying what it did', ENGINE, async ($, on) => {
    ENGINE_GROUP($, on)
    await theme($, 'tokyo night')
    const ui = await group($, [bash(), bash({ input: { file_path: '/a/b/register.tsx' }, tool: 'Read' })])
    expect(await ui.find({ type: 'Box', key: 'tool-line' })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: "✓ Show the fork's uncommitted changes  +1 more" })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: 'Ran 1 shell command' })).toBe(undefined)
  })

  test('a running call shows a dot', ENGINE, async ($, on) => {
    ENGINE_GROUP($, on)
    await theme($, 'tokyo night')
    const ui = await group($, [bash({ isRunning: true })], true)
    expect(await ui.find({ type: 'Text', text: "● Show the fork's uncommitted changes" })).toBeTruthy()
  })

  test('a failed call is a red line with the start of its error', ENGINE, async ($, on) => {
    ENGINE_GROUP($, on)
    await theme($, 'tokyo night')
    const ui = await group($, [bash({ isErrored: true, output: 'session has ended; call rejected\nmore detail' })])
    expect(await ui.find({ type: 'Box', key: 'tool-failed' })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: "✗ Show the fork's uncommitted changes — session has ended; call rejected" })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: 'Ran 1 shell command' })).toBe(undefined)
  })

  test('a failed call beside a running one: both show', ENGINE, async ($, on) => {
    ENGINE_GROUP($, on)
    await theme($, 'tokyo night')
    const ui = await group($, [bash({ isErrored: true, output: 'boom' }), bash({ isRunning: true, input: { description: 'Run the tests' } })], true)
    expect(await ui.find({ type: 'Text', text: "✗ Show the fork's uncommitted changes — boom" })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: '● Run the tests' })).toBeTruthy()
  })

  test('a path ending in a slash still names its folder', ENGINE, async ($, on) => {
    ENGINE_GROUP($, on)
    await theme($, 'tokyo night')
    const ui = await group($, [{ tool: 'Glob', input: { path: 'src/hooks/' }, isRunning: false, isErrored: false, isInterrupted: false }])
    expect(await ui.find({ type: 'Text', text: '✓ Glob hooks' })).toBeTruthy()
  })

  test('ctrl+o (expanded) leaves the group to the engine', ENGINE, async ($, on) => {
    ENGINE_GROUP($, on)
    await theme($, 'tokyo night')
    const ui = await group($, [bash()], false, true)
    expect(await ui.find({ type: 'Box', key: 'tool-line' })).toBe(undefined)
  })

  test('the turn-end line carries the end time and what the turn cost', ENGINE, async ($, on) => {
    // A fixed clock and spend, so the line is the same on any machine and day.
    const clock = mock.clock(on, { now: Date.UTC(2026, 9, 6, 12, 0) })
    let spent = 1.0
    on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits: [], cost: { usd: spent } } }) as never)
    await theme($, 'tokyo night')
    await prompt($, '00000000-0000-4000-8000-000000000095')
    spent = 1.4
    await clock.advance(12_000)
    await $.turn.complete({ reason: 'answer', answer: 'done', durationMs: 12_000, isAborted: false, turnId: 't1' } as never).catch(() => undefined)
    const ui = await $.ui.mount({
      plugin: 'chat-bubbles',
      surface: 'terminal',
      component: 'TurnDuration',
      props: { word: 'Baked', durationMs: 12_000 } as never,
    })
    expect(await ui.find({ type: 'Text', text: ` Baked for 12s · ${clockTime(clock.now())} · $0.40 ` })).toBeTruthy()
  })

  test('a turn ends in a full-width rule, without the answer mark', ENGINE, async $ => {
    await theme($, 'tokyo night')
    const ui = await $.ui.mount({
      plugin: 'chat-bubbles',
      surface: 'terminal',
      component: 'TurnDuration',
      props: { word: 'Baked', durationMs: 12_000 } as never,
    })
    const label = ' Baked for 12s '
    // The whole line spans the width: 80 columns where no viewport is given, less 4 for the gutter.
    expect((await ui.findAll({ type: 'Text', text: /^── Baked for 12s ─+$/ })).map(t => t.text?.length)).toEqual([76])
    expect(await ui.find({ type: 'Text', text: label })).toBeTruthy()
    // 80 columns where no viewport is given: 2 + label + tail = 80 - 4 (gutter).
    expect(await ui.find({ type: 'Text', text: '─'.repeat(80 - 4 - 2 - label.length) })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: '✦ ' })).toBe(undefined)
  })
})

describe('review fixes', () => {
  test('a prompt drawn with a stored id (zeroed tail) is never taken as queued', ENGINE, async ($, on) => {
    on('ui.render', { component: 'UserMessage' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return <Text>engine queued row</Text>
    })
    await theme($, 'tokyo night')
    await prompt($, '00000000-0000-4000-8000-000000000094')
    // Older history the mod never recorded, drawn while a turn runs.
    const ui = await $.ui.mount({
      plugin: 'chat-bubbles',
      surface: 'terminal',
      component: 'UserMessage',
      requestId: 'deadbeef-dead-4ead-8ead-000000000000',
      props: { text: 'old prompt', origin: { kind: 'composer' }, isExpanded: false },
    })
    expect(await ui.find({ type: 'Box', key: 'you-bubble' })).toBeTruthy()
  })

  test('a row with text and its own tool call is work', ENGINE, async $ => {
    await theme($, 'tokyo night')
    const BOTH = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3'
    await prompt($, '00000000-0000-4000-8000-000000000093')
    await respond($, BOTH, [{ type: 'text', text: 'Checking.' }, { type: 'tool_use' }])
    const ui = await reply($, 'terminal', BOTH, 'Checking.')
    expect(await ui.find({ type: 'Box', key: 'work' })).toBeTruthy()
  })

  test('outline style still draws replies the new way', ENGINE, async $ => {
    await theme($, 'tokyo night')
    await $.command.run({ command: 'bubbles', args: 'style outline', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as never).catch(() => undefined)
    const ui = await reply($, 'terminal', 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4', 'hello')
    expect(await ui.find({ type: 'Box', key: 'answer' })).toBeTruthy()
  })
})

describe('prose width', () => {
  test('on a narrow terminal prose fits the room, not a fixed 100', ENGINE, async $ => {
    await theme($, 'tokyo night')
    const ui = await $.ui.mount({
      plugin: 'chat-bubbles',
      surface: 'terminal',
      component: 'AssistantMessage',
      viewport: { columns: 60, rows: 30 },
      props: { text: 'Short reply.', isFirstOfReply: true },
    } as never)
    expect((await ui.find({ type: 'Box', key: 'prose-1' }))?.props.width).toBe(54)
  })

  test('prose is capped at 100 columns; a code card sits outside the cap', ENGINE, async $ => {
    await theme($, 'tokyo night')
    const ui = await $.ui.mount({
      plugin: 'chat-bubbles',
      surface: 'terminal',
      component: 'AssistantMessage',
      props: { text: 'First part.\n```bash\necho hi\n```\nSecond part.', isFirstOfReply: true },
    })
    expect((await ui.find({ type: 'Box', key: 'prose-1' }))?.props.width).toBe(100)
    expect((await ui.find({ type: 'Box', key: 'prose-2' }))?.props.width).toBe(100)
    expect(await ui.find({ type: 'Box', key: 'code-card' })).toBeTruthy()
  })
})

describe('code in a reply', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`a fenced block gets its own card with the language on ${surface}`, ENGINE, async $ => {
      await theme($, 'tokyo night')
      const ui = await $.ui.mount({
        plugin: 'chat-bubbles',
        surface,
        component: 'AssistantMessage',
        props: { text: 'Run this:\n```bash\necho hi\n```', isFirstOfReply: true },
      })
      expect(await ui.find({ type: 'Box', key: 'code-card' })).toBeTruthy()
      expect(await ui.find({ type: 'Text', text: 'bash' })).toBeTruthy()
    })
  }
})
