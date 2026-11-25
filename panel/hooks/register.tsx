// The side panel: wires the parts you picked (hooks/settings.ts) into Claude Code.
import type { Register } from 'claude-code'

import { getHere, has, PANE, place, setHere, TOOL } from './core'
import type { Eng } from './core'
import { settings } from './settings'
import { rule as cardRule, spoken as cardSpoken, latestText as cardLatestText, start as cardStart, took as cardTook, view as cardView } from './parts/card'
import { scanHelpers as helpersScanHelpers, stepEnds as helpersStepEnds, stepStarts as helpersStepStarts, view as helpersView } from './parts/helpers'
import { readNotes as notesReadNotes, rule as notesRule, view as notesView } from './parts/notes'
import { publish as sessionsPublish, readPeers as sessionsReadPeers, rule as sessionsRule, tidy as sessionsTidy, view as sessionsView } from './parts/sessions'
import { command as sleepCommand, commandHelp as sleepCommandHelp, readSleep as sleepReadSleep, view as sleepView } from './parts/sleep'
import { readMeter as stripReadMeter, sawStep as stripSawStep, shortModel as stripShortModel, view as stripView } from './parts/strip'
import { call as voiceCall, commandHelp as voiceCommandHelp, lastAnswer as voiceLastAnswer, poll as voicePoll, readsCards as voiceReadsCards, say as voiceSay, setAuto as voiceSetAuto, start as voiceStart, view as voiceView } from './parts/voice'

async function refreshHere($: Eng): Promise<void> {
  try {
    const path = await $.session.cwd()
    const folder = path.split(/[\\/]/).filter(Boolean).pop() ?? path
    const model = stripShortModel(await $.session.model())
    await setHere($, { folder, path, ...((await getHere($)).model ? {} : { model }) })
    const at = await getHere($)
    $.ui.status(`${settings.icons ? '📍 ' : ''}${folder} · ${at.model}${at.effort ? ` ${at.effort}` : ''}`)
  } catch {}
}

// Every 15 seconds: the slower reads.
async function slow($: Eng): Promise<void> {
  await refreshHere($)
  if (has('strip')) await stripReadMeter($)
  if (has('notes')) await notesReadNotes($)
  if (has('helpers')) await helpersScanHelpers($)
}

// Every 3 seconds: what other sessions and the sleep watcher change.
async function fast($: Eng): Promise<void> {
  if (has('sessions')) await sessionsReadPeers($)
  if (has('sleep')) await sleepReadSleep($)
  if (has('voice')) await voicePoll($)
}


