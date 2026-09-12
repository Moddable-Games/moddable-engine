export function createRegistry() {
  const plugins = []
  const capabilities = new Map()

  function register(plugin) {
    if (!plugin.sliceName) throw new Error('Plugin must have a sliceName')
    plugins.push(plugin)
  }

  function provide(capabilityName, fn) {
    capabilities.set(capabilityName, fn)
  }

  function request(capabilityName) {
    return capabilities.get(capabilityName) || null
  }

  function initAll(config, store) {
    for (const plugin of plugins) {
      store.claimSlice(plugin.sliceName, plugin.sliceName)
      const pluginConfig = config[plugin.sliceName] || {}
      const initialState = plugin.init(pluginConfig, { provide, request })
      store.set(plugin.sliceName, initialState, plugin.sliceName)
      // A plugin whose slice holds something one seat knows and another does
      // not says so here, and says how a seat sees it. The registry asks every
      // plugin the same question and knows nothing about which games have
      // secrets. engine#155.
      if (typeof plugin.projectForSeat === 'function') {
        store.declareSecret(plugin.sliceName, (slice, seat) => plugin.projectForSeat(slice, seat), plugin.sliceName)
      }
    }
  }

  function call(methodName, ...args) {
    const results = []
    for (const plugin of plugins) {
      if (typeof plugin[methodName] === 'function') {
        results.push(plugin[methodName](...args))
      }
    }
    return results
  }

  function getPlugins() {
    return [...plugins]
  }

  function requireVersion(packageName, semver) {
    // Placeholder for future version checking
  }

  return { register, provide, request, initAll, call, getPlugins, requireVersion }
}
