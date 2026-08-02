import { MCE } from '../src/mce-adapter.js'
import '../index.js'
import { getVariantConfig } from '../../../play/src/variant-registry.js'
import { listVariants } from '../../../play/src/variant-registry.js'

const ALL_VARIANTS = listVariants('chess').map(v => v.key)

describe('polarity inversion: MCE flags map correctly to plugin config', () => {
  it.each(ALL_VARIANTS)('%s: noCastling in MCE means castling:false in plugin', (key) => {
    const mceConfig = MCE.variantRegistry[key]
    if (!mceConfig) return
    const pluginConfig = getVariantConfig('chess', key)
    if (!pluginConfig) return

    if (mceConfig.noCastling) {
      expect(pluginConfig.castling).toBe(false)
    }
  })

  it.each(ALL_VARIANTS)('%s: noEnPassant in MCE means enPassant:false in plugin', (key) => {
    const mceConfig = MCE.variantRegistry[key]
    if (!mceConfig) return
    const pluginConfig = getVariantConfig('chess', key)
    if (!pluginConfig) return

    if (mceConfig.noEnPassant) {
      expect(pluginConfig.enPassant).toBe(false)
    }
  })
})
