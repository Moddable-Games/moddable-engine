import { getDeckConfig, createDeck, shuffle, deal, layoutTable } from '../index.js'

let _renderDeckSvg = null
let _renderMahjongSvg = null
let _renderTableauSvg = null
export function setDeckRenderer(fn) { _renderDeckSvg = fn }
export function setMahjongRenderer(fn) { _renderMahjongSvg = fn }
export function setTableauRenderer(fn) { _renderTableauSvg = fn }

export function renderDeckFromResolved(resolved) {
  const components = resolved.components || {}
  const setup = resolved.setup || {}
  const meta = resolved.meta || {}

  const deckType = components.deck?.type || (components.dice ? 'standard-dice' : null)
  if (!deckType) return null

  const deckConfig = getDeckConfig(deckType)
  if (!deckConfig) return null

  const players = setup.players || 2
  const seed = setup.seed || 42

  let dealSpec = null
  const gameKeys = Object.keys(deckConfig.games || {})
  for (const key of gameKeys) {
    const spec = deckConfig.games[key]
    if (spec.perPlayer === setup.deal || spec.defaultPlayers === players) {
      dealSpec = spec
      break
    }
  }
  if (!dealSpec && gameKeys.length > 0) {
    dealSpec = deckConfig.games[gameKeys[0]]
  }
  if (!dealSpec) return null

  const activeDealSpec = { ...dealSpec, players }
  const createOpts = deckType === 'standard-dice'
    ? { count: (dealSpec.perPlayer || 0) * players + (dealSpec.community || 0) }
    : dealSpec
  const cards = createDeck(deckType, createOpts)
  const shuffled = shuffle(cards, seed)
  const dealResult = deal(shuffled, activeDealSpec)

  if (deckType === 'standard-dice' && deckConfig.roll) {
    for (let i = 0; i < dealResult.hands.length; i++) {
      dealResult.hands[i] = deckConfig.roll(dealResult.hands[i], seed + i)
    }
    if (dealResult.community.length > 0) {
      dealResult.community = deckConfig.roll(dealResult.community, seed + 99)
    }
  }

  const cardW = deckType === 'dominoes-28' ? 32 : deckType === 'standard-dice' ? 48 : 44
  const cardH = deckType === 'dominoes-28' ? 60 : deckType === 'standard-dice' ? 48 : 64
  const maxHand = Math.max(...dealResult.hands.map(h => h.length), dealResult.community.length)
  const handWidth = maxHand * (cardW + 4)
  const handHalfW = handWidth / 2
  const handHalfH = cardH / 2
  const separationNeeded = handWidth + 20
  const minRingFromSeparation = separationNeeded / (2 * Math.sin(Math.PI / players))
  const communityWidth = dealResult.community.length * (cardW + 4)
  const hasDrawPile = dealResult.drawPile.length > 0
  const drawPileWidth = hasDrawPile ? cardW + 8 : 0
  const centreZoneHalfW = (communityWidth + drawPileWidth) / 2
  const minRingFromCommunity = centreZoneHalfW + handHalfW + 20
  const minRing = Math.max(minRingFromSeparation, minRingFromCommunity, 150)

  const tableW = (minRing + handHalfW) * 2 + 40
  const tableH = (minRing + handHalfH) * 2 + 60

  const tableLayout = layoutTable(dealResult, {
    players,
    tableWidth: tableW,
    tableHeight: tableH,
    cardW,
    cardH,
    handStyle: 'spread',
  })

  if (dealResult.layout === 'tableau' && _renderTableauSvg) {
    return _renderTableauSvg(dealResult, {
      deckType, deckConfig, variantDef: { label: meta.label || '' }, seed,
      tileSet: dealSpec.tileSet || 'mahjong-regular',
      _returnOnly: true,
    })
  }

  if (dealSpec.layout === 'mahjong-wall' && _renderMahjongSvg) {
    return _renderMahjongSvg(dealResult, {
      deckType, deckConfig, variantDef: { label: meta.label || '' }, seed,
      tileSet: dealSpec.tileSet || 'mahjong-regular',
      _returnOnly: true,
    })
  }

  if (!_renderDeckSvg) return null
  return _renderDeckSvg(tableLayout, {
    tableW, tableH, cardW, cardH,
    deckLabel: deckConfig.label || deckType,
    gameLabel: meta.label || '',
    deckType,
    seed,
  })
}
