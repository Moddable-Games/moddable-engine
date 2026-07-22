# RPG Character Sheet Spec

Universal character sheet renderer: one module, zero game knowledge, manifest-driven.

---

## Design principles

1. **Manifest declares everything** — the engine has no knowledge of any game system
2. **One renderer** — same module produces blank sheets and seeded characters
3. **SVG output** — same pipeline as board rendering; exportable, snapshotable, PDF-ready
4. **Section vocabulary** — a finite set of section types that compose to cover all 9 RPGs
5. **Source-format agnostic** — chargen block references JSON data files OR inline values; the renderer doesn't care where data came from
6. **Dual mode** — "blank" produces empty form fields; "seeded" rolls from tables and fills them

---

## Routing

Each RPG gets a second variant entry in `diagrams-manifest.json`:

```json
{
  "family": "cairn",
  "variant": "character-sheet",
  "variantTitle": "Character Sheet",
  "topology": "rpg",
  "reason": "rpg-chargen",
  "rulesUrl": "dist/cairn/index.html"
}
```

The play page handles `reason: "rpg-chargen"` and renders the character sheet.  
Mode toggle (blank/seeded) + seed input appear in the controls.

---

## Manifest schema: `chargen` block

Lives inside the existing `rpg-manifest.json` per game, alongside `categories`:

```json
{
  "label": "Cairn",
  "version": "2",
  "categories": [ ... ],
  "chargen": {
    "title": "Adventurer",
    "layout": "portrait",
    "sections": [ ... ],
    "tables": { ... }
  }
}
```

### Top-level fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Character type label (e.g. "Adventurer", "Ironsworn", "Player Character") |
| `layout` | `"portrait"` \| `"landscape"` | Page orientation for SVG/PDF (default: portrait) |
| `sections` | array | Ordered list of section definitions |
| `tables` | object | Named table references for seeded generation |

---

## Section types

### `header`

Character identity fields. Always renders at the top.

```json
{
  "type": "header",
  "fields": [
    { "id": "name", "label": "Name", "width": 2 },
    { "id": "background", "label": "Background", "gen": "backgrounds" },
    { "id": "level", "label": "Level", "default": "1" }
  ]
}
```

- `width`: relative column span (default 1; `2` = double width)
- `gen`: table reference for seeded mode (rolls from named table in `tables` block)
- `default`: value to pre-fill in blank mode

**Covers:** D&D (name/class/race/level/alignment), Cairn (name/background/age), Knave (name/background), BRP (name/profession/race/age), Dungeon World (name/class/race/look/alignment), Ironsworn/Starforged (name/callsign), Maze Rats (name/appearance)

---

### `stats`

Numeric attributes in a row or grid.

```json
{
  "type": "stats",
  "layout": "row",
  "stats": [
    { "label": "STR", "gen": "3d6" },
    { "label": "DEX", "gen": "3d6" },
    { "label": "WIL", "gen": "3d6" }
  ],
  "derived": [
    { "label": "Armor", "formula": "0", "editable": true }
  ]
}
```

- `layout`: `"row"` (horizontal, fits 3-7 stats) or `"grid"` (2-column, for many stats)
- `stats[].gen`: dice expression for seeded mode (e.g. `"3d6"`, `"2d6+6"`, `"4d6kh3"`)
- `stats[].range`: display hint for blank mode (e.g. `"1-3"` for Ironsworn, `"3-18"` for D&D)
- `stats[].secondaryLabel`: for systems with dual values (Knave: bonus + defense)
- `stats[].secondaryFormula`: derive secondary from primary (e.g. `"+10"` for Knave defense)
- `derived`: additional computed values shown below main stats

**System coverage:**

| System | Stats | Gen |
|--------|-------|-----|
| D&D 5e | STR DEX CON INT WIS CHA | 4d6kh3 |
| Pathfinder | STR DEX CON INT WIS CHA | 4d6kh3 |
| Dungeon World | STR DEX CON INT WIS CHA | assign 16/15/13/12/9/8 |
| Cairn | STR DEX WIL | 3d6 |
| Maze Rats | STR DEX Will | array lookup (1d6 → row) |
| Knave | STR DEX CON INT WIS CHA (bonus+defense) | 3d6kl1 (bonus), +10 (defense) |
| Ironsworn/Starforged | Edge Heart Iron Shadow Wits | assign 3/2/2/1/1 |
| BRP | STR CON SIZ INT POW DEX APP | 3d6 or 2d6+6 |

---

### `track`

A resource meter with fillable boxes/pips.

```json
{
  "type": "track",
  "label": "HP",
  "max": 6,
  "gen": "1d6",
  "style": "boxes"
}
```

- `max`: number of boxes/pips (can be a formula: `"class_hp + CON"`)
- `gen`: dice for seeded starting value
- `style`: `"boxes"` (fill/empty squares), `"numbered"` (0 to max with marker), `"pips"` (circles)
- `startValue`: initial fill level for blank mode (e.g. max for HP, 2 for momentum)
- `min`: minimum value if track goes negative (Ironsworn momentum: -6)

