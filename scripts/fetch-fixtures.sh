#!/usr/bin/env bash
# Saves real API responses used by tests/parsers.test.ts into tests/fixtures/.
set -u
cd "$(dirname "$0")/.."
OUT=tests/fixtures
mkdir -p "$OUT"
UA='mapc-compat (+https://github.com/dxoraxs/mapc-compat)'
IDS="292030 570 1172470 1245620 1091500"

for id in $IDS; do
  curl -sS -A "$UA" "https://store.steampowered.com/api/appdetails?appids=$id&cc=us&l=en" -o "$OUT/steam-$id.json"
  curl -sS -A "$UA" "https://www.applegamingwiki.com/w/api.php?action=query&list=search&srsearch=$id&srwhat=text&format=json&srlimit=5" -o "$OUT/agw-search-$id.json"
  page=$(jq -r '.query.search[0].pageid' "$OUT/agw-search-$id.json")
  curl -sS -A "$UA" "https://www.applegamingwiki.com/w/api.php?action=parse&pageid=$page&prop=wikitext&format=json" -o "$OUT/agw-page-$id.json"
  code=$(curl -sS -A "$UA" -w '%{http_code}' "https://www.protondb.com/api/v1/reports/summaries/$id.json" -o "$OUT/proton-$id.json")
  if [ "$code" = "404" ]; then mv "$OUT/proton-$id.json" "$OUT/proton-$id.404"; fi
done

curl -sS -A "$UA" "https://raw.githubusercontent.com/AreWeAntiCheatYet/AreWeAntiCheatYet/HEAD/games.json" \
  | jq -c '[.[] | select((.storeIds.steam // "" | tostring) as $s | ["292030","570","1172470","1245620","1091500","578080"] | index($s))]' > "$OUT/awacy-subset.json"

# Keep the repo free of U+2014: escape it inside the fetched JSON (same data, valid JSON).
for f in "$OUT"/*.json; do perl -i -pe 's/\xe2\x80\x94/\\u2014/g' "$f"; done
