#!/bin/zsh
# Sleep timer for the side panel (macOS). The panel and the sleep skill (your phone) both use it.
#   sleep.sh at 2h | 90m | 14:30     sleep at that time
#   sleep.sh done [3h | 14:30]       sleep once every Claude Code session is quiet for a while (latest: the cap)
#   sleep.sh cancel | status | check
#   sleep.sh watch                   started by "at" and "done": watches the plan, warns 2 minutes before, sleeps
# Options: --config <Claude Code folder>  --quiet-min <minutes, 10>  --cap-hours <hours, 4>
#          --dry  (for tests: does everything but never sleeps and never speaks)
# Written for macOS (plutil, pmset, say). Not tested on a Mac yet.

words=()
CONFIG=""
QUIET_MIN=10
CAP_HOURS=4
DRY=0
while (( $# > 0 )); do
  case "$1" in
    --config) CONFIG="$2"; shift 2 ;;
    --quiet-min) QUIET_MIN="$2"; shift 2 ;;
    --cap-hours) CAP_HOURS="$2"; shift 2 ;;
    --dry) DRY=1; shift ;;
    *) words+=("${1:l}"); shift ;;
  esac
done
[[ -z "$CONFIG" ]] && CONFIG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SHARED="$CONFIG/panel-shared"
PLAN="$SHARED/sleep.json"
SESSIONS="$CONFIG/sessions"
VOICE_URL="http://127.0.0.1:4271"
HERE="${0:A:h}"

now_ms() { print $(( $(date +%s) * 1000 )) }
clock() { date -r $(( $1 / 1000 )) +%H:%M }
field() { plutil -extract "$2" raw -o - "$1" 2>/dev/null }

# Prints the plan's fields as "id mode at quietMin armedAt", or nothing when there is no plan.
read_plan() {
  [[ -f "$PLAN" ]] || return 1
  [[ "$(field "$PLAN" cancelled)" == "true" ]] && return 1
  local mode=$(field "$PLAN" mode)
  [[ "$mode" == "at" || "$mode" == "done" ]] || return 1
  print "$(field "$PLAN" id) $mode $(field "$PLAN" at) $(field "$PLAN" quietMin) $(field "$PLAN" armedAt)"
}

save_plan() { # id mode at quietMin armedAt status sleepsAt
  mkdir -p "$SHARED"
  local st="${6//\\/\\\\}"; st="${st//\"/\\\"}"
  print -r -- "{\"id\":\"$1\",\"mode\":\"$2\",\"at\":$3,\"quietMin\":$4,\"armedAt\":$5,\"status\":\"$st\",\"sleepsAt\":$7}" > "$PLAN.tmp" && mv -f "$PLAN.tmp" "$PLAN"
}

# "14:30" -> that time today (or tomorrow); "2h", "90m", "1h30m", "1.5h" -> from now; else nothing.
when_from() {
  local s="$1" now="$2"
  if [[ "$s" =~ '^([0-9]{1,2}):([0-9]{2})$' ]]; then
    local t=$(date -j -f "%H:%M:%S" "$match[1]:$match[2]:00" +%s 2>/dev/null) || return 1
    (( t * 1000 <= now )) && (( t += 86400 ))
    print $(( t * 1000 ))
    return 0
  fi
  if [[ "$s" =~ '^(([0-9]+(\.[0-9]+)?)h)?(([0-9]+)m(in)?)?$' ]] && [[ -n "$match[2]$match[5]" ]]; then
    local h="${match[2]:-0}" m="${match[5]:-0}"
    local ms=$(( (h * 60 + m) * 60000 ))
    print $(( now + ${ms%.*} ))
    return 0
  fi
  return 1
}

