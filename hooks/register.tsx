import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { LastResponse, Tally } from '../types'

const last = atom({ plugin: 'cache-warmth', key: 'last' } as const, null)
const tick = atom({ plugin: 'cache-warmth', key: 'tick' } as const, 0)
const tally = atom({ plugin: 'cache-warmth', key: 'tally' } as const, {
  read: 0,
  write: 0,
  input: 0,
  output: 0,
})

const BAR_CELLS = 8
const HOT = '#ff7a3d'
const WARM = '#f5b942'
const COOLING = '#e8d27a'
const COLD = '#7cc7ff'
const ROOMY = '#7fd18b'
const TIGHT = '#f5b942'
const FULL = '#ff5f5f'

const formatTokens = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`

const formatSpan = (ms: number): string => {
  const minutes = Math.floor(ms / 60_000)
  if (minutes >= 60) {
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
  }
  if (minutes >= 1) {
    return `${minutes}m`
  }
  return `${Math.max(0, Math.floor(ms / 1000))}s`
}

export const register: Register = (on, options) => {
  const ttlMs = options.ttl === '5m' ? 5 * 60_000 : 60 * 60_000
  const handoffAt = (Number.parseInt(String(options.handoffAt ?? '300k'), 10) || 300) * 1000
  const tightAt = handoffAt * (5 / 6)

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // Redraw the band every 15 s so the bar drains while idle.
    $.clock.every(15_000, () => {
      void update($, tick, n => n + 1)
    })
    return result
  })

  // A resumed session: seed from how long ago its last response was.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.seconds_since_last_response !== undefined && e.context_tokens !== undefined) {
      const now = await $.clock.now()
      const seeded: LastResponse = {
        at: now - e.seconds_since_last_response * 1000,
        contextTokens: e.context_tokens,
        hitRate: null,
      }
      await update($, last, () => seeded)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const usage = result.usage
    if (usage === null) {
      return result
    }
    await update($, tally, (t): Tally => ({
      read: t.read + usage.cache_read_input_tokens,
      write: t.write + usage.cache_creation_input_tokens,
      input: t.input + usage.input_tokens,
      output: t.output + usage.output_tokens,
    }))
    if (e.agentId === undefined) {
      const prompt = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
      const response: LastResponse = {
        at: await $.clock.now(),
        contextTokens: prompt + usage.output_tokens,
        hitRate: prompt > 0 ? usage.cache_read_input_tokens / prompt : null,
      }
      await update($, last, () => response)
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await read($, tick)
    const response = await read($, last)
    const totals = await read($, tally)
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    const cacheRow = async () => {
      if (response === null) {
        return (
          <Box>
            <Text color={COLD}>❄ </Text>
            <Text dimColor>Cache cold · nothing cached yet</Text>
          </Box>
        )
      }

      const elapsed = (await $.clock.now()) - response.at
      const remaining = ttlMs - elapsed
      const size = formatTokens(response.contextTokens)

      if (remaining <= 0) {
        return (
          <Box>
            <Text color={COLD} bold>{'❄ Cache cold '}</Text>
            <Text color={COLD}>{'▱'.repeat(BAR_CELLS) + ' '}</Text>
            <Text dimColor>{formatSpan(-remaining)} ago · re-caches {size}</Text>
          </Box>
        )
      }

      const fraction = remaining / ttlMs
      const filled = Math.max(1, Math.ceil(fraction * BAR_CELLS))
      const color = fraction > 0.5 ? HOT : fraction > 0.2 ? WARM : COOLING
      const label = fraction > 0.5 ? '🔥 Cache hot ' : fraction > 0.2 ? '🔥 Cache warm ' : '♨ Cache cool '
      const hit = response.hitRate === null ? '' : ` · ${Math.round(response.hitRate * 100)}% hit`

      return (
        <Box>
          <Text color={color} bold>{label}</Text>
          <Text color={color}>{'▰'.repeat(filled)}</Text>
          <Text color="subtle">{'▱'.repeat(BAR_CELLS - filled)}</Text>
          <Text dimColor>
            {' '}
            {formatSpan(remaining)} left{hit}
          </Text>
        </Box>
      )
    }

    const contextRow = () => {
      if (response === null) {
        return null
      }
      const used = response.contextTokens
      const fraction = Math.min(1, used / handoffAt)
      const filled = used > 0 ? Math.max(1, Math.round(fraction * BAR_CELLS)) : 0
      const color = used >= handoffAt ? FULL : used >= tightAt ? TIGHT : ROOMY
      const note = used >= handoffAt ? ' · handoff!' : ''
      return (
        <Box>
          <Text color={color} bold>{'◧ Context '}</Text>
          <Text color={color}>{'▰'.repeat(filled)}</Text>
          <Text color="subtle">{'▱'.repeat(BAR_CELLS - filled)}</Text>
          <Text dimColor>
            {' '}
            {formatTokens(used)}/{formatTokens(handoffAt)}
          </Text>
          <Text color={color} bold>{note}</Text>
        </Box>
      )
    }

    const tallyRow = () => {
      if (totals.read + totals.write + totals.input + totals.output === 0) {
        return null
      }
      return (
        <Box>
          <Text color="subtle" bold>{'Σ '}</Text>
          <Text dimColor>
            {formatTokens(totals.read)} read · {formatTokens(totals.write)} written · {formatTokens(totals.input)} fresh ·{' '}
            {formatTokens(totals.output)} out
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
        {await cacheRow()}
        {contextRow()}
        {tallyRow()}
      </Box>
    )
  })
}
