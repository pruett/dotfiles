# Read and edit packages/bundle (the Brewfile). An entry is one `tap`, `brew`, `cask` or `npm`
# line plus the comment lines right above it (the package's description).
# Entries keep their order: a new one goes before the first entry of its kind
# whose name sorts after it, comparing names without their tap prefix.

# The tap part of a tapped name: anomalyco/tap/hex -> anomalyco/tap.
tap_of() {
  local name="$1"
  [[ "$name" == */*/* ]] && printf '%s\n' "${name%/*}"
  return 0
}

# brewfile_has <kind> <name>
brewfile_has() {
  grep -q "^$1 \"$2\"" "$brewfile"
}

# brewfile_find <name>: print "<kind> <full name>" for the entry matching name,
# either the full name or the name without its tap (hex finds anomalyco/tap/hex).
brewfile_find() {
  awk -v want="$1" '
    $1 ~ /^(brew|cask|npm)$/ {
      split($0, q, "\""); name = q[2]; n = split(name, p, "/")
      if (name == want || p[n] == want) { print $1, name; exit }
    }' "$brewfile"
}

# brewfile_insert <kind> <name> <block>: insert block (lines ending in a
# newline) as a new entry, in order among entries of its kind.
brewfile_insert() {
  local kind="$1" name="$2" where tmp
  where="$(awk -v kind="$kind" -v key="$name" '
    function sortkey(s,   n, p) {
      if (kind == "tap") return tolower(s)
      n = split(s, p, "/"); return tolower(p[n])
    }
    BEGIN { key = sortkey(key) }
    /^#/ { if (!comment) comment = NR; next }
    {
      start = comment ? comment : NR; comment = 0
      if ($1 != kind) next
      split($0, q, "\""); last = NR
      if (!found && sortkey(q[2]) > key) found = start
    }
    END { if (found) print "before", found; else if (last) print "after", last; else print "end", 0 }
  ' "$brewfile")"
  tmp="$(mktemp)"
  BLOCK="$3" awk -v where="${where% *}" -v at="${where#* }" '
    where == "before" && NR == at { printf "%s", ENVIRON["BLOCK"] }
    { print }
    where == "after" && NR == at { printf "%s", ENVIRON["BLOCK"] }
    END { if (where == "end") printf "%s", ENVIRON["BLOCK"] }
  ' "$brewfile" >"$tmp" && cat "$tmp" >"$brewfile"
  rm -f "$tmp"
}

# brewfile_remove <kind> <name>: delete the entry line and the comment lines
# right above it.
brewfile_remove() {
  local tmp
  tmp="$(mktemp)"
  awk -v line="$1 \"$2\"" '
    /^#/ { held = held $0 "\n"; next }
    index($0, line) == 1 && (length($0) == length(line) || substr($0, length(line) + 1, 1) == ",") { held = ""; next }
    { printf "%s", held; held = ""; print }
    END { printf "%s", held }
  ' "$brewfile" >"$tmp" && cat "$tmp" >"$brewfile"
  rm -f "$tmp"
}

# The one-line description Homebrew has for a package, or nothing.
brew_description() {
  local kind="$1" name="$2"
  brew info --json=v2 "--$( [[ "$kind" == cask ]] && echo cask || echo formula )" "$name" 2>/dev/null \
    | /usr/bin/python3 -c 'import json, sys
d = json.load(sys.stdin)
items = d.get("casks") or d.get("formulae") or [{}]
print((items[0].get("desc") or "").strip())' 2>/dev/null || true
}

brew_installed() {
  local kind="$1" name="$2"
  if [[ "$kind" == cask ]]; then
    brew list --cask "${name##*/}" >/dev/null 2>&1
  else
    brew list --formula "${name##*/}" >/dev/null 2>&1
  fi
}
