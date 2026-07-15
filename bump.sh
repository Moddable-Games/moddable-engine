#!/bin/bash
# Bump version and propagate to all CSS/JS query strings + OG image URLs.
# Usage: ./bump.sh [major|minor|patch]  (default: patch)

set -e

LEVEL="${1:-patch}"
CURRENT=$(cat version.txt | tr -d '[:space:]')

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$LEVEL" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
  *) echo "Usage: $0 [major|minor|patch]"; exit 1 ;;
esac

NEW="$MAJOR.$MINOR.$PATCH"
echo "$NEW" > version.txt

find . -name "*.html" -not -path "./node_modules/*" -not -path "./packages/*" | while read -r file; do
  sed -i '' "s/\?v=$CURRENT/?v=$NEW/g" "$file"
  sed -i '' "s/>v$CURRENT</>v$NEW</g" "$file"
done

sed -i '' "s/\?v=$CURRENT/?v=$NEW/g" sitemap.xml 2>/dev/null || true

echo "Bumped $CURRENT → $NEW"