**System coverage:**

| System | Tracks |
|--------|--------|
| D&D 5e | HP, Hit Dice, Death Saves (3+3), Spell Slots (per level) |
| Pathfinder | HP, BAB |
| Cairn | HP (1d6), Armor (max 3), Gold, Fatigue (fills inventory) |
| Knave | HP (1d8) |
| Maze Rats | Health (starts 4), Spell Slots (0-1) |
| Ironsworn | Health (5), Spirit (5), Supply (5), Momentum (-6 to +10) |
| Starforged | Health (5), Spirit (5), Supply (5), Momentum (-6 to +10), Vehicle Integrity (5) |
| BRP | HP ((CON+SIZ)/2), Power Points (=POW) |
| Dungeon World | HP (class base + CON score) |

---

### `inventory`

Gear/item tracking with configurable slot model.

```json
{
  "type": "inventory",
  "label": "Gear",
  "model": "slots",
  "slots": 10,
  "gen": "starting-gear",
  "sections": [
    { "label": "Hands", "slots": 2 },
    { "label": "Belt", "slots": 2 },
    { "label": "Backpack", "slots": 6 }
  ]
}
```

- `model`: `"slots"` (numbered boxes), `"weight"` (items + total weight), `"abstract"` (just a notes area), `"location"` (named sub-sections)
- `slots`: total slot count (can be formula: `"CON_defense"` for Knave)
- `gen`: table reference for seeded starting gear
- `sections`: sub-areas for location-based systems (Maze Rats: hands/belt/backpack)
- `columns`: field columns per item (default: `["Item"]`; can add `"Weight"`, `"Slots"`, `"Uses"`)

**System coverage:**

| System | Model | Detail |
|--------|-------|--------|
| Cairn | slots | 10 fixed (backpack: 6 additional) |
| Knave | slots | = CON defense (11-16+) |
| Maze Rats | location | hands/belt/backpack |
| D&D 5e | weight | STR x 15 capacity |
| Pathfinder | weight | similar to D&D |
| Dungeon World | weight | Load = class base + STR mod |
| Ironsworn/Starforged | abstract | Supply track covers gear |
| BRP | abstract | narrative/profession-based |

---

### `list`

A list of entries — abilities, moves, bonds, spells, features. Flexible enough for any "list of text items" section.

```json
{
  "type": "list",
  "label": "Traits",
  "count": 8,
  "gen": "traits",
  "style": "lined"
}
```

- `count`: number of lines/slots to show
- `gen`: table reference for seeded values
- `style`: `"lined"` (blank lines), `"checkbox"` (checkbox + text), `"numbered"` (1, 2, 3...)
- `columns`: for multi-column trait blocks (e.g. Cairn/Knave: Physique, Face, Skin...)
- `editable`: boolean (default true for blank, false for seeded)

**Used for:**

| System | Lists |
|--------|-------|
| D&D 5e | Features, Proficiencies, Languages, Spells (per level) |
| Pathfinder | Feats, Class Features, Skills (with percentages) |
| Cairn | Traits (physique/skin/hair/face/etc.), Bonds, Scars |
| Knave | Traits (11 categories) |
| Maze Rats | Appearance, Personality, Background detail |
| Ironsworn | Bonds, Vows (with progress boxes) |
| Starforged | Legacy tracks, Impacts/Debilities, Assets |
| BRP | Skills (with base chance %), Profession |
| Dungeon World | Moves, Bonds, Alignment, Look |

---

### `progress`

A progress track — boxes that fill incrementally. Distinct from `track` because tracks are depletable resources; progress accumulates toward completion.

```json
{
  "type": "progress",
  "label": "Vows",
  "tracks": 4,
  "boxes": 10,
  "ranks": ["Troublesome", "Dangerous", "Formidable", "Extreme", "Epic"],
  "fields": ["title", "rank"]
}
```

- `tracks`: how many parallel progress tracks to show
- `boxes`: boxes per track (default 10, Ironsworn/Starforged standard)
- `ticks`: ticks per box (default 4, Ironsworn/Starforged standard)
- `ranks`: if present, each track has a rank selector
- `fields`: additional fields per track (title, rank, notes)

**Used for:**

| System | Progress |
|--------|----------|
| Ironsworn | Background Vow, Active Vows (troublesome→epic), Bonds |
| Starforged | Quests Legacy, Bonds Legacy, Discoveries Legacy, Active Vows |
| D&D 5e | XP (numeric, toward level thresholds) |
| Dungeon World | XP (mark on miss; 7+ = level up) |
| Others | Not used (no mechanical progression track) |

---

### `skills`

Percentage-based or proficiency-based skill listing. A specialized variant of `list` optimized for skill grids.

```json
{
  "type": "skills",
  "label": "Skills",
  "model": "percentile",
  "skills": [
    { "name": "Appraise", "base": 15 },
    { "name": "Art (various)", "base": 5 },
    { "name": "Climb", "base": 40 }
  ],
  "gen": "profession-skills"
}
```

