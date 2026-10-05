// Every theme, on both canvases: words must read (WCAG AA, 4.5:1), and the
// answer must stand clearly above the work around it. A grey that passes on
// one theme and fails on another is the class of bug this guards.

import { describe, expect, test } from 'claude-code/testing'

import { contrast } from '../hooks/color'
import { lookOf } from '../hooks/look'
import type { Base } from '../hooks/look'
import { PRESETS } from '../hooks/presets'

const BASES: readonly Base[] = ['dark', 'light']

const failures = (check: (look: ReturnType<typeof lookOf>) => string | null) => {
  const out: string[] = []
  for (const pal of PRESETS) {
    for (const base of BASES) {
      const why = check(lookOf(pal, base))
      if (why) out.push(`${pal.name} (${base}): ${why}`)
    }
  }
  return out
}

describe('readability across every theme', () => {
  test('there are themes to check', () => {
    expect(PRESETS.length > 400).toBe(true)
  })

  test('secondary text (work, tool lines, turn time) reaches 4.5:1 on the canvas', () => {
    const bad = failures(look => {
      const ratio = contrast(look.quiet, look.canvas)
      return ratio < 4.5 ? `quiet ${look.quiet} is ${ratio.toFixed(2)}:1` : null
    })
    expect(bad).toEqual([])
  })

  test('the "more lines" note in your bubble reaches 4.5:1 on the bubble', () => {
    const bad = failures(look => {
      const ratio = contrast(look.youQuiet, look.youBg)
      return ratio < 4.5 ? `youQuiet on youBg is ${ratio.toFixed(2)}:1` : null
    })
    expect(bad).toEqual([])
  })

  test('inline code reads on its chip, and a code card label reads on the card', () => {
    const bad = failures(look => {
      const code = contrast(look.code, look.codeBg)
      const label = contrast(look.quiet, look.codeBg)
      if (code < 4.5) return `inline code ${code.toFixed(2)}:1`
      return label < 4.5 ? `card label ${label.toFixed(2)}:1` : null
    })
    expect(bad).toEqual([])
  })

  test('the answer stands clearly above the work: at least 1.5x the contrast', () => {
    const bad = failures(look => {
      const answer = contrast(look.text, look.canvas)
      const work = contrast(look.quiet, look.canvas)
      return answer < work * 1.5 ? `answer ${answer.toFixed(2)} vs work ${work.toFixed(2)}` : null
    })
    expect(bad).toEqual([])
  })
})
