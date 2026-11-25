// The "read this" card: every finished task in one sentence, what you need to do, what changed, what to watch.
import { atom, read, update } from 'claude-code'
import { colour, hhmm, icon, list, TOOL, plain } from '../core'
import type { Eng } from '../core'
import { settings } from '../settings'
import type { Card } from '../../types'

const cards = atom({ plugin: 'panel', key: 'cards' } as const, [], { shape: 'cards-1' })

// The one extra rule every session gets: fill in the card as the last step of each task.
export const rule = [
  'The user finds long final answers hard to read, and shorter answers lose information.',
  `So: at the end of every turn where you did work, finished a task, or need something from the user, call the tool ${TOOL} once,`,
  'as your last tool call, with what they must read. Then still write your normal full answer in chat.',
  'Each item is one short plain line, no jargon, no markdown. headline: the whole result in one sentence.',
  'need_from_you: only what the user must do or decide, empty if nothing. done: what changed (max 5).',
  'watch: risks or open issues (max 3). Skip the call for plain chit-chat or a one-line answer.',
].join(' ')

export async function start($: Eng): Promise<void> {
  await $.tool.register({
    name: 'brief',
    description: 'Pins what the user must read from this turn on the card in their side panel. Call once, last, at the end of a turn that did work.',
    isDeferred: false,
    inputSchema: {
      type: 'object',
      properties: {
        headline: { type: 'string', description: 'The whole result in one plain sentence.' },
        need_from_you: { type: 'array', items: { type: 'string' }, description: 'What the user must do or decide.' },
        done: { type: 'array', items: { type: 'string' }, description: 'What changed, one line each.' },
        watch: { type: 'array', items: { type: 'string' }, description: 'Risks or open issues.' },
      },
      required: ['headline'],
    },
  })
}

// The brief tool was called: keep the card. Returns it so the other parts can use it.
export async function took($: Eng, input: Record<string, unknown>): Promise<Card> {
  const card: Card = {
    at: await $.clock.now(),
    headline: String(input.headline ?? '').replace(/\s+/g, ' ').trim() || 'Done.',
    needFromYou: list(input.need_from_you),
    done: list(input.done, 5),
    watch: list(input.watch, 3),
  }
  await update($, cards, all => [card, ...all].slice(0, 20))
  return card
}

// The card as one text to read out loud.
export function spoken(c: Card): string {
  const parts = [c.headline]
  if (c.needFromYou.length) {
    parts.push(c.needFromYou.length === 1 ? 'One thing for you.' : `${c.needFromYou.length} things for you.`)
    c.needFromYou.forEach((x, i) => parts.push(`${c.needFromYou.length > 1 ? `${i + 1}. ` : ''}${x}`))
  }
  if (c.watch.length) parts.push('Watch out.', ...c.watch)
  return parts.join('\n')
}

export async function view($: Eng, ui: any) {
  const { Box, Text } = ui
  const all = await read($, cards)
  const c = all[0]
  const section = (key: string, title: string, color: string | undefined, items: string[], numbered: boolean) =>
    items.length === 0 ? null : (
      <Box key={key} flexDirection="column" marginTop={1}>
        <Text bold color={color}>
          {title}
        </Text>
        {items.map((x, i) => (
          <Text key={`${key}-${i}`} wrap="wrap">
            {' '}
            {numbered ? `${i + 1}.` : '•'} {x}
          </Text>
        ))}
      </Box>
    )
  const frame = settings.cardFrame === 'none' ? undefined : settings.cardFrame
  return (
    <Box flexDirection="column">
      <Box flexDirection="column" borderStyle={frame} borderColor={colour.accent} paddingX={frame ? 1 : 0}>
        <Text bold color={colour.info}>
          {icon('📌')}READ THIS{c ? `  ·  ${hhmm(c.at)}` : ''}
        </Text>
        {c ? (
          <Text bold wrap="wrap">
            {c.headline}
          </Text>
        ) : (
          <Text dimColor wrap="wrap">
            Nothing yet. It fills in when a task finishes.
          </Text>
        )}
        {c ? section('need', '▶ You need to', colour.warn, c.needFromYou, true) : null}
        {c ? section('done', '✓ Done', colour.good, c.done, false) : null}
        {c ? section('watch', '⚠ Watch', colour.bad, c.watch, false) : null}
      </Box>
      {all.length > 1 ? (
        <Box flexDirection="column">
          <Text dimColor>Earlier</Text>
          {all.slice(1, 5).map((x, i) => (
            <Text key={`old-${i}`} dimColor wrap="truncate-end">
              {' '}
              {hhmm(x.at)} {x.headline}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  )
}

// The newest card as text to read out loud ('' when there is none).
export async function latestText($: Eng): Promise<string> {
  const c = (await read($, cards))[0]
  return c ? spoken(c) : ''
}
