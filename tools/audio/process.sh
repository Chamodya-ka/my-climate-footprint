#!/usr/bin/env bash
# Builds the game's audio (assets/audio/game/) from the source recordings in assets/audio/.
# Needs ffmpeg. Run from the repo root: tools/audio/process.sh
set -euo pipefail

SRC=assets/audio
OUT=assets/audio/game
mkdir -p "$OUT"

# Removes silence from both ends (by trimming the start, reversing, trimming again).
TRIM_EDGES="silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse"

# Music: trim the silent edges so the loop has no gap, then match loudness (two-pass loudnorm, linear gain).
music() {
  local in="$SRC/$1" out="$OUT/$2"
  local stats
  stats=$(ffmpeg -hide_banner -nostats -i "$in" -af "$TRIM_EDGES,loudnorm=I=-20:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')
  get() { echo "$stats" | sed -n "s/.*\"$1\" : \"\(.*\)\".*/\1/p"; }
  ffmpeg -hide_banner -loglevel error -y -i "$in" \
    -af "$TRIM_EDGES,loudnorm=I=-20:TP=-1.5:LRA=11:linear=true:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset)" \
    -ar 44100 -c:a libmp3lame -q:a 5 "$out"
}
music CoastalMusic.wav music_coastal.mp3
music UrbanMusic.wav music_urban.mp3
music UphillMusic.wav music_hills.mp3
music MenuMusic.wav music_menu.mp3

# Click: just the click (about 0.14 s of a 3 s file), with tiny fades so it doesn't pop.
ffmpeg -hide_banner -loglevel error -y -i "$SRC/mouse-click-sound.mp3" \
  -af "silenceremove=start_periods=1:start_threshold=-45dB,atrim=0:0.16,afade=t=in:d=0.004,afade=t=out:st=0.13:d=0.03" \
  -c:a libmp3lame -q:a 4 "$OUT/click.mp3"

# Landslide: the file holds two takes; keep the start of the first, cut to the length of the
# on-screen slip (debris falls for about 3 s), fading in and out.
ffmpeg -hide_banner -loglevel error -y -i "$SRC/landslide-effect.mp3" \
  -af "silenceremove=start_periods=1:start_threshold=-45dB,atrim=0:3.3,afade=t=in:d=0.05,afade=t=out:st=2.1:d=1.2" \
  -c:a libmp3lame -q:a 4 "$OUT/landslide.mp3"

# Flood: no silent edges to trim; keep the whole 18 s (the water stays on screen) with soft edges.
ffmpeg -hide_banner -loglevel error -y -i "$SRC/floodingEffect.mp3" \
  -af "$TRIM_EDGES,afade=t=in:d=0.3,areverse,afade=t=in:d=1.5,areverse" \
  -c:a libmp3lame -q:a 4 "$OUT/flood.mp3"

ls -la "$OUT"
