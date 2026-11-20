#!/usr/bin/env bash
# Downloads the source data used to generate public/data/*.json.
# The generated files are committed, so this is only needed to regenerate them.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data-src
cd data-src

# EJDict-hand (CC0 1.0) — https://github.com/kujirahand/EJDict
EJDICT_REV=2dd9e71ffcefce89b4d946ce07bf51fa0573aac0
# wikipedia-word-frequency (MIT) — https://github.com/IlyaSemenov/wikipedia-word-frequency
WWF_REV=d11c4fab211156e96ab5943850dd6f98604707fb

fetch() { # dir url rev
  if [ ! -d "$1" ]; then git clone --filter=blob:none "$2" "$1"; fi
  git -C "$1" fetch --depth 1 origin "$3" 2>/dev/null || true
  git -C "$1" checkout -q "$3"
}
fetch EJDict https://github.com/kujirahand/EJDict.git "$EJDICT_REV"
fetch wwf https://github.com/IlyaSemenov/wikipedia-word-frequency.git "$WWF_REV"
echo "done: data-src/EJDict, data-src/wwf"
