const registeredEvaluators = new Map()

export function registerEvaluator(family, evaluator) {
  registeredEvaluators.set(family, evaluator)
}

export function getEvaluator(family) {
  return registeredEvaluators.get(family) || null
}

export const EVALUATORS = new Proxy({}, {
  get(_, family) { return registeredEvaluators.get(family) },
  has(_, family) { return registeredEvaluators.has(family) },
  ownKeys() { return [...registeredEvaluators.keys()] },
  getOwnPropertyDescriptor(_, family) {
    if (registeredEvaluators.has(family)) {
      return { configurable: true, enumerable: true, value: registeredEvaluators.get(family) }
    }
  },
})
