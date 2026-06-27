#!/usr/bin/env bash
set -euo pipefail

# --- Config ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$SCRIPT_DIR/scripts-src"
OUT_DIR="$SCRIPT_DIR/docs"
STATE_FILE="$SCRIPT_DIR/.build-state.json"
TODAY=$(date +%Y%m%d)

# --- Init ---
mkdir -p "$OUT_DIR"
touch "$OUT_DIR/.nojekyll"

# Load previous build state (or start empty)
if [[ -f "$STATE_FILE" ]]; then
  STATE=$(cat "$STATE_FILE")
else
  STATE="{}"
fi

# We'll accumulate package XML entries here
PACKAGES=""

# --- Process each script ---
for src in "$SRC_DIR"/*.js; do
  [[ -f "$src" ]] || continue

  filename=$(basename "$src")                  # AutoDBE.js
  name="${filename%.js}"                        # AutoDBE

  # Hash the source file to detect changes
  content_hash=$(shasum -a 256 "$src" | awk '{print $1}')

  # Check previous state
  prev_hash=$(echo "$STATE" | python3 -c "
import sys, json
s = json.load(sys.stdin)
print(s.get('$name', {}).get('content_hash', ''))" 2>/dev/null || echo "")

  prev_date=$(echo "$STATE" | python3 -c "
import sys, json
s = json.load(sys.stdin)
print(s.get('$name', {}).get('release_date', ''))" 2>/dev/null || echo "")

  prev_zip=$(echo "$STATE" | python3 -c "
import sys, json
s = json.load(sys.stdin)
print(s.get('$name', {}).get('zip_name', ''))" 2>/dev/null || echo "")

  if [[ "$content_hash" == "$prev_hash" && -f "$OUT_DIR/$prev_zip" ]]; then
    # Unchanged — reuse existing zip
    release_date="$prev_date"
    zip_name="$prev_zip"
    echo "  unchanged: $name (keeping $zip_name)"
  else
    # Changed or new — build fresh zip
    release_date="$TODAY"
    zip_name="${name}-${TODAY}.zip"

    # Remove old zip for this script if filename changed
    if [[ -n "$prev_zip" && "$prev_zip" != "$zip_name" && -f "$OUT_DIR/$prev_zip" ]]; then
      rm "$OUT_DIR/$prev_zip"
    fi

    # Stage the zip layout in a temp dir
    tmp=$(mktemp -d)
    mkdir -p "$tmp/src/scripts/Pixinsight-Fixes"
    cp "$src" "$tmp/src/scripts/Pixinsight-Fixes/$name.js"

    # Create zip (stored paths relative to tmp)
    (cd "$tmp" && zip -r "$OUT_DIR/$zip_name" src/)
    rm -rf "$tmp"

    echo "  built: $zip_name"
  fi

  # Compute SHA1 of the zip
  sha1=$(shasum -a 1 "$OUT_DIR/$zip_name" | awk '{print $1}')

  # Update state for this script
  STATE=$(echo "$STATE" | python3 -c "
import sys, json
s = json.load(sys.stdin)
s['$name'] = {
    'content_hash': '$content_hash',
    'release_date': '$release_date',
    'zip_name': '$zip_name',
    'sha1': '$sha1'
}
json.dump(s, sys.stdout, indent=2)")

  # Accumulate the package XML
  PACKAGES="$PACKAGES
    <package fileName=\"$zip_name\"
             sha1=\"$sha1\"
             type=\"script\"
             releaseDate=\"$release_date\">
      <title>$name</title>
      <description><p>Custom/ported script for PixInsight 1.9.4 (V8).</p></description>
    </package>"
done

# --- Process each multi-file script (directories) ---
for dir in "$SRC_DIR"/*/; do
  [[ -d "$dir" ]] || continue

  name=$(basename "$dir")

  # Hash all source files in the directory to detect changes
  content_hash=$(find "$dir" -type f -not -name '.DS_Store' | sort | xargs cat | shasum -a 256 | awk '{print $1}')

  # Check previous state
  prev_hash=$(echo "$STATE" | python3 -c "
import sys, json
s = json.load(sys.stdin)
print(s.get('$name', {}).get('content_hash', ''))" 2>/dev/null || echo "")

  prev_date=$(echo "$STATE" | python3 -c "
import sys, json
s = json.load(sys.stdin)
print(s.get('$name', {}).get('release_date', ''))" 2>/dev/null || echo "")

  prev_zip=$(echo "$STATE" | python3 -c "
import sys, json
s = json.load(sys.stdin)
print(s.get('$name', {}).get('zip_name', ''))" 2>/dev/null || echo "")

  if [[ "$content_hash" == "$prev_hash" && -f "$OUT_DIR/$prev_zip" ]]; then
    release_date="$prev_date"
    zip_name="$prev_zip"
    echo "  unchanged: $name (keeping $zip_name)"
  else
    release_date="$TODAY"
    zip_name="${name}-${TODAY}.zip"

    if [[ -n "$prev_zip" && "$prev_zip" != "$zip_name" && -f "$OUT_DIR/$prev_zip" ]]; then
      rm "$OUT_DIR/$prev_zip"
    fi

    # Stage the zip layout — copy entire directory tree
    tmp=$(mktemp -d)
    mkdir -p "$tmp/src/scripts/Pixinsight-Fixes"
    rsync -a --exclude '.DS_Store' "$dir" "$tmp/src/scripts/Pixinsight-Fixes/$name/"

    (cd "$tmp" && zip -r "$OUT_DIR/$zip_name" src/)
    rm -rf "$tmp"

    echo "  built: $zip_name"
  fi

  sha1=$(shasum -a 1 "$OUT_DIR/$zip_name" | awk '{print $1}')

  STATE=$(echo "$STATE" | python3 -c "
import sys, json
s = json.load(sys.stdin)
s['$name'] = {
    'content_hash': '$content_hash',
    'release_date': '$release_date',
    'zip_name': '$zip_name',
    'sha1': '$sha1'
}
json.dump(s, sys.stdout, indent=2)")

  PACKAGES="$PACKAGES
    <package fileName=\"$zip_name\"
             sha1=\"$sha1\"
             type=\"script\"
             releaseDate=\"$release_date\">
      <title>$name</title>
      <description><p>Custom/ported script for PixInsight 1.9.4 (V8).</p></description>
    </package>"
done

# --- Write updates.xri ---
cat > "$OUT_DIR/updates.xri" <<XMLEOF
<?xml version="1.0" encoding="UTF-8"?>
<xri version="1.0">
  <description><p>Brian Carter — PixInsight script fixes/ports.</p></description>
  <platform os="all" arch="noarch" version="1.8.9:1.9.9">$PACKAGES
  </platform>
</xri>
XMLEOF

# --- Save build state ---
echo "$STATE" > "$STATE_FILE"

echo ""
echo "Build complete. Output in: $OUT_DIR/"
echo "  updates.xri + $(ls "$OUT_DIR"/*.zip 2>/dev/null | wc -l | tr -d ' ') zip(s)"
