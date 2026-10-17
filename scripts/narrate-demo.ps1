param([string]$Manifest, [string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speaker.Rate = 0
$segments = Get-Content -Raw -LiteralPath $Manifest | ConvertFrom-Json
try {
  for ($i = 0; $i -lt $segments.Count; $i++) {
    $speaker.SetOutputToWaveFile((Join-Path $OutputDirectory "$i.wav"))
    $speaker.Speak([string]$segments[$i].text)
    $speaker.SetOutputToNull()
  }
} finally { $speaker.Dispose() }
