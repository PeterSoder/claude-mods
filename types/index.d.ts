/** The last main-thread response: when it arrived and what the cache did. */
export type LastResponse = {
  /** Epoch milliseconds of the response. */
  at: number
  /** Prompt tokens the next request re-sends (cached prefix size). */
  contextTokens: number
  /** Share of the prompt the cache served on that response, 0..1; null when unknown. */
  hitRate: number | null
}

/** Token counts summed over every model request of the session, subagents included. */
export type Tally = {
  read: number
  write: number
  input: number
  output: number
}

declare module 'claude-code' {
  interface PluginState {
    'cache-warmth': { last: LastResponse | null; tick: number; tally: Tally }
  }
}
