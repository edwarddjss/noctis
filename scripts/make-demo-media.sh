#!/usr/bin/env bash
# Generates synthetic demo media (ffmpeg test patterns + tones) for the MOCK
# stream provider. No third-party footage is used.
#   public/demo/demo-{a,b}.webm        VP8/Opus  (plays in Chromium/Firefox)
#   public/demo/hls-{a,b}/index.m3u8   H.264/AAC HLS (Safari native, hls.js elsewhere)
#   public/demo/demo-a.en.vtt          sample captions
set -euo pipefail
cd "$(dirname "$0")/../public/demo"
DUR=${DUR:-20}

make() {
  local name=$1 pattern=$2 freq=$3
  local v="${pattern}=size=320x180:rate=15:duration=${DUR}"
  local a="sine=frequency=${freq}:sample_rate=48000:duration=${DUR}"
  ffmpeg -loglevel error -y -f lavfi -i "$v" -f lavfi -i "$a" \
    -c:v libvpx -b:v 120k -deadline realtime -cpu-used 8 -c:a libopus -b:a 24k "demo-${name}.webm"
  rm -rf "hls-${name}" && mkdir -p "hls-${name}"
  ffmpeg -loglevel error -y -f lavfi -i "$v" -f lavfi -i "$a" \
    -c:v libx264 -profile:v main -preset veryfast -b:v 150k -g 30 -keyint_min 30 -sc_threshold 0 \
    -c:a aac -b:a 32k -f hls -hls_time 4 -hls_playlist_type vod \
    -hls_segment_filename "hls-${name}/seg%03d.ts" "hls-${name}/index.m3u8"
}

make a testsrc2 440
make b smptehdbars 660

{
  echo "WEBVTT"
  echo
  for i in $(seq 0 5 $((DUR - 5))); do
    printf '00:%02d:%02d.000 --> 00:%02d:%02d.000\nDemo caption — synthetic test pattern (%ss)\n\n' $((i / 60)) $((i % 60)) $(((i + 4) / 60)) $(((i + 4) % 60)) "$i"
  done
} > demo-a.en.vtt
echo "demo media written to public/demo"
