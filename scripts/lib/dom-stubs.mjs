// Minimal DOM stubs for running browser-oriented engine modules under Node.
//
// Consumers: scripts/export-boards.mjs, scripts/snapshot-boards.mjs,
// scripts/compare-engine.mjs, scripts/build-board-index.mjs
//
// This is a side-effect module and MUST be imported before any engine module
// that touches the DOM at module scope. ESM hoists `import` declarations above
// all other statements, so assigning these globals inline in a script does not
// reliably run before its own imports are evaluated — it only worked because
// the modules those scripts happened to import did not reach for `document`.
// Keeping the stubs in their own module makes the ordering explicit and real:
// side-effect imports are evaluated in source order.
//
//   import './lib/dom-stubs.mjs'          // first
//   import { renderFromEngine } from '../packages/render/src/render-engine.js'

const stubEl = () => ({
  style: {}, innerHTML: '', value: '',
  appendChild: () => {}, addEventListener: () => {},
  querySelectorAll: () => [], querySelector: () => null,
  classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
  setAttribute: () => {}, getAttribute: () => null,
  dataset: {}, options: [], getBoundingClientRect: () => ({}),
})

globalThis.document = {
  getElementById: () => stubEl(),
  createElement: () => stubEl(),
  createElementNS: () => stubEl(),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
}
globalThis.window = { location: { search: '' }, addEventListener: () => {} }
globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
globalThis.requestAnimationFrame = () => {}
globalThis.URLSearchParams = class { get() { return null } }
globalThis.IntersectionObserver = class { observe() {} disconnect() {} }