- `model`: `"percentile"` (BRP: base + bonus = total %), `"proficiency"` (D&D/PF: trained/expert/untrained), `"modifier"` (DW: stat-based modifiers)
- `skills`: static skill list with base values (from JSON data)
- `gen`: table/profession that allocates points in seeded mode
- `columns`: `["Skill", "Base", "Bonus", "Total"]` for percentile; `["Skill", "Prof", "Mod"]` for proficiency

**System coverage:**

| System | Model | Count |
|--------|-------|-------|
| BRP | percentile | 56 skills |
| D&D 5e | proficiency | 18 skills |
| Pathfinder | proficiency | 35 skills |
| Dungeon World | — | (uses moves, not skills) |
| Others | — | (no skill system) |

---

### `notes`

Freeform text areas.

```json
{
  "type": "notes",
  "label": "Bonds & Scars",
  "lines": 4
}
```

- `lines`: height hint (number of lines in blank mode)
- `gen`: optional, for seeded narrative content

---

### `assets`

Card-style ability slots (Ironsworn/Starforged pattern). Each asset has upgradeable abilities.

```json
{
  "type": "assets",
  "label": "Assets",
  "count": 3,
  "abilities_per_asset": 3,
  "fields": ["name", "category"],
  "categories": ["Path", "Companion", "Command Vehicle", "Module", "Deed"]
}
```

- `count`: number of asset slots to show
- `abilities_per_asset`: checkboxes per asset card
- `fields`: what to show per asset
- `categories`: valid categories (informational, for blank sheet labelling)

**Used for:** Ironsworn (3 starting assets), Starforged (Starship + 3 assets)

---

### `choices`

A section for choosing from a fixed list (class, race, alignment). Renders as a highlighted selection or fill-in field depending on mode.

```json
{
  "type": "choices",
  "label": "Class",
  "source": "classes",
  "displayField": "name",
  "gen": "random"
}
```

- `source`: table reference (resolved from `tables` block)
- `displayField`: which field to show as the choice label
- `gen`: `"random"` picks one; omit for player choice (blank)
- `details`: additional fields to derive from the choice (e.g. class → hit die, damage)

**Used for:** D&D (class, race, background), Pathfinder (class, race), BRP (profession), Dungeon World (class, race, alignment), Cairn (background)

---

## Tables block

Named references to data files. The renderer fetches these and uses them for seeded generation.

```json
{
  "tables": {
    "backgrounds": {
      "source": "backgrounds.json",
      "arrayKey": "backgrounds",
      "rollField": null,
      "pickMethod": "random"
    },
    "traits": {
      "source": "npc-tables.json",
      "arrayKey": "tables",
      "pickMethod": "rollPerTable",
      "tables": ["Physique", "Face", "Skin", "Hair", "Clothing", "Virtue", "Vice", "Speech"]
    },
    "starting-gear": {
      "source": "starting-gear.json",
      "arrayKey": "tables",
      "pickMethod": "rollPerTable"
    },
    "profession-skills": {
      "source": "professions.json",
      "arrayKey": "tables[0].entries",
      "pickMethod": "random",
      "allocate": { "type": "points", "pool": 300, "fields": "skills" }
    }
  }
}
```

### Pick methods

| Method | Behaviour |
|--------|-----------|
| `random` | Pick one random entry from the array |
| `rollPerTable` | For multi-table sources: roll once per named table |
| `rollMultiple` | Roll N entries from a single table |
| `assign` | Use a fixed array (Ironsworn stats: 3,2,2,1,1) |
| `all` | Use all entries (for skill lists loaded wholesale) |

### Dice expressions

The renderer evaluates standard dice notation:
- `3d6` — sum of 3 six-sided dice
- `4d6kh3` — roll 4d6, keep highest 3
- `3d6kl1` — roll 3d6, keep lowest 1 (Knave bonus)
- `2d6+6` — sum + constant
- `1d6` — single die
- `2d20+10` — Cairn age

---

## Complete examples

### Cairn

