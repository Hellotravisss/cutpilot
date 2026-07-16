#!/usr/bin/env bash
set -u
failed=0
check(){ if command -v "$1" >/dev/null 2>&1; then printf "✓ %-14s %s\n" "$1" "$(command -v "$1")"; else printf "✗ %-14s missing\n" "$1"; [[ "$2" == required ]] && failed=1; fi; }
echo "CutPilot readiness"
echo "macOS: $(sw_vers -productVersion 2>/dev/null || uname -s)"
check node required; check ffmpeg required; check ffprobe required; check magick optional
if [[ -d "/Applications/Google Chrome.app" ]]; then echo "✓ chrome         /Applications/Google Chrome.app"; else echo "✗ chrome         missing"; failed=1; fi
if xcode-select -p >/dev/null 2>&1; then echo "✓ apple-vision   Xcode tools available"; else echo "○ apple-vision   optional Xcode tools missing"; fi
node -e 'const major=+process.versions.node.split(".")[0];if(major<18){console.error("✗ Node.js 18+ required");process.exit(1)}else console.log("✓ node-version   "+process.versions.node)' || failed=1
exit "$failed"
