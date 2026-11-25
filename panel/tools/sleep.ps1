# Sleep timer for the side panel (Windows). The panel and the sleep skill (your phone) both use it.
#   sleep.ps1 at 2h | 90m | 14:30     sleep at that time
#   sleep.ps1 done [3h | 14:30]       sleep once every Claude Code session is quiet for a while (latest: the cap)
#   sleep.ps1 cancel | status | check
#   sleep.ps1 watch                   started by "at" and "done": watches the plan, warns 2 minutes before, sleeps
# Options: --config <Claude Code folder>  --quiet-min <minutes, 10>  --cap-hours <hours, 4>
#          --dry  (for tests: does everything but never sleeps and never speaks)
# "Quiet" means idle or waiting for you. Cancel any time: the panel, /sleep cancel, or this script.

$ErrorActionPreference = 'Stop'
$words = @()
$Config = ''
$QuietMin = 10
$CapHours = 4
$Dry = $false
for ($i = 0; $i -lt $args.Count; $i++) {
  $a = [string]$args[$i]
  if ($a -eq '--config') { $i++; $Config = [string]$args[$i] }
  elseif ($a -eq '--quiet-min') { $i++; $QuietMin = [int]$args[$i] }
  elseif ($a -eq '--cap-hours') { $i++; $CapHours = [double]::Parse([string]$args[$i], [Globalization.CultureInfo]::InvariantCulture) }
  elseif ($a -eq '--dry') { $Dry = $true }
  else { $words += $a.ToLowerInvariant() }
}
if (-not $Config) { $Config = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $env:USERPROFILE '.claude' } }
$Shared = Join-Path $Config 'panel-shared'
$Plan = Join-Path $Shared 'sleep.json'
$Sessions = Join-Path $Config 'sessions'
$VoiceUrl = 'http://127.0.0.1:4271'

function Now-Ms { [DateTimeOffset]::Now.ToUnixTimeMilliseconds() }
function Clock([long]$ms) { [DateTimeOffset]::FromUnixTimeMilliseconds($ms).ToLocalTime().ToString('HH:mm') }

function Read-Plan {
  try {
    $p = [IO.File]::ReadAllText($Plan) | ConvertFrom-Json
    if ($p.cancelled -or -not $p.mode) { return $null }
    return $p
  } catch { return $null }
}

function Save-Plan($fields) {
  New-Item -ItemType Directory -Force -Path $Shared | Out-Null
  [IO.File]::WriteAllText($Plan, (New-Object PSObject -Property $fields | ConvertTo-Json -Compress))
}

# "14:30" -> that time today (or tomorrow); "2h", "90m", "1h30m", "1.5h" -> from now; else $null.
function When-From([string]$s, [long]$now) {
  if ($s -match '^(\d{1,2}):(\d{2})$') {
    $d = [DateTime]::Today.AddHours([int]$Matches[1]).AddMinutes([int]$Matches[2])
    if ($d -le [DateTime]::Now) { $d = $d.AddDays(1) }
    return ([DateTimeOffset]$d).ToUnixTimeMilliseconds()
  }
  if ($s -match '^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m(?:in)?)?$' -and ($Matches[1] -or $Matches[2])) {
    $h = if ($Matches[1]) { [double]::Parse($Matches[1], [Globalization.CultureInfo]::InvariantCulture) } else { 0 }
    $m = if ($Matches[2]) { [int]$Matches[2] } else { 0 }
    return $now + [long](($h * 60 + $m) * 60000)
  }
  return $null
}

# The live sessions that are working right now (a file left by a session that ended says nothing).
function Busy-Sessions {
  $busy = New-Object System.Collections.ArrayList
  if (-not (Test-Path -LiteralPath $Sessions)) { return ,$busy }
  foreach ($f in Get-ChildItem -LiteralPath $Sessions -Filter '*.json' -File) {
    try {
      $s = [IO.File]::ReadAllText($f.FullName) | ConvertFrom-Json
      if (-not $s.pid -or -not (Get-Process -Id ([int]$s.pid) -ErrorAction SilentlyContinue)) { continue }
      $st = if ($s.status) { [string]$s.status } else { 'idle' }
      $quiet = ($st -eq 'idle') -or ($st -match 'wait|input|permission|blocked')
      if (-not $quiet) { [void]$busy.Add($(if ($s.name) { [string]$s.name } else { [string]$s.sessionId })) }
    } catch {}
  }
  return ,$busy
}

