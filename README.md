# side-panel

A Claude Code skill that builds you your own side panel: a pane right next to the chat that shows what matters
while you work. It asks a few questions you answer by clicking (which parts, the colours, the order), then writes
the plugin, checks it with Claude Code's own plugin check, and tells you to restart.

| Part | What it does |
|---|---|
| Card | one card per finished task: what happened, what you need to do, what changed, what to watch |
| At a glance | model and effort menus, usage this week and in the 5-hour window, how full the context is, git |
| Quick notes | type a thought while Claude works; it goes into one inbox file any session can work through |
| Other sessions | your other live sessions, busy or done, with their task and their last card |
| Helpers | the step Claude runs right now and every background helper, with how long it has run |
| Sleep timer | the computer sleeps at a time, after a while, or once every session is done; also from your phone |
| Voice | reads the card or the whole answer out loud (Kokoro: free, offline, natural) |

Pick only what you will look at. Run the skill again any time to change parts, order, colours or the voice.

## Install

macOS / Linux / Git Bash:

```
git clone https://github.com/yuneste/side-panel ~/.claude/skills/side-panel
```

Windows PowerShell:

```
git clone https://github.com/yuneste/side-panel "$env:USERPROFILE\.claude\skills\side-panel"
```

Or download this repo as a ZIP and put the folder at `~/.claude/skills/side-panel`. Then start Claude Code in
any folder and type `/side-panel`.

## Before you install

A plugin is code that runs on your computer in every session. Read it first, or ask Claude to check it, and that
includes this one. Everything is in this folder: `panel/` is the plugin the skill copies, `SKILL.md` is what
Claude follows. Nothing is sent anywhere: the voice runs on your computer, and the panel only reads Claude Code's
own files.

## Good to know

- Plugins with code modules are an early-access part of Claude Code and may change between versions.
  Built and tested on Claude Code **2.1.332** on **Windows**. The macOS path is written but not tested yet:
  tell me if something breaks there.
- The panel opens beside the chat when the terminal window is wide enough. `/panel` opens it again.
- Sessions talking to each other is Claude Code's own messaging; the panel only shows it.
- The voice downloads about 470 MB once (Python through uv, and the Kokoro voice files).
- Remove it: delete `~/.claude/skills/panel`, `~/.claude/panel-voice` and `~/.claude/panel-shared`.

MIT licence. Made by Yuko Makes.
