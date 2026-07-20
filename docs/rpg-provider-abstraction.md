# RPG Provider Abstraction Spec

## Problem

`js/rpg-provider.js` contains hardcoded game knowledge. Adding a new RPG
requires editing engine source code: configs, colours, card renderers, link
functions. This violates provider-declares-everything.

## Goal

A new RPG added to moddable-rules displays in the engine with zero engine
code changes. All game knowledge lives in a manifest file authored in
moddable-rules alongside the game's data.

---

## Manifest location and discovery

Each RPG game in moddable-rules authors:

```
games/{family}/rpg-manifest.json
```

The engine discovers RPG games the same way it discovers board games: via
`diagrams-manifest.json`. Entries with `"reason": "rpg-provider"` already
exist. The engine fetches `games/{family}/rpg-manifest.json` at runtime
when that game is selected.

---

## Manifest schema

```json
{
  "label": "Starforged",
  "dataPath": "games/starforged/oracles/",
  "rulesUrl": "dist/starforged/rules/oracles/",
  "dataType": "oracle",
  "categories": [
    {
      "id": "core",
      "label": "Core",
      "file": "core.json",
      "color": "#5dade2",
      "linkPath": null
    },
    {
      "id": "characters",
      "label": "Characters",
      "file": "characters.json",
      "color": "#58d68d",
      "linkPath": null
    }
  ],
  "cardFields": {
    "title": "result",
    "meta": "{_tableName} · Roll: {range}",
    "description": "description"
  }
}
```

For D&D (entity-based, not oracle-based):

```json
{
  "label": "D&D 5e SRD",
  "dataPath": "games/dnd-5e/data/",
  "rulesUrl": "dist/dnd-5e/",
  "dataType": "entity",
  "categories": [
    {
      "id": "spells",
      "label": "Spells",
      "file": "spells.json",
      "color": "#7b5ea7",
      "searchFields": ["name", "school.name"],
      "tag": { "field": "level", "prefix": "Lvl " },
      "linkPath": "spells/{level|levelSlug}/"
    },
    {
      "id": "monsters",
      "label": "Monsters",
      "file": "monsters.json",
      "color": "#c0392b",
      "searchFields": ["name", "type"],
      "tag": { "field": "challenge_rating", "prefix": "CR " },
      "linkPath": "monsters/{name|alphaGroup}/"
    },
    {
      "id": "classes",
      "label": "Classes",
      "file": "classes.json",
      "color": "#2980b9",
      "searchFields": ["name"],
      "linkPath": "classes/{name|kebabCase}/"
    },
    {
      "id": "equipment",
      "label": "Equipment",
      "file": "equipment.json",
      "color": "#7f8c8d",
      "searchFields": ["name", "equipment_category.name"],
      "tag": { "field": "equipment_category.name" },
      "linkPath": null
    },
    {
      "id": "magic-items",
      "label": "Magic Items",
      "file": "magic-items.json",
      "color": "#d4ac0d",
      "searchFields": ["name"],
      "tag": { "field": "rarity.name" },
      "linkPath": "magic-items/{name|alphaGroup}/"
    },
    {
      "id": "races",
      "label": "Races",
      "file": "races.json",
      "color": "#27ae60",
      "searchFields": ["name"],
      "linkPath": "rules/races/"
    },
    {
      "id": "conditions",
      "label": "Conditions",
      "file": "conditions.json",
      "color": "#e67e22",
      "searchFields": ["name"],
      "linkPath": "rules/conditions/"
    }
  ],
  "cardFields": {
    "spells": {
      "title": "name",
      "meta": ["Level {level} {school.name}", "{casting_time} · {range} · {duration}"],
      "tags": "components",
      "description": "desc[0]"
    },
    "monsters": {
      "title": "name",
      "meta": ["{size} {type}, {alignment}", "AC {armor_class[0].value} · HP {hit_points} · CR {challenge_rating}"],
      "stats": "STR {strength} DEX {dexterity} CON {constitution} INT {intelligence} WIS {wisdom} CHA {charisma}",
      "description": null
    },
    "classes": {
      "title": "name",
      "meta": ["Hit Die: d{hit_die}"],
      "description": null
    },
    "equipment": {
      "title": "name",
      "meta": ["{equipment_category.name}", "{cost.quantity} {cost.unit}"],
      "description": "desc[0]"
    },
    "magic-items": {
      "title": "name",
      "meta": ["{rarity.name}"],
      "description": "desc[0]"
    },
    "races": {
      "title": "name",
      "meta": ["Speed: {speed} ft"],
      "description": "size_description"
    },
    "conditions": {
      "title": "name",
      "meta": [],
      "description": "desc[0]"
    }
  }
}
```

