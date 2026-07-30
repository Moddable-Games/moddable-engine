// Mock DOM
global.document = {
  createElement(tag) {
    const attrs = {}
    const children = []
    const classList = new Set()
    const listeners = {}
    return {
      tagName: tag,
      className: '',
      src: '',
      alt: '',
      textContent: '',
      disabled: false,
      innerHTML: '',
      set innerText(v) { this.textContent = v },
      setAttribute(k, v) { attrs[k] = String(v) },
      getAttribute(k) { return attrs[k] ?? null },
      appendChild(c) { children.push(c) },
      get childNodes() { return children },
      get children() { return children },
      classList: { add(c) { classList.add(c) }, has(c) { return classList.has(c) } },
      addEventListener(ev, fn) { listeners[ev] = fn },
      click() { if (listeners.click) listeners.click() },
      _listeners: listeners,
      _children: children,
      _classList: classList,
    }
  },
}

import { renderHandPanel } from '../play-hand.js'

describe('play-hand', () => {
  function mockEl() {
    const children = []
    return {
      innerHTML: '',
      appendChild(c) { children.push(c) },
      get childNodes() { return children },
      _children: children,
    }
  }

  it('renders sides with pieces', () => {
    const el = mockEl()
    renderHandPanel(el, {
      sides: [
        { id: 'white', label: 'White', pieces: [{ id: 'q', label: '♛', count: 1 }, { id: 'p', label: '♟', count: 3 }] },
        { id: 'black', label: 'Black', pieces: [{ id: 'n', label: '♞', count: 1 }] },
      ],
      armed: null,
      enabledFor: 'white',
      onArm: () => {},
    })
    expect(el._children.length).toBe(2)
  })

  it('skips sides with no pieces', () => {
    const el = mockEl()
    renderHandPanel(el, {
      sides: [
        { id: 'white', label: 'White', pieces: [] },
        { id: 'black', label: 'Black', pieces: [{ id: 'p', label: '♟', count: 1 }] },
      ],
      armed: null,
      enabledFor: null,
      onArm: () => {},
    })
    expect(el._children.length).toBe(1)
  })

  it('marks armed piece as active', () => {
    const el = mockEl()
    renderHandPanel(el, {
      sides: [{ id: 'w', label: 'W', pieces: [{ id: 'q', label: 'Q', count: 1 }] }],
      armed: 'q',
      enabledFor: 'w',
      onArm: () => {},
    })
    const row = el._children[0]
    const btn = row._children[1]
    expect(btn._classList.has('hand-piece--active')).toBe(true)
  })

  it('disables buttons when not enabledFor', () => {
    const el = mockEl()
    renderHandPanel(el, {
      sides: [{ id: 'w', label: 'W', pieces: [{ id: 'q', label: 'Q', count: 1 }] }],
      armed: null,
      enabledFor: 'b',
      onArm: () => {},
    })
    const row = el._children[0]
    const btn = row._children[1]
    expect(btn.disabled).toBe(true)
  })

  it('calls onArm when enabled button clicked', () => {
    const el = mockEl()
    let armed = null
    renderHandPanel(el, {
      sides: [{ id: 'w', label: 'W', pieces: [{ id: 'n', label: 'N', count: 2 }] }],
      armed: null,
      enabledFor: 'w',
      onArm: (id, side) => { armed = { id, side } },
    })
    const row = el._children[0]
    const btn = row._children[1]
    btn.click()
    expect(armed).toEqual({ id: 'n', side: 'w' })
  })

  it('renders count badge when count > 1', () => {
    const el = mockEl()
    renderHandPanel(el, {
      sides: [{ id: 'w', label: 'W', pieces: [{ id: 'p', label: 'P', count: 4 }] }],
      armed: null,
      enabledFor: null,
      onArm: () => {},
    })
    const row = el._children[0]
    const btn = row._children[1]
    const badge = btn._children[0]
    expect(badge.tagName).toBe('span')
    expect(String(badge.textContent)).toBe('4')
  })

  it('renders image when piece has image field', () => {
    const el = mockEl()
    renderHandPanel(el, {
      sides: [{ id: 'w', label: 'W', pieces: [{ id: 'king', image: '/pieces/king.svg', count: 1 }] }],
      armed: null,
      enabledFor: null,
      onArm: () => {},
    })
    const row = el._children[0]
    const btn = row._children[1]
    const img = btn._children[0]
    expect(img.tagName).toBe('img')
    expect(img.src).toBe('/pieces/king.svg')
  })

  it('does nothing when el is null', () => {
    expect(() => renderHandPanel(null, { sides: [], armed: null, enabledFor: null, onArm: () => {} })).not.toThrow()
  })
})
