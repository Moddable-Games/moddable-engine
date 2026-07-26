import MCE from './engine.js';

const OFFSETS = {
  knight: [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]],
  king: [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],
  bishop: [[-1,-1],[-1,1],[1,-1],[1,1]],
  rook: [[-1,0],[1,0],[0,-1],[0,1]],
  queen: [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],
  elephant: [[-2,-2],[-2,2],[2,-2],[2,2]],
  camel: [[-3,-1],[-3,1],[-1,-3],[-1,3],[1,-3],[1,3],[3,-1],[3,1]],
  dabbaba: [[-2,0],[2,0],[0,-2],[0,2]],
  zebra: [[-3,-2],[-3,2],[-2,-3],[-2,3],[2,-3],[2,3],[3,-2],[3,2]],
};

function Leaper(offsets) {
  const dirs = typeof offsets === 'string' ? OFFSETS[offsets] : offsets;
  return {
    type: 'leaper',
    offsets: dirs,
    genMoves(g, from, side) {
      const moves = [];
      const [r, c] = MCE.rc(from, g);
      MCE.genJumps(g, from, r, c, side, dirs, moves);
      return moves;
    },
    attacks(g, from, target) {
      const [fr, fc] = MCE.rc(from, g);
      const [tr, tc] = MCE.rc(target, g);
      return dirs.some(([dr, dc]) => fr + dr === tr && fc + dc === tc);
    },
  };
}

function Rider(dirs) {
  const directions = typeof dirs === 'string' ? OFFSETS[dirs] : dirs;
  return {
    type: 'rider',
    dirs: directions,
    genMoves(g, from, side) {
      const moves = [];
      const [r, c] = MCE.rc(from, g);
      MCE.genSlides(g, from, r, c, side, directions, moves);
      return moves;
    },
    attacks(g, from, target) {
      return MCE.slidesTo(g, from, target, directions);
    },
  };
}

function compose(...primitives) {
  return {
    type: 'compound',
    parts: primitives,
    genMoves(g, from, side) {
      const moves = [];
      for (const p of primitives) {
        const m = p.genMoves(g, from, side);
        if (m) for (const move of m) moves.push(move);
      }
      return moves;
    },
    attacks(g, from, target) {
      for (const p of primitives) {
        if (p.attacks(g, from, target)) return true;
      }
      return false;
    },
  };
}

function divergent(movePrimitive, capturePrimitive) {
  return {
    type: 'divergent',
    move: movePrimitive,
    capture: capturePrimitive,
    genMoves(g, from, side) {
      const moves = [];
      const mMoves = movePrimitive.genMoves(g, from, side);
      if (mMoves) {
        for (const m of mMoves) {
          if (!m.flag || m.flag !== 'capture') moves.push(m);
        }
      }
      const cMoves = capturePrimitive.genMoves(g, from, side);
      if (cMoves) {
        for (const m of cMoves) {
          if (m.flag === 'capture') moves.push(m);
        }
      }
      return moves;
    },
    attacks(g, from, target) {
      return capturePrimitive.attacks(g, from, target);
    },
  };
}

function fromPrimitives(primitiveConfig) {
  if (primitiveConfig.divergent) {
    return divergent(
      buildPrimitive(primitiveConfig.divergent.move),
      buildPrimitive(primitiveConfig.divergent.capture)
    );
  }
  if (Array.isArray(primitiveConfig)) {
    return compose(...primitiveConfig.map(buildPrimitive));
  }
  return buildPrimitive(primitiveConfig);
}

function buildPrimitive(spec) {
  if (spec.type === 'leaper') return Leaper(spec.offsets || spec.dirs);
  if (spec.type === 'rider') return Rider(spec.dirs);
  if (typeof spec === 'string') {
    if (OFFSETS[spec]) return Leaper(spec);
  }
  return spec;
}

Object.assign(MCE, { Leaper, Rider, compose, divergent, fromPrimitives, OFFSETS });

export { Leaper, Rider, compose, divergent, fromPrimitives, OFFSETS };