---

## Field syntax

Card field templates use `{fieldPath}` interpolation:

- `{name}` — top-level field
- `{school.name}` — nested field
- `{armor_class[0].value}` — array index + nested
- `{desc[0]}` — first element of array
- `{level|levelSlug}` — field value piped through a transform
- `{name|alphaGroup}` — first character bucketed into alpha range
- `{_tableName}` — injected runtime field (oracle table name)
- `{range}` — injected runtime field (min-max string for oracles)

Literal text outside braces is kept verbatim:
`"Level {level} {school.name}"` → `"Level 3 Evocation"`

---

## Built-in transforms

The engine ships these transforms (small, finite set):

| Transform | Input | Output |
|-----------|-------|--------|
| `levelSlug` | `0` → `cantrips`, `3` → `level-3` | Spell level URL path |
| `alphaGroup` | `"Goblin"` → `g-i` | Alpha bucket for URL |
| `kebabCase` | `"Magic Missile"` → `magic-missile` | URL-safe slug |
| `lowercase` | `"Fighter"` → `fighter` | Lowercase |

New transforms require an engine code change — but the set is intentionally
tiny and general-purpose. Game-specific URL logic is eliminated.

---

## Link resolution

Each category optionally declares `linkPath`. The full URL is:

```
{RULES_BASE}/dist/{rulesUrl}/{linkPath}
```

Where `linkPath` fields are interpolated from the item being linked.
If `linkPath` is `null`, no link is shown on that category's cards.

---

## Data types

### `"dataType": "oracle"`

- File contains `{ "tables": [{ "id", "name", "entries": [{ "min", "max", "result" }] }] }`
- Entries are flattened across all tables in the file
- Search matches against `result` field
- Card renders range + result + table name
- `cardFields` applies uniformly to all categories

### `"dataType": "entity"`

- File contains a JSON array of objects (arbitrary shape)
- Each category declares its own `searchFields` and `tag`
- `cardFields` is per-category (keyed by category ID)
- Card renders from the declared field templates

---

## Colour derivation

Each category declares a single `color` (hex accent). The engine derives:
- `bg`: accent at 12% opacity
- `border`: accent at 35% opacity

No need to declare bg/border separately. The engine computes them from
the accent value using a single function.

---

## Implementation script

### Step 1: Author manifests in moddable-rules (manual frontmatter)

Create these three files by hand:

```
games/dnd-5e/rpg-manifest.json
games/ironsworn/rpg-manifest.json
games/starforged/rpg-manifest.json
```

Each manifest is authored directly from the schema above. The data is:
- For D&D: transcribe from the current `RPG_CONFIGS['dnd-5e']` + `renderDndCard` logic
- For Ironsworn: transcribe from `RPG_CONFIGS['ironsworn']`
- For Starforged: transcribe from `RPG_CONFIGS['starforged']`

This is a 1:1 translation of what's currently hardcoded into declarative JSON.
No invention, no new data — copy what exists into the manifest format.

### Step 2: Write the manifest loader in the engine

New file: `js/rpg-manifest-loader.js`

```js
export async function loadRpgManifest(gameKey, basePath) {
  const url = `${basePath}games/${gameKey}/rpg-manifest.json`
  const resp = await fetch(url)
  if (!resp.ok) return null
  return resp.json()
}
```

### Step 3: Write the generic card renderer

