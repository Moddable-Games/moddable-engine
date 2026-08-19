// Declarative rule options for the create page, per family.
//
// Every key below is read by its plugin as `config.<key>`, verified by
// __tests__/create-rules-consumed.test.js. That test is the point of this
// file: engine#68's failure mode is config that is declared, looks configured,
// and is never consumed, which produces a board that plays a different game
// from the one the form describes without ever erroring.
//
// Rules that exist only as JavaScript functions (chess `winCondition`, three-
// check's `initState`, go's scoring hooks) are deliberately absent. They are
// not expressible as frontmatter today, which is what engine#88 is about.

export const FAMILY_RULES = {
  chess: [
    { key: 'royalType', label: 'Royal piece', type: 'select', default: 'king',
      options: [
        { value: 'king', label: 'King — check and checkmate' },
        { value: 'none', label: 'None — no royal, no check' },
      ],
      hint: 'With no royal there is nothing to checkmate; the game ends on stalemate or the 50-move rule.' },
    { key: 'stalemateMeaning', label: 'Stalemate', type: 'select', default: 'draw',
      options: [
        { value: 'draw', label: 'Draw' },
        { value: 'win', label: 'Stalemated player wins' },
        { value: 'loss', label: 'Stalemated player loses' },
      ] },
    { key: 'castling', label: 'Castling', type: 'bool', default: true },
    { key: 'enPassant', label: 'En passant', type: 'bool', default: true },
    { key: 'doubleStep', label: 'Pawn double step', type: 'bool', default: true },
    { key: 'torpedo', label: 'Torpedo pawns (double step anywhere)', type: 'bool', default: false },
    { key: 'drops', label: 'Drops from hand (crazyhouse)', type: 'bool', default: false },
    { key: 'checkThreshold', label: 'Checks to win', type: 'number', default: 0, min: 0, max: 10,
      hint: 'Above zero the game is won by delivering that many checks (three-check, five-check).' },
    { key: 'promotionChoices', label: 'Promotion choices', type: 'list', default: [],
      hint: 'Piece types a pawn can promote to, comma-separated (e.g. queen, rook, bishop, knight).' },
  ],
  shogi: [
    { key: 'royalType', label: 'Royal piece', type: 'select', default: 'king',
      options: [
        { value: 'king', label: 'King — check and checkmate' },
        { value: 'none', label: 'None — no royal' },
      ] },
    { key: 'captureRule', label: 'Capture', type: 'select', default: 'displacement',
      options: [
        { value: 'displacement', label: 'Displacement — move onto the piece' },
        { value: 'custodian', label: 'Custodian — flank on two opposite sides' },
      ],
      hint: 'Custodian plus "reduced to one" is the hasami-shogi shape.' },
    { key: 'winCondition', label: 'Win condition', type: 'select', default: '',
      options: [
        { value: '', label: 'Checkmate (default)' },
        { value: 'reduced-to-one', label: 'Opponent reduced to one piece' },
      ] },
    { key: 'drops', label: 'Drops from hand', type: 'bool', default: true },
    { key: 'promotionZone', label: 'Promotion zone depth', type: 'number', default: 3, min: 0, max: 9 },
    { key: 'dropCheckmateLimit', label: 'Cannot checkmate with a drop', type: 'bool', default: true },
    { key: 'nifuType', label: 'Two-per-file piece', type: 'text', default: 'pawn',
      hint: 'Piece type subject to the nifu (two-in-file) drop restriction.' },
    { key: 'nifuLimit', label: 'Max per file', type: 'number', default: 1, min: 1, max: 5 },
    { key: 'noDropLastRank', label: 'No-drop last rank', type: 'list', default: ['pawn', 'lance'],
      hint: 'Piece types that cannot be dropped on the last rank, comma-separated.' },
    { key: 'noDropSecondRank', label: 'No-drop second rank', type: 'list', default: ['knight'],
      hint: 'Piece types that cannot be dropped on the second-to-last rank.' },
  ],
  go: [
    { key: 'komi', label: 'Komi', type: 'number', default: 6.5, min: 0, max: 20, step: 0.5 },
    { key: 'scoring', label: 'Scoring', type: 'select', default: 'territory',
      options: [
        { value: 'territory', label: 'Territory (Japanese)' },
        { value: 'area', label: 'Area (Chinese)' },
      ] },
    { key: 'captureTarget', label: 'Capture to win', type: 'number', default: 0, min: 0, max: 50,
      hint: 'Above zero this becomes atari go: first to capture that many stones wins.' },
    { key: 'suicideAllowed', label: 'Allow suicide', type: 'bool', default: false },
    { key: 'superko', label: 'Superko (positional)', type: 'bool', default: false },
    { key: 'allowPass', label: 'Allow pass', type: 'bool', default: true },
  ],
  draughts: [
    { key: 'piecesPerPlayer', label: 'Pieces per player', type: 'number', default: 12, min: 1, max: 50 },
    { key: 'directions', label: 'Movement directions', type: 'select', default: 'diagonal',
      options: [
        { value: 'diagonal', label: 'Diagonal' },
        { value: 'orthogonal', label: 'Orthogonal (Turkish)' },
        { value: 'all', label: 'All 8 directions (Frisian)' },
      ] },
    { key: 'manMove', label: 'Man movement', type: 'select', default: 'forward',
      options: [
        { value: 'forward', label: 'Forward only' },
        { value: 'all', label: 'Any direction' },
      ] },
    { key: 'manCapture', label: 'Man capture direction', type: 'select', default: 'forward',
      options: [
        { value: 'forward', label: 'Forward only' },
        { value: 'all', label: 'Any direction' },
      ] },
    { key: 'forcedCapture', label: 'Capture is compulsory', type: 'bool', default: true },
    { key: 'maximalCapture', label: 'Must take the longest capture', type: 'bool', default: false },
    { key: 'flyingKings', label: 'Flying kings (long-range)', type: 'bool', default: false },
    { key: 'captureBackward', label: 'Men may capture backwards', type: 'bool', default: false },
    { key: 'menCannotCaptureKings', label: 'Men cannot capture kings', type: 'bool', default: false },
    { key: 'promotionDuring', label: 'Promote mid-capture', type: 'bool', default: false },
    { key: 'loseOnSinglePiece', label: 'Lose when down to one piece', type: 'bool', default: false },
    { key: 'kingCapturePriority', label: 'Prefer king captures', type: 'bool', default: false,
      hint: 'When multiple captures exist, those involving kings are preferred (Italian rule).' },
    { key: 'majorityPrefersKing', label: 'Majority prefers king', type: 'bool', default: false,
      hint: 'Among equal-length captures, prefer the one capturing more kings.' },
  ],
  xiangqi: [
    { key: 'hasRiver', label: 'River', type: 'bool', default: true },
    { key: 'flyingGeneralRule', label: 'Flying general', type: 'bool', default: true },
    { key: 'cannonJumpToMove', label: 'Cannon needs a screen to move', type: 'bool', default: false },
    { key: 'passAllowed', label: 'Allow pass', type: 'bool', default: false },
    { key: 'royalType', label: 'Royal piece', type: 'select', default: 'general',
      options: [
        { value: 'general', label: 'General' },
        { value: 'king', label: 'King' },
      ] },
  ],
  reversi: [
    { key: 'directions', label: 'Flanking directions', type: 'select', default: 'all',
      options: [
        { value: 'all', label: 'All 8 directions' },
        { value: 'diagonal', label: 'Diagonal only' },
        { value: 'orthogonal', label: 'Orthogonal only' },
      ] },
    { key: 'winBy', label: 'Win condition', type: 'select', default: 'most',
      options: [
        { value: 'most', label: 'Most discs wins' },
        { value: 'fewest', label: 'Fewest discs wins (anti-reversi)' },
      ] },
    { key: 'mustFlip', label: 'A move must flip at least one disc', type: 'bool', default: true },
    { key: 'passWhenNoMoves', label: 'Pass when no move is available', type: 'bool', default: true },
    { key: 'allowPass', label: 'Allow voluntary pass', type: 'bool', default: false },
  ],
}