```json
{
  "chargen": {
    "title": "Adventurer",
    "layout": "portrait",
    "sections": [
      {
        "type": "header",
        "fields": [
          { "id": "name", "label": "Name", "width": 2, "gen": "background-names" },
          { "id": "background", "label": "Background", "gen": "backgrounds" },
          { "id": "age", "label": "Age", "gen": "2d20+10" }
        ]
      },
      {
        "type": "stats",
        "layout": "row",
        "stats": [
          { "label": "STR", "gen": "3d6", "range": "3-18" },
          { "label": "DEX", "gen": "3d6", "range": "3-18" },
          { "label": "WIL", "gen": "3d6", "range": "3-18" }
        ]
      },
      {
        "type": "track",
        "label": "Hit Protection",
        "max": 6,
        "gen": "1d6",
        "style": "boxes"
      },
      {
        "type": "track",
        "label": "Armor",
        "max": 3,
        "style": "boxes"
      },
      {
        "type": "inventory",
        "label": "Inventory",
        "model": "slots",
        "slots": 10,
        "gen": "starting-gear",
        "sections": [
          { "label": "Hands", "slots": 2 },
          { "label": "Body", "slots": 2 },
          { "label": "Backpack", "slots": 6 }
        ]
      },
      {
        "type": "list",
        "label": "Traits",
        "gen": "traits",
        "style": "lined",
        "columns": ["Physique", "Skin", "Hair", "Face", "Speech", "Clothing", "Virtue", "Vice"]
      },
      {
        "type": "notes",
        "label": "Bonds",
        "lines": 2,
        "gen": "bonds"
      },
      {
        "type": "list",
        "label": "Spellbooks",
        "count": 2,
        "style": "lined"
      },
      {
        "type": "notes",
        "label": "Scars & Notes",
        "lines": 4
      }
    ],
    "tables": {
      "backgrounds": {
        "source": "backgrounds.json",
        "arrayKey": "backgrounds",
        "pickMethod": "random"
      },
      "background-names": {
        "source": "backgrounds.json",
        "arrayKey": "backgrounds[*].names",
        "pickMethod": "random",
        "dependsOn": "backgrounds"
      },
      "starting-gear": {
        "source": "backgrounds.json",
        "arrayKey": "backgrounds[*].starting_gear",
        "pickMethod": "all",
        "dependsOn": "backgrounds"
      },
      "traits": {
        "source": "npc-tables.json",
        "arrayKey": "tables",
        "pickMethod": "rollPerTable",
        "tables": ["Physique", "Skin", "Hair", "Face", "Speech", "Clothing", "Virtue", "Vice"]
      },
      "bonds": {
        "source": "npc-tables.json",
        "arrayKey": "tables",
        "pickMethod": "rollPerTable",
        "tables": ["Bonds"]
      }
    }
  }
}
```

### Ironsworn

```json
{
  "chargen": {
    "title": "Ironsworn",
    "layout": "portrait",
    "sections": [
      {
        "type": "header",
        "fields": [
          { "id": "name", "label": "Name", "width": 2 },
          { "id": "epithet", "label": "Epithet" }
        ]
      },
      {
        "type": "stats",
        "layout": "row",
        "stats": [
          { "label": "Edge", "range": "1-3" },
          { "label": "Heart", "range": "1-3" },
          { "label": "Iron", "range": "1-3" },
          { "label": "Shadow", "range": "1-3" },
          { "label": "Wits", "range": "1-3" }
        ],
        "gen": "assign",
        "genValues": [3, 2, 2, 1, 1]
      },
      {
        "type": "track",
        "label": "Health",
        "max": 5,
        "startValue": 5,
        "style": "numbered"
      },
      {
        "type": "track",
        "label": "Spirit",
        "max": 5,
        "startValue": 5,
        "style": "numbered"
      },
      {
        "type": "track",
        "label": "Supply",
        "max": 5,
        "startValue": 5,
        "style": "numbered"
      },
      {
        "type": "track",
        "label": "Momentum",
        "max": 10,
        "min": -6,
        "startValue": 2,
        "style": "numbered"
      },
      {
        "type": "progress",
        "label": "Vows",
        "tracks": 4,
        "boxes": 10,
        "ticks": 4,
        "ranks": ["Troublesome", "Dangerous", "Formidable", "Extreme", "Epic"],
        "fields": ["title", "rank"]
      },
      {
        "type": "progress",
        "label": "Bonds",
        "tracks": 1,
        "boxes": 10,
        "ticks": 4
      },
      {
        "type": "assets",
        "label": "Assets",
        "count": 3,
        "abilities_per_asset": 3
      },
      {
        "type": "list",
        "label": "Debilities",
        "style": "checkbox",
        "count": 8,
        "items": ["Wounded", "Shaken", "Unprepared", "Encumbered", "Maimed", "Corrupted", "Cursed", "Tormented"]
      },
      {
        "type": "notes",
        "label": "Equipment & Notes",
        "lines": 6
      }
    ],
    "tables": {}
  }
}
```

### Knave