export const register: Register = on => {
  let timers: { cancel: () => void }[] = []

  on('session.start', async ($, e, next) => {
    await place($)
    // One part failing to start must never keep the panel closed: each start is tried on its own.
    const failed: string[] = []
    try {
      await $.command.register({ name: 'panel', description: `Open the ${settings.title.toLowerCase()} beside the chat` })
    } catch {
      failed.push('/panel')
    }
    try {
      if (has('card')) await cardStart($)
    } catch {
      failed.push('card')
    }
    try {
      if (has('sleep')) await $.command.register({ name: 'sleep', description: sleepCommandHelp })
    } catch {
      failed.push('/sleep')
    }
    try {
      if (has('voice')) {
        await $.command.register({ name: 'say', description: voiceCommandHelp })
        await voiceStart($)
      }
    } catch {
      failed.push('voice')
    }
    if (has('sessions')) void sessionsTidy($)
    void $.ui.open({ id: PANE, title: settings.title })
    if (failed.length) $.ui.toast(`${settings.title}: ${failed.join(', ')} did not start. Ask Claude to check the panel.`)
    await slow($)
    await fast($)
    for (const t of timers) t.cancel()
    timers = [$.clock.every(15000, () => void slow($)), $.clock.every(3000, () => void fast($))]
    return next(e)
  })

  on('command.run', { command: 'panel' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: settings.title })
    await slow($)
    return { text: opened.isPlaced ? `${settings.title} open.` : `${settings.title} opens once the window is wide enough.` }
  })

  on('command.run', { command: 'sleep' }, async ($, e) => {
    if (!has('sleep')) return { text: 'The sleep timer is not part of your panel.' }
    return { text: await sleepCommand($, e.args) }
  })

  on('command.run', { command: 'say' }, async ($, e) => {
    if (!has('voice')) return { text: 'The voice is not part of your panel.' }
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      await voiceSetAuto($, arg === 'on')
      return { text: arg === 'on' ? 'The voice reads each new card.' : 'The voice stays quiet until you ask.' }
    }
    if (arg === 'card' || arg === 'full') {
      const text = arg === 'full' ? await voiceLastAnswer($) : await cardLatestText($)
      if (!text) return { text: 'Nothing to read yet.' }
      const ok = await voiceSay($, text, arg === 'full' ? 'Full answer' : 'Card')
      return { text: ok ? `Reading the ${arg === 'full' ? 'full answer' : 'card'}.` : 'The voice did not start.' }
    }
    const paths: Record<string, [string, Record<string, unknown>?]> = {
      '': ['/toggle'], play: ['/resume'], pause: ['/pause'], stop: ['/stop'], again: ['/again'],
      back: ['/back'], next: ['/next'], repeat: ['/repeat'],
      faster: ['/speed', { delta: 0.1 }], slower: ['/speed', { delta: -0.1 }],
    }
    const hit = paths[arg]
    if (!hit) return { text: `Unknown: ${arg}. Try /say card, full, again, back, next, stop, faster, slower, on, off.` }
    const ok = await voiceCall($, hit[0], hit[1] ?? {})
    return { text: ok ? `Voice: ${arg || 'play or pause'}.` : 'The voice is not running. /say card starts it.' }
  })

  on('prompt.submit', async ($, e, next) => {
    if (has('sessions')) {
      const text = String((e as { text?: string }).text ?? '').replace(/\s+/g, ' ').trim()
      // Short replies ("ok", "yes") say nothing about the task; messages from sessions or the system are not a task.
      if (text.length >= 25 && !text.startsWith('/') && !text.startsWith('<')) void sessionsPublish($, { task: text.slice(0, 90) })
    }
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    const rules: { id: string; text: string; scope: 'session' }[] = []
    if (has('card')) rules.push({ id: 'panel:card', text: cardRule, scope: 'session' })
    if (has('notes')) rules.push({ id: 'panel:notes', text: await notesRule($), scope: 'session' })
    if (has('sessions')) rules.push({ id: 'panel:sessions', text: sessionsRule, scope: 'session' })
    return { sections: [...r.sections, ...rules] }
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && has('strip')) {
      await stripSawStep($, e.model, e.effort === undefined ? undefined : String(e.effort))
      await refreshHere($)
    }
    return yield* next(e)
  })

  on('tool.call', async ($, e, next) => {
    const effort = (e as { effort?: { level?: string } }).effort?.level
    if (effort && has('strip')) {
      const at = await getHere($)
      if (at.effort !== effort) await setHere($, { effort })
    }

    if ((e.tool as string) === TOOL && has('card')) {
      const c = await cardTook($, e as unknown as Record<string, unknown>) // an MCP tool's arguments sit on the event itself
      if (has('sessions')) void sessionsPublish($, { card: c.headline })
      const panes = await $.ui.panes()
      if (!panes.some(p => p.id === PANE && p.isPlaced)) {
        $.ui.toast(`📌 ${c.headline}${c.needFromYou.length ? ` · ${c.needFromYou.length} for you` : ''}`)
      }
      if (has('voice') && (await voiceReadsCards($))) void voiceSay($, cardSpoken(c), 'Card', 'queue')
      return { result: 'Pinned on the card in the side panel. Now write your normal answer.' }
    }

    // Main session only: show the step that runs right now.
    if ((e as { agentId?: string }).agentId !== undefined || !has('helpers')) return next(e)
    const at = await helpersStepStarts($, e.tool, e as unknown as Record<string, unknown>)
    try {
      return await next(e)
    } finally {
      await helpersStepEnds($, at)
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box } = ui
    const views: Record<string, () => Promise<unknown>> = {
      strip: () => stripView($, ui),
      notes: () => notesView($, ui),
      sleep: () => sleepView($, ui),
      helpers: () => helpersView($, ui),
      sessions: () => sessionsView($, ui),
      card: () => cardView($, ui),
      voice: () => voiceView($, ui, () => cardLatestText($)),
    }
    const drawn: unknown[] = []
    for (const id of settings.parts) {
      const draw = views[id]
      if (!draw) continue
      drawn.push(
        <Box key={`part-${id}`} flexDirection="column" marginTop={drawn.length === 0 ? 0 : 1}>
          {(await draw()) as any}
        </Box>,
      )
    }
    return (
      <Box flexDirection="column" paddingX={1}>
        {drawn as any}
      </Box>
    )
  })
}
