export { createGameController } from './src/game-controller.js'
export { createGameForFamily, getPlugin, getFamilies, hasFamily, setRulesReader, registerTopology, registerPluginFactory } from './src/play.js'
export { createSimulatorForFamily } from './src/simulator-helper.js'
export { renderStateAsSvg } from './src/render-helper.js'

export {
  registerVariant,
  registerVariants,
  getVariantConfig,
  getVariantKeys,
  getVariantGroups,
  getRegisteredFamilies,
  getManifest,
  hasVariant,
  clearVariants,
  listVariants,
  invalidateManifest,
  setVariantSources,
} from './src/variant-registry.js'

export {
  registerInteractionModel,
  registerFamilyInteraction,
  getInteractionModel,
  listInteractionModels,
  interactionModelFor,
  availableActions,
  FAMILY_INTERACTION,
} from './src/interaction.js'

export {
  createEmbedBridge,
  parseEmbedParams,
  buildEmbedUrl,
  normaliseOutcome,
  EMBED_COMMANDS,
  EMBED_EVENTS,
} from './src/embed.js'

export {
  createGame,
  createAI,
  analyzePosition,
  getGameStatus,
  getLegalMoves,
  renderSvg,
  AI_DIFFICULTIES,
  registerMctsDefault,
} from './src/sdk.js'

export {
  renderInteractiveBoard,
  hitTargetLayer,
  overlayLayer,
  marksForState,
} from './src/board-view.js'

export {
  parseVariantKey,
  serializeVariantKey,
  parseUrlFlags,
  deriveCompatibleFlags,
  familySupportsFlag,
  applyFlags,
  flagPositionKeySuffix,
} from './src/variant-flags.js'
