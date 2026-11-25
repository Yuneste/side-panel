# Your side panel

A panel beside the Claude Code chat, built for you by the `side-panel` skill.
It shows only the parts you picked, in your order and colours (`hooks/settings.ts`).

| Part | What it does |
|---|---|
| strip | the folder, model and effort (switch both from a menu), usage this week and in the 5-hour window, how full the context is, git |
| card | one card per finished task: what happened, what you need to do, what changed, what to watch |
| notes | a quick note box; notes go into one inbox file that any session can work through ("work through my inbox") |
| sessions | your other live Claude Code sessions, busy or done, with their task and last card |
| helpers | the step Claude runs right now and every background helper, with how long it has run |
| sleep | the computer sleeps at a time, after a while, or once every session is done (`/sleep`, or from your phone) |
| voice | reads the card or the whole answer out loud |

Change anything by asking Claude ("move the card to the top", "turn the voice off") or by running the
`side-panel` skill again. Then restart Claude Code, or run `/reload-plugins`.

The panel opens beside the chat when the window is wide enough. `/panel` opens it again.

Plugins with code modules are an early-access part of Claude Code and may change between versions.
Built and tested on Claude Code 2.1.332 (Windows). The macOS path is written but not tested.

MIT licence. Made by Yuko Makes.
