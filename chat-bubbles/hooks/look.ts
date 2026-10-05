// A Look is a palette resolved against a canvas: every background the mod
// paints and every foreground that sits on one, contrast-checked so a theme
// stays readable on dark and light alike. Pure, and memoized per input.
//
// Chat Bubbles tones each theme down and gives your messages a rival color:
// warm (orange) under a cool theme, cool (sky blue) under a warm one, so whose
// message is whose reads at a glance, before a word of it.

import type { Palette } from '../types'
import { ensureContrast, isCool, mix } from './color'

export type Base = 'dark' | 'light'

export type Look = {
  base: Base
  /** The canvas everything is tinted from. */
  canvas: string
  replyBg: string
  codeBg: string
  /** Inline code on its chip: 4.5:1 on `codeBg`. */
  code: string
  /** Body text on a reply card. */
  text: string
  /** Headings, labels: large or bold text, so 3:1 is the bar. */
  accent: string
  secondary: string
  highlight: string
  /** The reply card's border: quiet, it frames without shouting. */
  frame: string
  /** Your bubble: the rival color, its tint and the text on it. */
  you: string
  youBg: string
  youText: string
  /** A side note inside your bubble ("… 12 more lines"): 4.5:1 on the bubble. */
  youQuiet: string
  /**
   * Secondary text that must still read: work notes, tool lines, the turn time.
   * A near-neutral grey, at least 5:1 on the canvas (WCAG AA wants 4.5:1).
   */
  quiet: string
  /** Decoration only, never words: the `┊` gutter, rules. 3:1 is its bar. */
  muted: string
  error: string
}

const CANVAS: Record<Base, string> = { dark: '#15151b', light: '#f7f6f2' }
const ERROR: Record<Base, string> = { dark: '#ff4d5e', light: '#c8102e' }
const INK: Record<Base, string> = { dark: '#f2f2f2', light: '#1a1a1a' }
const RIVAL = { warm: { dark: '#ff8c42', light: '#c2410c' }, cool: { dark: '#38bdf8', light: '#0369a1' } }
// How far each theme color is pulled toward neutral ink: 0 keeps the theme's full intensity.
const CALM = 0.25

const cache = new Map<string, Look>()

export const lookOf = (pal: Palette, base: Base = 'dark', bgOverride: string | null = null): Look => {
  const key = `${pal.id}|${pal.accent}${pal.secondary}${pal.highlight}${pal.text}${pal.background ?? ''}|${base}|${bgOverride ?? ''}`
  const hit = cache.get(key)
  if (hit) return hit

  const canvas = CANVAS[base]
  const ink = INK[base]
  const calm = (hex: string) => mix(hex, ink, CALM)
  const custom = bgOverride ?? pal.background
  const replyBg = custom ?? mix(canvas, pal.secondary, base === 'dark' ? 0.06 : 0.04)
  // A neutral step off the canvas: tinted with `highlight`, chips and code cards
  // took the orange that means "you".
  const codeBg = mix(canvas, ink, base === 'dark' ? 0.08 : 0.06)
  const rival = RIVAL[isCool(pal.accent) ? 'warm' : 'cool'][base]
  const youBg = mix(custom ?? canvas, rival, base === 'dark' ? 0.16 : 0.1)

  const look: Look = {
    base,
    canvas,
    replyBg,
    codeBg,
    code: ensureContrast(calm(pal.secondary), codeBg, 4.5),
    // The answer: replies sit on the canvas (no card), and must stand well above
    // the work (quiet, 5:1), so 9:1 on every theme, light ones included.
    text: ensureContrast(mix(pal.text, ink, 0.5), canvas, 9),
    accent: ensureContrast(calm(pal.accent), custom ?? canvas, 3),
    secondary: ensureContrast(calm(pal.secondary), custom ?? canvas, 3),
    highlight: ensureContrast(calm(pal.highlight), custom ?? canvas, 3),
    frame: mix(replyBg, pal.secondary, 0.35),
    you: ensureContrast(rival, youBg, 3),
    youBg,
    youText: ensureContrast(ink, youBg, 4.5),
    youQuiet: ensureContrast(mix(ink, youBg, 0.35), youBg, 4.5),
    // Grey half way between ink and canvas, with a touch of the theme's text so
    // it belongs to the palette; tinting it with a vivid colour made it unreadable.
    // Also used on a code card (its language label), so it must read on codeBg too.
    quiet: ensureContrast(ensureContrast(mix(mix(ink, canvas, 0.5), pal.text, 0.15), canvas, 5), codeBg, 4.5),
    muted: ensureContrast(mix(pal.secondary, canvas, 0.45), canvas, 3),
    error: ERROR[base],
  }
  if (cache.size > 64) cache.clear()
  cache.set(key, look)
  return look
}

/** A faint strip behind a tool row or command output, in `mark`. */
export const stripOf = (look: Look, mark: string, strength = 0.1): string => mix(look.canvas, mark, strength)