```json
{
  "chargen": {
    "title": "Adventurer",
    "layout": "portrait",
    "sections": [
      {
        "type": "header",
        "fields": [
          { "id": "name", "label": "Name", "width": 2 },
          { "id": "background", "label": "Background", "gen": "traits-background" }
        ]
      },
      {
        "type": "stats",
        "layout": "row",
        "stats": [
          { "label": "STR", "gen": "3d6kl1", "secondaryLabel": "Def", "secondaryFormula": "+10" },
          { "label": "DEX", "gen": "3d6kl1", "secondaryLabel": "Def", "secondaryFormula": "+10" },
          { "label": "CON", "gen": "3d6kl1", "secondaryLabel": "Def", "secondaryFormula": "+10" },
          { "label": "INT", "gen": "3d6kl1", "secondaryLabel": "Def", "secondaryFormula": "+10" },
          { "label": "WIS", "gen": "3d6kl1", "secondaryLabel": "Def", "secondaryFormula": "+10" },
          { "label": "CHA", "gen": "3d6kl1", "secondaryLabel": "Def", "secondaryFormula": "+10" }
        ]
      },
      {
        "type": "track",
        "label": "HP",
        "max": 8,
        "gen": "1d8",
        "style": "boxes"
      },
      {
        "type": "inventory",
        "label": "Item Slots",
        "model": "slots",
        "slots": "CON_defense",
        "gen": "starting-gear",
        "columns": ["Item", "Slots"]
      },
      {
        "type": "list",
        "label": "Traits",
        "gen": "traits",
        "style": "lined",
        "columns": ["Physique", "Face", "Skin", "Hair", "Clothing", "Virtue", "Vice", "Speech", "Background", "Misfortune", "Alignment"]
      },
      {
        "type": "notes",
        "label": "Spells & Notes",
        "lines": 4
      }
    ],
    "tables": {
      "traits": {
        "source": "traits.json",
        "arrayKey": "tables",
        "pickMethod": "rollPerTable"
      },
      "traits-background": {
        "source": "traits.json",
        "arrayKey": "tables",
        "pickMethod": "rollPerTable",
        "tables": ["Background"]
      },
      "starting-gear": {
        "source": "starting-gear.json",
        "arrayKey": "tables",
        "pickMethod": "rollPerTable"
      }
    }
  }
}
```

### BRP

```json
{
  "chargen": {
    "title": "Investigator",
    "layout": "portrait",
    "sections": [
      {
        "type": "header",
        "fields": [
          { "id": "name", "label": "Name", "width": 2 },
          { "id": "profession", "label": "Profession", "gen": "professions" },
          { "id": "age", "label": "Age" },
          { "id": "gender", "label": "Gender" }
        ]
      },
      {
        "type": "stats",
        "layout": "grid",
        "stats": [
          { "label": "STR", "gen": "3d6", "range": "3-18" },
          { "label": "CON", "gen": "3d6", "range": "3-18" },
          { "label": "SIZ", "gen": "2d6+6", "range": "8-18" },
          { "label": "INT", "gen": "2d6+6", "range": "8-18" },
          { "label": "POW", "gen": "3d6", "range": "3-18" },
          { "label": "DEX", "gen": "3d6", "range": "3-18" },
          { "label": "APP", "gen": "3d6", "range": "3-18" }
        ],
        "derived": [
          { "label": "Effort", "formula": "STR*5", "suffix": "%" },
          { "label": "Stamina", "formula": "CON*5", "suffix": "%" },
          { "label": "Idea", "formula": "INT*5", "suffix": "%" },
          { "label": "Luck", "formula": "POW*5", "suffix": "%" },
          { "label": "Agility", "formula": "DEX*5", "suffix": "%" },
          { "label": "Charisma", "formula": "APP*5", "suffix": "%" },
          { "label": "Damage Bonus", "formula": "strSizTable" }
        ]
      },
      {
        "type": "track",
        "label": "Hit Points",
        "max": "(CON+SIZ)/2",
        "style": "boxes"
      },
      {
        "type": "track",
        "label": "Power Points",
        "max": "POW",
        "style": "boxes"
      },
      {
        "type": "skills",
        "label": "Skills",
        "model": "percentile",
        "source": "skills",
        "gen": "profession-skills",
        "columns": ["Skill", "Base", "Bonus", "Total"]
      },
      {
        "type": "inventory",
        "label": "Equipment",
        "model": "abstract",
        "lines": 8
      },
      {
        "type": "notes",
        "label": "Weapons & Armor",
        "lines": 4
      },
      {
        "type": "notes",
        "label": "Notes",
        "lines": 4
      }
    ],
    "tables": {
      "professions": {
        "source": "professions.json",
        "arrayKey": "tables[0].entries",
        "pickMethod": "random"
      },
      "skills": {
        "source": "skills.json",
        "arrayKey": "tables[0].entries",
        "pickMethod": "all"
      },
      "profession-skills": {
        "source": "professions.json",
        "arrayKey": "tables[0].entries",
        "pickMethod": "random",
        "allocate": { "type": "points", "pool": 300, "target": "skills" }
      }
    }
  }
}
```

### D&D 5e