New file: `js/rpg-card-renderer.js`

Single function: `renderCard(item, category, manifest)` that:
1. Looks up `cardFields` (per-category for entities, global for oracles)
2. Interpolates each template string with item fields
3. Returns HTML string

Implements the field interpolation parser (brace extraction + transform
application). This is ~40 lines of code.

### Step 4: Write the generic link resolver

New file: `js/rpg-link-resolver.js`

Single function: `resolveLink(item, category, manifest, rulesBase)` that:
1. Returns `null` if category has no `linkPath`
2. Interpolates `linkPath` template with item fields + transforms
3. Prepends `{rulesBase}/dist/{manifest.rulesUrl}/`

### Step 5: Derive colours from accent

Replace the `CAT_COLORS` object with a function:

```js
function deriveColors(hex) {
  return {
    accent: hex,
    bg: `${hex}1f`,       // 12% opacity
    border: `${hex}59`,   // 35% opacity
  }
}
```

### Step 6: Rewrite rpg-provider.js

The rewritten provider:
1. Receives `gameKey` from play.js (unchanged)
2. Calls `loadRpgManifest(gameKey, RULES_BASE)` to fetch the manifest
3. Builds category buttons from `manifest.categories`
4. Loads data files from `manifest.dataPath + cat.file`
5. Renders results using `renderCard(item, cat, manifest)`
6. Generates links using `resolveLink(item, cat, manifest, RULES_BASE)`

Zero game names in the file. Zero data-shape knowledge.
The file becomes ~150 lines of generic UI code.

### Step 7: Delete dead code

Remove from `js/rpg-provider.js`:
- `RPG_CONFIGS` object
- `CAT_COLORS` object
- `getItemLink` function
- `renderDndCard` function
- `renderIronswornCard` function
- `renderStarforgedCard` function

### Step 8: Verify parity

For each game, visually compare:
- Category buttons render with correct labels and colours
- Card content matches current output (same fields, same layout)
- Links resolve to correct URLs (test D&D deep links especially)
- Search works across all categories
- "Showing X of Y" hint appears when browsing
- Table (card collector) still works

---

## What lives where after this

| Concern | Location | Authored by |
|---------|----------|-------------|
| Which RPGs exist | `diagrams-manifest.json` | moddable-rules |
| Category list, colours, data paths | `games/{family}/rpg-manifest.json` | moddable-rules |
| Card field templates | `games/{family}/rpg-manifest.json` | moddable-rules |
| Link path templates | `games/{family}/rpg-manifest.json` | moddable-rules |
| Oracle / entity data | `games/{family}/data/` or `oracles/` | moddable-rules |
| Generic RPG renderer | `js/rpg-provider.js` | moddable-engine |
| Field interpolation | `js/rpg-card-renderer.js` | moddable-engine |
| Link resolution | `js/rpg-link-resolver.js` | moddable-engine |
| Colour derivation | `js/rpg-provider.js` (inline) | moddable-engine |

---

## What does NOT happen

- No dynamic code execution from manifests (no eval, no function strings)
- No "generic transform registry" that grows unbounded — fixed set of 4
- No intermediate abstraction layers — manifest → renderer, nothing between
- No over-engineering: if a card field template can't express something,
  the answer is "simplify the card", not "add a turing-complete template DSL"
- No hiding work: manifests are authored by hand from existing data. The
  work is transcription, not generation. There is no script that auto-derives
  manifests from data shapes.

---

## Risks and constraints

- D&D has the most complex card rendering (6 different layouts by category).
  The per-category `cardFields` handles this cleanly — each category declares
  its own field mapping.
- Array indexing (`desc[0]`, `armor_class[0].value`) adds parser complexity.
  Cap at one level of indexing — no `foo[0].bar[1].baz`.
- If a future RPG needs a transform not in the built-in set, that's a
  one-line engine addition. Keep the set small and general.
- The `_tableName` and `range` fields for oracles are injected at runtime
  by the loader — they don't exist in the source data. Document this clearly
  in the manifest schema.