# The warning is spoken by the panel's own voice (started if it is set up but not running).
# Only a computer without the voice set up falls back to the Windows voice.
function Say([string]$text) {
  if ($Dry) { return }
  $body = @{ text = $text; title = 'Sleep timer'; from = 'sleep' } | ConvertTo-Json -Compress
  $post = { try { Invoke-RestMethod -Uri "$VoiceUrl/say" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 3 | Out-Null; $true } catch { $false } }
  if (& $post) { return }
  $py = Join-Path $Config 'panel-voice\venv\Scripts\pythonw.exe'
  $narrator = Join-Path (Split-Path -Parent $PSScriptRoot) 'voice\narrator.py'
  if ((Test-Path -LiteralPath $py) -and (Test-Path -LiteralPath $narrator)) {
    Start-Process -WindowStyle Hidden -FilePath $py -ArgumentList @('-I', "`"$narrator`"", '--port', '4271', '--home', "`"$(Join-Path $Config 'panel-voice')`"")
    for ($i = 0; $i -lt 40; $i++) { Start-Sleep -Milliseconds 500; if (& $post) { return } }
  }
  try {
    Add-Type -AssemblyName System.Speech
    $v = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $v.Speak($text)
    $v.Dispose()
  } catch {}
}

function Start-Watch {
  $self = $PSCommandPath
  $list = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', "`"$self`"", 'watch', '--config', "`"$Config`"")
  if ($Dry) { $list += '--dry' }
  Start-Process -WindowStyle Hidden -FilePath 'powershell' -ArgumentList $list
}

function Arm([string]$mode, [long]$at) {
  $now = Now-Ms
  Save-Plan ([ordered]@{ id = "$now"; mode = $mode; at = $at; quietMin = $QuietMin; armedAt = $now; status = ''; sleepsAt = 0 })
  Start-Watch
}

function Watch {
  $mine = Read-Plan
  if (-not $mine) { return }
  $id = [string]$mine.id
  $quietSince = 0
  $warned = $false
  while ($true) {
    $p = Read-Plan
    if (-not $p -or [string]$p.id -ne $id) { return } # cancelled or replaced
    $now = Now-Ms
    $due = [long]$p.at
    $status = [string]$p.status
    if ($p.mode -eq 'done') {
      $busy = Busy-Sessions
      if ($busy.Count -eq 0) {
        if ($quietSince -eq 0) { $quietSince = $now }
        $due = [Math]::Min([long]$p.at, $quietSince + [long]$p.quietMin * 60000)
        $status = "all sessions are quiet, sleeping at $(Clock $due)"
      } else {
        $quietSince = 0
        $warned = $false
        $status = 'busy: ' + ($busy -join ', ')
      }
    }
    $sleepsAt = 0
    if ($now -ge $due - 120000) {
      $sleepsAt = $due
      $status = 'sleeping in 2 minutes'
    }
    $again = Read-Plan
    if (-not $again -or [string]$again.id -ne $id) { return }
    Save-Plan ([ordered]@{ id = $id; mode = [string]$p.mode; at = [long]$p.at; quietMin = [int]$p.quietMin; armedAt = [long]$p.armedAt; status = $status; sleepsAt = $sleepsAt })
    if ($sleepsAt -and -not $warned) {
      $warned = $true
      Say ('The computer goes to sleep in two minutes' + $(if ($p.mode -eq 'done') { ', because all sessions are done' } else { '' }) + '. Cancel it in the panel if you are still here.')
    }
    if ($now -ge $due) {
      $last = Read-Plan
      if ($last -and [string]$last.id -eq $id) {
        if ($Dry) { Save-Plan ([ordered]@{ id = $id; mode = [string]$p.mode; at = [long]$p.at; quietMin = [int]$p.quietMin; armedAt = [long]$p.armedAt; status = 'test: would sleep now'; sleepsAt = $due }); return }
        [IO.File]::Delete($Plan)
        Add-Type -AssemblyName System.Windows.Forms
        [void][System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)
      }
      return
    }
    Start-Sleep -Seconds 15
  }
}

$now = Now-Ms
$first = if ($words.Count -gt 0) { $words[0] } else { 'status' }
switch ($first) {
  'watch' { Watch; break }
  'check' {
    $b = Busy-Sessions
    Write-Output ($(if ($b.Count -eq 0) { 'All sessions are quiet.' } else { 'Busy: ' + ($b -join ', ') }))
    break
  }
  'status' {
    $p = Read-Plan
    if (-not $p) { Write-Output 'No sleep timer.' }
    elseif ($p.mode -eq 'at') { Write-Output "The computer sleeps at $(Clock ([long]$p.at))." }
    else { Write-Output "The computer sleeps when all sessions are done, $(Clock ([long]$p.at)) at the latest. Now: $(if ($p.status) { $p.status } else { 'checking' })." }
    break
  }
  { $_ -in 'cancel', 'off', 'stop' } {
    if (Test-Path -LiteralPath $Plan) { Save-Plan ([ordered]@{ cancelled = $true }) }
    Write-Output 'Sleep timer off.'
    break
  }
  { $_ -in 'done', 'idle' } {
    # Without Claude Code's sessions folder every session would look quiet: refuse instead of sleeping too early.
    if (-not (Test-Path -LiteralPath $Sessions)) { Write-Output "Can't find Claude Code's sessions folder ($Sessions), so the timer can't tell when work is done. Use a time instead, like 2h."; exit 1 }
    $cap = if ($words.Count -gt 1) { When-From $words[1] $now } else { $now + [long]($CapHours * 3600000) }
    if ($null -eq $cap) { Write-Output "Can't read `"$($words[1])`". Example: done 3h"; exit 1 }
    Arm 'done' $cap
    Write-Output "The computer sleeps once every session is quiet for $QuietMin minutes, $(Clock $cap) at the latest. You hear a warning 2 minutes before."
    break
  }
  default {
    $what = if ($first -eq 'at' -and $words.Count -gt 1) { $words[1] } else { $first }
    $at = When-From $what $now
    if ($null -eq $at) { Write-Output "Can't read `"$what`". Examples: 2h, 90m, 14:30, done"; exit 1 }
    Arm 'at' $at
    Write-Output "The computer sleeps at $(Clock $at). You hear a warning 2 minutes before."
  }
}