# The live sessions that are working right now.
busy_sessions() {
  local f pid st name out=()
  for f in "$SESSIONS"/*.json(N); do
    pid=$(field "$f" pid) || continue
    kill -0 "$pid" 2>/dev/null || continue
    st=$(field "$f" status); [[ -z "$st" ]] && st=idle
    [[ "$st" == idle || "$st" =~ 'wait|input|permission|blocked' ]] && continue
    name=$(field "$f" name); [[ -z "$name" ]] && name=$(field "$f" sessionId)
    out+=("$name")
  done
  print -r -- "${(j:, :)out}"
}

say_it() {
  (( DRY )) && return
  local body="{\"text\":\"$1\",\"title\":\"Sleep timer\",\"from\":\"sleep\"}"
  curl -s -m 3 -X POST -H 'Content-Type: application/json' -d "$body" "$VOICE_URL/say" >/dev/null 2>&1 && return
  local py="$CONFIG/panel-voice/venv/bin/python3" narrator="${HERE:h}/voice/narrator.py"
  if [[ -x "$py" && -f "$narrator" ]]; then
    nohup "$py" -I "$narrator" --port 4271 --home "$CONFIG/panel-voice" >/dev/null 2>&1 &
    for i in {1..40}; do
      sleep 0.5
      curl -s -m 3 -X POST -H 'Content-Type: application/json' -d "$body" "$VOICE_URL/say" >/dev/null 2>&1 && return
    done
  fi
  say "$1" &
}

start_watch() {
  local extra=(); (( DRY )) && extra=(--dry)
  nohup /bin/zsh "${0:A}" watch --config "$CONFIG" $extra >/dev/null 2>&1 &
}

arm() { # mode at
  local now=$(now_ms)
  save_plan "$now" "$1" "$2" "$QUIET_MIN" "$now" "" 0
  start_watch
}

watch_plan() {
  local plan=($(read_plan)); (( $#plan )) || return
  local id="$plan[1]" quiet_since=0 warned=0
  while true; do
    local p=($(read_plan)); (( $#p )) || return
    [[ "$p[1]" == "$id" ]] || return
    local mode="$p[2]" at="$p[3]" qmin="$p[4]" armed="$p[5]"
    local now=$(now_ms) due="$at" status="" sleeps_at=0
    if [[ "$mode" == done ]]; then
      local busy=$(busy_sessions)
      if [[ -z "$busy" ]]; then
        (( quiet_since == 0 )) && quiet_since=$now
        (( quiet_since + qmin * 60000 < at )) && due=$(( quiet_since + qmin * 60000 ))
        status="all sessions are quiet, sleeping at $(clock $due)"
      else
        quiet_since=0; warned=0
        status="busy: $busy"
      fi
    fi
    if (( now >= due - 120000 )); then sleeps_at=$due; status="sleeping in 2 minutes"; fi
    local again=($(read_plan)); (( $#again )) || return
    [[ "$again[1]" == "$id" ]] || return
    save_plan "$id" "$mode" "$at" "$qmin" "$armed" "$status" "$sleeps_at"
    if (( sleeps_at && ! warned )); then
      warned=1
      local why=""; [[ "$mode" == done ]] && why=", because all sessions are done"
      say_it "The computer goes to sleep in two minutes$why. Cancel it in the panel if you are still here."
    fi
    if (( now >= due )); then
      local last=($(read_plan)); (( $#last )) || return
      [[ "$last[1]" == "$id" ]] || return
      if (( DRY )); then save_plan "$id" "$mode" "$at" "$qmin" "$armed" "test: would sleep now" "$due"; return; fi
      rm -f "$PLAN"
      pmset sleepnow >/dev/null
      return
    fi
    sleep 15
  done
}

now=$(now_ms)
first="${words[1]:-status}"
case "$first" in
  watch) watch_plan ;;
  check) b=$(busy_sessions); [[ -z "$b" ]] && print "All sessions are quiet." || print "Busy: $b" ;;
  status)
    p=($(read_plan)); (( $#p )) || { print "No sleep timer."; exit 0 }
    if [[ "$p[2]" == at ]]; then print "The computer sleeps at $(clock $p[3])."
    else print "The computer sleeps when all sessions are done, $(clock $p[3]) at the latest. Now: $(field "$PLAN" status)."; fi ;;
  cancel|off|stop)
    [[ -f "$PLAN" ]] && { mkdir -p "$SHARED"; print '{"cancelled":true}' > "$PLAN"; }
    print "Sleep timer off." ;;
  done|idle)
    if [[ ! -d "$SESSIONS" ]]; then
      print "Can't find Claude Code's sessions folder ($SESSIONS), so the timer can't tell when work is done. Use a time instead, like 2h."; exit 1
    fi
    if [[ -n "$words[2]" ]]; then cap=$(when_from "$words[2]" $now) || { print "Can't read \"$words[2]\". Example: done 3h"; exit 1 }
    else ms=$(( CAP_HOURS * 3600000 )); cap=$(( now + ${ms%.*} )); fi
    arm done "$cap"
    print "The computer sleeps once every session is quiet for $QUIET_MIN minutes, $(clock $cap) at the latest. You hear a warning 2 minutes before." ;;
  *)
    what="$first"; [[ "$first" == at && -n "$words[2]" ]] && what="$words[2]"
    at=$(when_from "$what" $now) || { print "Can't read \"$what\". Examples: 2h, 90m, 14:30, done"; exit 1 }
    arm at "$at"
    print "The computer sleeps at $(clock $at). You hear a warning 2 minutes before." ;;
esac