```json
{
  "chargen": {
    "title": "Player Character",
    "layout": "portrait",
    "sections": [
      {
        "type": "header",
        "fields": [
          { "id": "name", "label": "Character Name", "width": 2 },
          { "id": "class", "label": "Class & Level", "gen": "classes" },
          { "id": "race", "label": "Race", "gen": "races" },
          { "id": "alignment", "label": "Alignment" },
          { "id": "background", "label": "Background" }
        ]
      },
      {
        "type": "stats",
        "layout": "row",
        "stats": [
          { "label": "STR", "gen": "4d6kh3", "range": "3-18", "modifier": true },
          { "label": "DEX", "gen": "4d6kh3", "range": "3-18", "modifier": true },
          { "label": "CON", "gen": "4d6kh3", "range": "3-18", "modifier": true },
          { "label": "INT", "gen": "4d6kh3", "range": "3-18", "modifier": true },
          { "label": "WIS", "gen": "4d6kh3", "range": "3-18", "modifier": true },
          { "label": "CHA", "gen": "4d6kh3", "range": "3-18", "modifier": true }
        ],
        "derived": [
          { "label": "Proficiency Bonus", "formula": "+2" },
          { "label": "AC", "formula": "10+DEX_mod", "editable": true },
          { "label": "Initiative", "formula": "DEX_mod" },
          { "label": "Speed", "formula": "30", "editable": true }
        ]
      },
      {
        "type": "track",
        "label": "Hit Points",
        "max": "class_hp+CON_mod",
        "style": "boxes"
      },
      {
        "type": "track",
        "label": "Hit Dice",
        "max": 1,
        "style": "boxes"
      },
      {
        "type": "track",
        "label": "Death Saves",
        "max": 3,
        "style": "boxes",
        "tracks": 2,
        "labels": ["Successes", "Failures"]
      },
      {
        "type": "skills",
        "label": "Skills",
        "model": "proficiency",
        "skills": [
          { "name": "Acrobatics", "stat": "DEX" },
          { "name": "Animal Handling", "stat": "WIS" },
          { "name": "Arcana", "stat": "INT" },
          { "name": "Athletics", "stat": "STR" },
          { "name": "Deception", "stat": "CHA" },
          { "name": "History", "stat": "INT" },
          { "name": "Insight", "stat": "WIS" },
          { "name": "Intimidation", "stat": "CHA" },
          { "name": "Investigation", "stat": "INT" },
          { "name": "Medicine", "stat": "WIS" },
          { "name": "Nature", "stat": "INT" },
          { "name": "Perception", "stat": "WIS" },
          { "name": "Performance", "stat": "CHA" },
          { "name": "Persuasion", "stat": "CHA" },
          { "name": "Religion", "stat": "INT" },
          { "name": "Sleight of Hand", "stat": "DEX" },
          { "name": "Stealth", "stat": "DEX" },
          { "name": "Survival", "stat": "WIS" }
        ],
        "columns": ["Prof", "Skill", "Mod"]
      },
      {
        "type": "list",
        "label": "Saving Throws",
        "style": "checkbox",
        "count": 6,
        "items": ["STR", "DEX", "CON", "INT", "WIS", "CHA"]
      },
      {
        "type": "inventory",
        "label": "Equipment",
        "model": "weight",
        "columns": ["Item", "Qty", "Weight"]
      },
      {
        "type": "list",
        "label": "Features & Traits",
        "count": 6,
        "style": "lined"
      },
      {
        "type": "notes",
        "label": "Spells & Abilities",
        "lines": 8
      }
    ],
    "tables": {
      "classes": {
        "source": "classes.json",
        "arrayKey": "classes",
        "displayField": "name",
        "pickMethod": "random"
      },
      "races": {
        "source": "races.json",
        "arrayKey": "races",
        "displayField": "name",
        "pickMethod": "random"
      }
    }
  }
}
```

### Maze Rats

```json
{
  "chargen": {
    "title": "Adventurer",
    "layout": "portrait",
    "sections": [
      {
        "type": "header",
        "fields": [
          { "id": "name", "label": "Name", "width": 2 },
          { "id": "appearance", "label": "Appearance", "gen": "appearance" }
        ]
      },
      {
        "type": "stats",
        "layout": "row",
        "stats": [
          { "label": "Strength", "range": "+0 to +4" },
          { "label": "Dexterity", "range": "+0 to +4" },
          { "label": "Will", "range": "+0 to +4" }
        ],
        "gen": "statArray",
        "genValues": [[2,1,0],[2,0,1],[1,2,0],[0,2,1],[1,0,2],[0,1,2]]
      },
      {
        "type": "track",
        "label": "Health",
        "max": 4,
        "startValue": 4,
        "style": "boxes"
      },
      {
        "type": "choices",
        "label": "Starting Feature",
        "options": [
          { "label": "Attack Bonus (+1 to attacks)" },
          { "label": "Spell Slot (1 spell/day)" },
          { "label": "Path: Briarborn (tracking, foraging, survival)" },
          { "label": "Path: Fingersmith (tinkering, picking locks/pockets)" },
          { "label": "Path: Roofrunner (climbing, leaping, balancing)" },
          { "label": "Path: Shadowjack (stealth, hiding in shadows)" }
        ],
        "gen": "random"
      },
      {
        "type": "inventory",
        "label": "Equipment",
        "model": "location",
        "gen": "starting-items",
        "sections": [
          { "label": "Hands", "slots": 2 },
          { "label": "Worn", "slots": 2 },
          { "label": "Belt", "slots": 2 },
          { "label": "Backpack", "slots": 6 }
        ]
      },
      {
        "type": "list",
        "label": "Traits",
        "gen": "traits",
        "style": "lined",
        "columns": ["Appearance", "Physical Detail", "Background", "Clothing", "Personality", "Mannerism"]
      },
      {
        "type": "notes",
        "label": "Spells & Notes",
        "lines": 4
      }
    ],
    "tables": {
      "appearance": {
        "source": "characters.json",
        "arrayKey": "tables",
        "pickMethod": "rollPerTable",
        "tables": ["Appearance"]
      },
      "traits": {
        "source": "characters.json",
        "arrayKey": "tables",
        "pickMethod": "rollPerTable",
        "tables": ["Appearance", "Physical Detail", "Background", "Clothing", "Personality", "Mannerism"]
      },
      "starting-items": {
        "source": "treasure-equipment.json",
        "arrayKey": "tables",
        "pickMethod": "rollMultiple",
        "count": 6
      },
      "statArray": {
        "pickMethod": "random",
        "inline": [[2,1,0],[2,0,1],[1,2,0],[0,2,1],[1,0,2],[0,1,2]]
      }
    }
  }
}
```

