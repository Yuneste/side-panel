export type Card = {
  at: number
  headline: string
  needFromYou: string[]
  done: string[]
  watch: string[]
}

export type Peer = { name: string; folder: string; isBusy: boolean; state: string; task: string; card: string }

export type Here = { folder: string; path: string; model: string; effort: string }

export type Meter = {
  five: number | null
  week: number | null
  ctx: number | null
  git: { branch: string; changed: number; ahead: number } | null
}

export type Helper = { id: string; kind: string; label: string; status: string; at: number; endedAt: number }

export type Step = { tool: string; label: string; at: number } | null

export type SleepPlan = { mode: string; at: number; status: string; sleepsAt: number } | null

export type Voice = {
  isUp: boolean
  status: string
  idx: number
  total: number
  sentence: string
  speed: number
  isAuto: boolean
}

declare module 'claude-code' {
  interface PluginState {
    panel: {
      cards: Shaped<Card[]>
      peers: Shaped<Peer[]>
      here: Shaped<Here>
      meter: Shaped<Meter>
      notes: Shaped<string[]>
      helpers: Shaped<Helper[]>
      step: Shaped<Step>
      sleep: Shaped<SleepPlan>
      sleepUnit: Shaped<'min' | 'h'>
      voice: Shaped<Voice>
    }
  }
}
