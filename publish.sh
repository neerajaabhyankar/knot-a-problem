#!/usr/bin/env bash
#
# Build the editor into the blog's Jekyll source, at the path it is served from.
# After this, publish the blog the way you always do:
#
#     cd ~/Repos/minimal-mistakes-wlog
#     bundle exec jekyll build
#     cp -r _site/ ../wlog-the-blog/
#     # commit the diff in wlog-the-blog
#
# Override the blog location with SITE=... if it ever moves.

set -euo pipefail

SITE="${SITE:-$HOME/Repos/minimal-mistakes-wlog}"
SLUG="knot-and-link-editor"
DEST="$SITE/$SLUG"

# Refuse to touch anything that isn't obviously the Jekyll source, because the
# next thing this script does is delete a directory.
if [[ ! -f "$SITE/_config.yml" ]]; then
  echo "not a Jekyll site: $SITE (no _config.yml)" >&2
  echo "set SITE=/path/to/minimal-mistakes-wlog if it has moved" >&2
  exit 1
fi

cd "$(dirname "$0")/editor"
npm run build

# Replace rather than merge: Vite fingerprints its filenames, so merging would
# pile up every asset from every previous build.
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R dist/. "$DEST/"

echo
echo "built into $DEST"
echo "  $(find "$DEST" -type f | wc -l | tr -d ' ') files, $(du -sh "$DEST" | cut -f1)"
echo
echo "next:  cd $SITE && bundle exec jekyll build && cp -r _site/ ../wlog-the-blog/"
echo "then:  commit the diff in wlog-the-blog"
