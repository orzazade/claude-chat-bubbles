/** One theme: four colors and an optional message background. */
export type Palette = {
  /** Stable id, `collection:name` slugged; saved themes use `mine:<name>`. */
  id: string
  name: string
  /** The collection it is listed under in the studio. */
  group: string
  /** Borders, headings, chips and the first stop of every gradient. */
  accent: string
  /** Reply cards, bullets and the second gradient stop. */
  secondary: string
  /** Bold text, inline code, running tools and the hottest gradient stop. */
  highlight: string
  /** Body text. */
  text: string
  /** Message background; tinted from the accent when absent. */
  background?: string
}

/** How messages are drawn: recolored text and backgrounds, a border only, or untouched. */
export type MessageStyle = 'full' | 'outline' | 'off'

/** How your own prompts are drawn: a text bubble, a frame around the app's own row (keeps pasted images), or the app's row untouched. */
export type PromptStyle = 'bubble' | 'frame' | 'native'

/** Which canvas the theme is tuned for; `auto` follows Claude Code's own theme setting. */
export type BaseMode = 'auto' | 'dark' | 'light'

declare module 'claude-code' {
  interface PluginState {
    'chat-bubbles': {
      /** The theme in use, or null for Claude Code's own look. */
      active: Palette | null
      /** The collection the studio is showing. */
      group: string
      /** The studio's search text; empty shows the collection. */
      query: string
      /** The palette under "Mix your own". */
      custom: Palette
      /** Themes the person saved from the mixer. */
      saved: Palette[]
      messageStyle: MessageStyle
      promptStyle: PromptStyle
      /** Which of your prompts carry pasted images or files, by row id and by text. */
      media: Record<string, boolean>
      /** Theme the tool rows, spinner, footer, command output and mod panes too. */
      themeChrome: boolean
      base: BaseMode
      /** `base` with `auto` resolved: what the colors are tuned against. Other mods read it. */
      resolvedBase: 'dark' | 'light'
      /** A background that overrides every theme's, from `/theme bg`. */
      bgOverride: string | null
      /** The studio's last status line. */
      notice: string
      /**
       * Reply text blocks a later tool call followed: work, drawn dim. Keyed by
       * the row id's first 23 characters (the drawn id zeroes the rest).
       */
      work: Record<string, true>
      /**
       * Your messages the session stored (prompts, delivered queued messages,
       * slash commands), by row key. A message with no key here, drawn while a
       * turn runs, is still in the queue.
       */
      sent: Record<string, true>
      /**
       * The main thread's last turns: how long each took, when it ended, and
       * what it cost (null where the host gives no cost). The turn-end line
       * finds its own by duration.
       */
      turns: { durationMs: number; at: number; usd: number | null }[]
    }
  }
}