export function defaultRuleValues(family) {
  const out = {}
  for (const field of FAMILY_RULES[family] || []) {
    out[field.key] = Array.isArray(field.default) ? [...field.default] : field.default
  }
  return out
}

// Only emit what differs from the default. A config object that restates every
// default is noise in the exported frontmatter and hides the two lines that
// actually define the variant.
export function toPluginConfig(family, values) {
  const config = {}
  for (const field of FAMILY_RULES[family] || []) {
    const value = values?.[field.key]
    if (value === undefined || value === null) continue
    if (field.type === 'number' && Number.isNaN(Number(value))) continue

    if (field.type === 'list') {
      const arr = Array.isArray(value) ? value : parseList(value)
      if (arraysEqual(arr, field.default)) continue
      if (!arr.length) continue
      config[field.key] = arr
    } else if (field.type === 'text') {
      if (value === field.default || value === '') continue
      config[field.key] = value
    } else if (field.type === 'number') {
      if (Number(value) === field.default) continue
      config[field.key] = Number(value)
    } else {
      if (value === field.default) continue
      if (value === '') continue
      config[field.key] = value
    }
  }
  // A board with no royal piece has nothing to be in check about, and leaving
  // check detection on makes every move illegal-check-test against a piece that
  // does not exist.
  if (family === 'chess' && config.royalType === 'none') config.noCheck = true
  return config
}

