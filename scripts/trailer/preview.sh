#!/bin/sh
# preview.sh <shotId> [every=8] [cols=4]: render preview frames at 1x and build one contact sheet.
# Output: $TRAILER_TMP/<id>/sheet.png
set -e
ID=$1; EVERY=${2:-8}; COLS=${3:-4}
T=${TRAILER_TMP:-/c/Users/Bhagath/AppData/Local/Temp/tr}/$ID
rm -rf "$T"; mkdir -p "$T"
node scripts/trailer/record.mjs "$ID" --scale 1 --every "$EVERY" --out "$T" | tail -${TAILN:-30}
python3 scripts/trailer/sheet.py "$T/sheet.png" "$COLS" $(ls "$T"/*.png | grep -v sheet.png | sort | head -${MAXF:-16})
echo "$T/sheet.png"