### Dungeon World

```json
{
  "chargen": {
    "title": "Adventurer",
    "layout": "portrait",
    "sections": [
      {
        "type": "header",
        "fields": [
          { "id": "name", "label": "Name", "width": 2 },
          { "id": "class", "label": "Class", "gen": "classes" },
          { "id": "race", "label": "Race" },
          { "id": "alignment", "label": "Alignment" },
          { "id": "look", "label": "Look" }
        ]
      },
      {
        "type": "stats",
        "layout": "row",
        "stats": [
          { "label": "STR", "range": "8-16", "modifier": true },
          { "label": "DEX", "range": "8-16", "modifier": true },
          { "label": "CON", "range": "8-16", "modifier": true },
          { "label": "INT", "range": "8-16", "modifier": true },
          { "label": "WIS", "range": "8-16", "modifier": true },
          { "label": "CHA", "range": "8-16", "modifier": true }
        ],
        "gen": "assign",
        "genValues": [16, 15, 13, 12, 9, 8]
      },
      {
        "type": "track",
        "label": "HP",
        "max": "class_hp+CON_score",
        "style": "boxes"
      },
      {
        "type": "track",
        "label": "XP",
        "max": "level+7",
        "style": "boxes"
      },
      {
        "type": "list",
        "label": "Starting Moves",
        "count": 6,
        "style": "lined"
      },
      {
        "type": "list",
        "label": "Bonds",
        "count": 4,
        "style": "lined"
      },
      {
        "type": "inventory",
        "label": "Gear",
        "model": "weight",
        "columns": ["Item", "Weight"],
        "maxLoad": "class_load+STR_mod"
      },
      {
        "type": "track",
        "label": "Armor",
        "max": 4,
        "style": "boxes"
      },
      {
        "type": "notes",
        "label": "Notes",
        "lines": 4
      }
    ],
    "tables": {
      "classes": {
        "source": "classes.json",
        "arrayKey": "classes",
        "displayField": "name",
        "pickMethod": "random"
      }
    }
  }
}
```

### Starforged

```json
{
  "chargen": {
    "title": "Spacer",
    "layout": "portrait",
    "sections": [
      {
        "type": "header",
        "fields": [
          { "id": "name", "label": "Name", "gen": "given-name" },
          { "id": "family", "label": "Family Name", "gen": "family-name" },
          { "id": "callsign", "label": "Callsign", "gen": "callsign" }
        ]
      },
      {
        "type": "stats",
        "layout": "row",
        "stats": [
          { "label": "Edge", "range": "1-3" },
          { "label": "Heart", "range": "1-3" },
          { "label": "Iron", "range": "1-3" },
          { "label": "Shadow", "range": "1-3" },
          { "label": "Wits", "range": "1-3" }
        ],
        "gen": "assign",
        "genValues": [3, 2, 2, 1, 1]
      },
      {
        "type": "track",
        "label": "Health",
        "max": 5,
        "startValue": 5,
        "style": "numbered"
      },
      {
        "type": "track",
        "label": "Spirit",
        "max": 5,
        "startValue": 5,
        "style": "numbered"
      },
      {
        "type": "track",
        "label": "Supply",
        "max": 5,
        "startValue": 5,
        "style": "numbered"
      },
      {
        "type": "track",
        "label": "Momentum",
        "max": 10,
        "min": -6,
        "startValue": 2,
        "style": "numbered"
      },
      {
        "type": "track",
        "label": "Vehicle Integrity",
        "max": 5,
        "startValue": 5,
        "style": "numbered"
      },
      {
        "type": "progress",
        "label": "Legacy: Quests",
        "tracks": 1,
        "boxes": 10,
        "ticks": 4
      },
      {
        "type": "progress",
        "label": "Legacy: Bonds",
        "tracks": 1,
        "boxes": 10,
        "ticks": 4
      },
      {
        "type": "progress",
        "label": "Legacy: Discoveries",
        "tracks": 1,
        "boxes": 10,
        "ticks": 4
      },
      {
        "type": "progress",
        "label": "Vows",
        "tracks": 3,
        "boxes": 10,
        "ticks": 4,
        "ranks": ["Troublesome", "Dangerous", "Formidable", "Extreme", "Epic"],
        "fields": ["title", "rank"]
      },
      {
        "type": "assets",
        "label": "Assets",
        "count": 4,
        "abilities_per_asset": 3,
        "categories": ["Starship", "Path", "Path", "Companion/Module"]
      },
      {
        "type": "list",
        "label": "Impacts",
        "style": "checkbox",
        "count": 10,
        "items": ["Wounded", "Shaken", "Unprepared", "Battered", "Cursed", "Permanently Harmed", "Traumatized", "Doomed", "Tormented", "Indebted"]
      },
      {
        "type": "notes",
        "label": "Notes & Connections",
        "lines": 4
      }
    ],
    "tables": {
      "given-name": {
        "source": "characters.json",
        "arrayKey": "tables",
        "pickMethod": "rollPerTable",
        "tables": ["Character Name — Given Name"]
      },
      "family-name": {
        "source": "characters.json",
        "arrayKey": "tables",
        "pickMethod": "rollPerTable",
        "tables": ["Character Name — Family Name"]
      },
      "callsign": {
        "source": "characters.json",
        "arrayKey": "tables",
        "pickMethod": "rollPerTable",
        "tables": ["Character Name — Callsign"]
      }
    }
  }
}
```

