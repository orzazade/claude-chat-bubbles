// Engine tests for the fork's fixes: the terminal sends prompts with
// `isExpanded: false`, and a fenced block in a reply needs its own card.

import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

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