function parseList(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'string') return []
  return value.split(',').map(s => s.trim()).filter(Boolean)
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

export function buildRulesPanel(container, family, values, onChange) {
  container.innerHTML = ''
  const fields = FAMILY_RULES[family] || []
  if (!fields.length) return

  for (const field of fields) {
    const wrap = document.createElement('div')
    wrap.className = 'rule-row'

    if (field.type === 'bool') {
      const label = document.createElement('label')
      label.className = 'def-check'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = values[field.key] !== undefined ? !!values[field.key] : !!field.default
      cb.addEventListener('change', () => onChange(field.key, cb.checked))
      label.appendChild(cb)
      label.appendChild(document.createTextNode(' ' + field.label))
      wrap.appendChild(label)
    } else {
      const label = document.createElement('label')
      label.className = 'control-label'
      label.textContent = field.label
      wrap.appendChild(label)
      if (field.type === 'select') {
        const sel = document.createElement('select')
        sel.className = 'def-select'
        for (const opt of field.options) {
          const o = document.createElement('option')
          o.value = opt.value
          o.textContent = opt.label
          sel.appendChild(o)
        }
        sel.value = values[field.key] !== undefined ? values[field.key] : field.default
        sel.addEventListener('change', () => onChange(field.key, sel.value))
        wrap.appendChild(sel)
      } else if (field.type === 'text') {
        const input = document.createElement('input')
        input.type = 'text'
        input.className = 'def-input'
        input.value = values[field.key] !== undefined ? values[field.key] : (field.default || '')
        input.addEventListener('change', () => onChange(field.key, input.value))
        wrap.appendChild(input)
      } else if (field.type === 'list') {
        const input = document.createElement('input')
        input.type = 'text'
        input.className = 'def-input'
        const raw = values[field.key] !== undefined ? values[field.key] : field.default
        input.value = Array.isArray(raw) ? raw.join(', ') : (raw || '')
        input.placeholder = 'comma-separated'
        input.addEventListener('change', () => onChange(field.key, parseList(input.value)))
        wrap.appendChild(input)
      } else {
        const input = document.createElement('input')
        input.type = 'number'
        input.className = 'def-input def-input--short'
        if (field.min !== undefined) input.min = field.min
        if (field.max !== undefined) input.max = field.max
        if (field.step !== undefined) input.step = field.step
        input.value = values[field.key] !== undefined ? values[field.key] : field.default
        input.addEventListener('change', () => onChange(field.key, Number(input.value)))
        wrap.appendChild(input)
      }
    }

    if (field.hint) {
      const hint = document.createElement('div')
      hint.className = 'rule-hint'
      hint.textContent = field.hint
      wrap.appendChild(hint)
    }
    container.appendChild(wrap)
  }
}
