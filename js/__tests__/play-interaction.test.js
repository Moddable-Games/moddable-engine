import { createCellAddressing } from '../play-cells.js'

// Mock container with data-sq elements
function mockContainer(squareIds) {
  const elements = squareIds.map(id => ({
    getAttribute(k) { return k === 'data-sq' ? id : null },
    parentNode: null,
    getBBox() { return { x: 0, y: 0, width: 40, height: 40 } },
  }))

  const container = {
    onclick: null,
    onmouseover: null,
    onmouseout: null,
    contains() { return true },
    _elements: elements,
  }

  for (const el of elements) {
    el.parentNode = container
    el.nextSibling = null
    el.parentNode.insertBefore = () => {}
  }

  return container
}

function simulateClick(container, element) {
  if (!container.onclick) return
  container.onclick({ target: element })
}

// Import after mock setup (no global.document needed for this module's import)
global.document = {
  createElementNS(ns, tag) {
    return {
      tagName: tag,
      setAttribute() {},
      getAttribute() { return null },
      remove() {},
      className: '',
      parentNode: { insertBefore() {} },
    }
  },
}

const { bindBoardInteraction } = await import('../play-interaction.js')

describe('play-interaction', () => {
  const cells = createCellAddressing({ rows: 8, cols: 8, idStyle: 'algebraic', flipped: false })

  it('delegated click resolves to correct index', () => {
    const container = mockContainer(['a8', 'b8', 'h1'])
    let clicked = null
    bindBoardInteraction(container, cells, {
      onCellClick: (idx) => { clicked = idx },
      hover: false,
    })

    simulateClick(container, container._elements[0])
    expect(clicked).toBe(0)

    simulateClick(container, container._elements[2])
    expect(clicked).toBe(63)
  })

  it('click on non-cell element does nothing', () => {
    const container = mockContainer(['a8'])
    let clicked = null
    bindBoardInteraction(container, cells, {
      onCellClick: (idx) => { clicked = idx },
      hover: false,
    })

    simulateClick(container, { getAttribute: () => null, parentNode: container })
    expect(clicked).toBeNull()
  })

  it('dispose detaches handlers', () => {
    const container = mockContainer(['a8'])
    const dispose = bindBoardInteraction(container, cells, {
      onCellClick: () => {},
      hover: false,
    })

    expect(container.onclick).not.toBeNull()
    dispose()
    expect(container.onclick).toBeNull()
  })

  it('respects flipped addressing', () => {
    const flippedCells = createCellAddressing({ rows: 8, cols: 8, idStyle: 'algebraic', flipped: true })
    const container = mockContainer(['h1'])
    let clicked = null
    bindBoardInteraction(container, flippedCells, {
      onCellClick: (idx) => { clicked = idx },
      hover: false,
    })

    simulateClick(container, container._elements[0])
    expect(clicked).toBe(0)
  })
})