---

## Renderer architecture

### Location

`js/rpg-chargen.js` — single module, imported by play.js

### Interface

```js
export async function renderCharacterSheet(gameKey, { mode, seed }) {
  // mode: 'blank' | 'seeded'
  // seed: numeric seed for deterministic generation
}
```

### SVG generation

The renderer produces an SVG element (portrait A4 ratio: 210x297 units, or landscape 297x210).

Each section type has a render function:
- `renderHeader(section, values, y)` → SVG group
- `renderStats(section, values, y)` → SVG group
- `renderTrack(section, values, y)` → SVG group
- `renderInventory(section, values, y)` → SVG group
- `renderList(section, values, y)` → SVG group
- `renderProgress(section, values, y)` → SVG group
- `renderSkills(section, values, y)` → SVG group
- `renderNotes(section, values, y)` → SVG group
- `renderAssets(section, values, y)` → SVG group
- `renderChoices(section, values, y)` → SVG group

Each returns its height so the next section knows where to start.

### Blank mode

All fields render as empty boxes, lines, or placeholder text. This produces a printable form players can fill in by hand.

### Seeded mode

1. Parse the `chargen` block from the manifest
2. Initialize RNG with the provided seed
3. Resolve all `tables` references (fetch JSON from moddable-rules)
4. Resolve `dependsOn` chains (e.g. background-names depends on which background was rolled)
5. For each section, evaluate `gen` fields using dice roller + table picker
6. Render SVG with filled values

### Dice roller

```js
function rollDice(expr, rng) {
  // Supports: NdX, NdXkh/klN, NdX+C, NdX-C
  // rng: seeded PRNG (same as board studio uses)
}
```

### Export

Same as board studio: SVG element → downloadable SVG, or via canvas → PNG/PDF.

---

## Integration with moddable-rules PDFs

The PDF build system (`pdf-paginate.mjs`) already handles SVG page insertion. Character sheets slot in as:

1. **Blank appendix page** — build step fetches the chargen manifest, renders in blank mode, includes as final page(s) of the rulebook PDF
2. **Pre-generated character pack** — build step renders N seeded characters (seeds 1-6), outputs as standalone PDF or appendix section

The engine provides the SVG; moddable-rules build system handles pagination and PDF assembly.

---

## Implementation sequence

1. **Dice roller** — standalone utility (testable, no DOM)
2. **Section renderers** — one at a time: header → stats → track → inventory → list → progress → skills → notes → assets → choices
3. **Chargen orchestrator** — fetches manifest, resolves tables, seeds RNG, calls renderers
4. **Play page integration** — `reason: "rpg-chargen"` handler, mode toggle, seed input
5. **First game** — Cairn (simplest: 3 stats, slot inventory, table-heavy creation)
6. **Validate all 9** — author chargen blocks, test blank + seeded for each
7. **PDF integration** — wire into moddable-rules build pipeline

---

## Open questions

1. **Multi-page sheets** — D&D 5e and BRP character sheets historically span 2+ pages. Should the renderer support page breaks, or constrain to single page with font size reduction?
2. **Asset cards** — Ironsworn/Starforged assets are complex (3 abilities, conditions, controls). How much detail on the sheet vs. "see asset deck" reference?
3. **Class-conditional sections** — D&D spellcasters need spell slot tracking; non-casters don't. Support conditional sections (`"if": "class.spellcasting"`) or keep sheets class-agnostic?
4. **Companion/vehicle sub-sheets** — Starforged companions and vehicles have their own integrity meters. Inline on main sheet or separate?
5. **Styling** — one universal style (parchment/fantasy), or per-game theming (sci-fi for Starforged, dark for Maze Rats)? Manifest could declare a `theme` field.
