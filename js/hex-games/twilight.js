import { registerGame } from './game-registry.js';
import { createSeededRng } from './xorshift.js';
import { TwilightTiles } from '../hex-data/twilight-tiles.js';
import { TwilightImages } from '../hex-data/twilight-images.js';

function generateRing(radius) {
if (radius === 0) return [{ q: 0, r: 0 }];
var results = [];
var directions = [
    { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
    { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }
];
var q = 0, r = -radius;
for (var d = 0; d < 6; d++) {
    for (var step = 0; step < radius; step++) {
        results.push({ q: q, r: r });
        q += directions[d].q;
        r += directions[d].r;
    }
}
return results;
}

function buildBoard(rings) {
var positions = [];
for (var ring = 0; ring <= rings; ring++) {
    var hexes = generateRing(ring);
    for (var i = 0; i < hexes.length; i++) {
        positions.push({ q: hexes[i].q, r: hexes[i].r, ring: ring });
    }
}
return positions;
}

function posKey(q, r) { return q + ',' + r; }

var layouts = {
'6p': {
    label: '6 Players (Standard)',
    rings: 3,
    homes: [
        { q: 3, r: 0 }, { q: 3, r: -3 }, { q: 0, r: -3 },
        { q: -3, r: 0 }, { q: -3, r: 3 }, { q: 0, r: 3 }
    ],
    removed: []
},
'5p': {
    label: '5 Players',
    rings: 3,
    homes: [
        { q: 3, r: 0 }, { q: 3, r: -3 }, { q: -1, r: -2 },
        { q: -3, r: 2 }, { q: 0, r: 3 }
    ],
    removed: []
},
'4p': {
    label: '4 Players',
    rings: 3,
    homes: [
        { q: 3, r: -2 }, { q: 1, r: 2 },
        { q: -1, r: -2 }, { q: -3, r: 2 }
    ],
    removed: []
},
'3p': {
    label: '3 Players',
    rings: 3,
    homes: [
        { q: 3, r: -3 }, { q: -3, r: 0 }, { q: 0, r: 3 }
    ],
    removed: [
        { q: 3, r: 0 }, { q: 3, r: -1 }, { q: 2, r: 1 },
        { q: 1, r: -3 }, { q: -1, r: -2 }, { q: -3, r: 2 },
        { q: 0, r: -3 }, { q: -3, r: 3 }, { q: -2, r: 3 }
    ]
},
'7p': {
    label: '7 Players (PoK)',
    rings: 4,
    homes: [
        { q: 3, r: 1 }, { q: 4, r: -2 }, { q: 3, r: -4 },
        { q: -3, r: -1 }, { q: -4, r: 2 }, { q: 0, r: -4 },
        { q: -3, r: 4 }
    ],
    removed: [],
    hyperlanes: [
        { q: 0, r: 1, type: 'lanes' },
        { q: 0, r: -1, type: 'lanes' },
        { q: -1, r: 0, type: 'lanes' },
        { q: 1, r: 2, type: 'lanes' },
        { q: 1, r: -3, type: 'lanes' },
        { q: -3, r: 2, type: 'lanes' }
    ]
},
'8p': {
    label: '8 Players (PoK)',
    rings: 4,
    homes: [
        { q: 0, r: 4 }, { q: 3, r: 1 }, { q: 4, r: -2 },
        { q: 3, r: -4 }, { q: 0, r: -4 }, { q: -3, r: -1 },
        { q: -4, r: 2 }, { q: -3, r: 4 }
    ],
    removed: [],
    hyperlanes: [
        { q: 0, r: 1, type: 'lanes' },
        { q: 1, r: 0, type: 'lanes' },
        { q: 0, r: -1, type: 'lanes' },
        { q: -1, r: 0, type: 'lanes' },
        { q: 3, r: -2, type: 'lanes' },
        { q: -3, r: 2, type: 'lanes' }
    ]
},
'hyper': {
    label: 'Hyper Imperium',
    rings: 4,
    removed: [],
    hyperBoard: true
}
};

var classicColors = {
rex: '#FFD700',
blue: '#1565C0',
red: '#C62828',
green: '#2E7D32',
lanes: '#37474F',
legends: '#1565C0',
home: '#6A1B9A'
};

var asciiColors = {
rex: '#2e2e1a',
blue: '#0a1a2e',
red: '#2e0a0a',
green: '#0a2e0a',
lanes: '#1a1a1a',
legends: '#0a1a2e',
home: '#1a0a2e'
};

var hyperHomes = {
6: [
    { q: 0, r: -3 }, { q: 3, r: -3 }, { q: 3, r: 0 },
    { q: 0, r: 3 }, { q: -3, r: 3 }, { q: -3, r: 0 }
],
5: [
    { q: 0, r: -3 }, { q: 3, r: -3 }, { q: 3, r: 0 },
    { q: -3, r: 3 }, { q: -3, r: 0 }
],
4: [
    { q: 3, r: -3 }, { q: 3, r: 0 },
    { q: -3, r: 3 }, { q: -3, r: 0 }
]
};

var hyperRing4Pattern = [
'red','blue','blue','blue','red','blue','legends','blue',
'red','blue','blue','blue','red','blue','blue','blue',
'red','blue','legends','blue','red','blue','blue','blue'
];

function assignTileTypes(positions, layoutDef) {
var homeSet = {};
for (var i = 0; i < layoutDef.homes.length; i++) {
    homeSet[posKey(layoutDef.homes[i].q, layoutDef.homes[i].r)] = true;
}

var removedSet = {};
for (var i = 0; i < layoutDef.removed.length; i++) {
    removedSet[posKey(layoutDef.removed[i].q, layoutDef.removed[i].r)] = true;
}

var hyperlaneSet = {};
if (layoutDef.hyperlanes) {
    for (var i = 0; i < layoutDef.hyperlanes.length; i++) {
        var hl = layoutDef.hyperlanes[i];
        hyperlaneSet[posKey(hl.q, hl.r)] = true;
    }
}

var isHyper = !!layoutDef.hyperBoard;

var result = [];
for (var i = 0; i < positions.length; i++) {
    var pos = positions[i];
    var key = posKey(pos.q, pos.r);

    if (removedSet[key]) continue;

    var type;
    var isHome = !!homeSet[key];

    if (pos.q === 0 && pos.r === 0) {
        type = 'rex';
    } else if (isHyper) {
        if (isHome) {
            type = 'green';
        } else if (pos.ring === 1) {
            type = 'red';
        } else if (pos.ring === 2) {
            var r2idx = i - 7;
            type = (r2idx % 2 === 0) ? 'lanes' : 'blue';
        } else if (pos.ring === 3) {
            var r3idx = i - 19;
            var r3pattern = r3idx % 3;
            type = (r3pattern === 0) ? 'green' : (r3pattern === 1) ? 'blue' : 'red';
            if (type === 'green' && !isHome) type = 'blue';
        } else if (pos.ring === 4) {
            var r4idx = i - 37;
            type = hyperRing4Pattern[r4idx] || 'blue';
        } else {
            type = 'blue';
        }
    } else if (homeSet[key]) {
        type = 'green';
    } else if (hyperlaneSet[key]) {
        type = 'lanes';
    } else if (pos.ring === 1) {
        type = 'blue';
    } else if (pos.ring === 2) {
        type = (i % 2 === 0) ? 'blue' : 'red';
    } else if (pos.ring === 3) {
        type = (i % 3 === 0) ? 'red' : 'blue';
    } else {
        type = 'blue';
    }

    result.push({ q: pos.q, r: pos.r, ring: pos.ring, type: type, isHome: isHome });
}
return result;
}

registerGame('twilight', {
label: 'Twilight',
orientation: 'flat',
sizes: [
    { value: 3, label: 'Standard' }
],
defaultSize: 3,
defaultPlayers: 6,
styles: ['artistic', 'classic'],
hasEditor: false,
layouts: [
    { value: '6p', label: '6 Players (Standard)' },
    { value: '5p', label: '5 Players' },
    { value: '4p', label: '4 Players' },
    { value: '3p', label: '3 Players' },
    { value: '7p', label: '7 Players (PoK)' },
    { value: '8p', label: '8 Players (PoK)' },
    { value: 'hyper', label: 'Hyper Imperium' }
],
defaultLayout: '6p',

playerCounts: function(size, layout) {
    if (layout === 'hyper') return [4, 5, 6];
    return [];
},

generate: function(size, players, seed, selectedLayout) {
    var layoutDef = layouts[selectedLayout] || layouts['6p'];

    if (layoutDef.hyperBoard) {
        var pc = Math.max(4, Math.min(6, players || 6));
        layoutDef = {
            rings: layoutDef.rings,
            homes: hyperHomes[pc],
            removed: [],
            hyperBoard: true
        };
    }

    var boardPositions = buildBoard(layoutDef.rings);
    var assigned = assignTileTypes(boardPositions, layoutDef);

    var rng = createSeededRng(seed + '_twilight');
    var base = '../';
    var imgMap = TwilightImages;

    var bluePool = TwilightTiles.blue.slice();
    if (!layoutDef.hyperBoard) {
        bluePool = bluePool.concat(TwilightTiles.legends.slice());
    }
    var pools = {
        blue: bluePool,
        red: TwilightTiles.red.slice(),
        green: TwilightTiles.green.slice(),
        lanes: TwilightTiles.lanes.slice(),
        legends: TwilightTiles.legends.slice()
    };

    function drawTile(pool) {
        if (pool.length === 0) return null;
        var idx = rng.integer(0, pool.length - 1);
        return pool.splice(idx, 1)[0];
    }

    var hexes = [];
    for (var i = 0; i < assigned.length; i++) {
        var def = assigned[i];
        var type = def.type;
        var label = type.charAt(0).toUpperCase();
        var tileName = null;
        var imagePath = null;
        var id = 'R' + def.ring + 'D' + (i + 1);

        if (type === 'rex') {
            id = 'R0';
            tileName = 'Mecatol Rex';
            label = 'Rex';
            if (imgMap) imagePath = base + 'tiles/sets/twilight/' + imgMap.rex;
        } else if (def.isHome) {
            tileName = drawTile(pools.green);
            if (tileName) {
                label = tileName.split('/')[0].split(' ')[0].substring(0, 3);
                if (imgMap && imgMap.green && imgMap.green[tileName]) {
                    imagePath = base + 'tiles/sets/twilight/' + imgMap.green[tileName];
                }
            }
        } else if (pools[type]) {
            tileName = drawTile(pools[type]);
            if (tileName) {
                label = tileName.split('/')[0].split(' ')[0].substring(0, 3);
                if (imgMap && imgMap[type] && imgMap[type][tileName]) {
                    imagePath = base + 'tiles/sets/twilight/' + imgMap[type][tileName];
                }
            }
        }

        hexes.push({
            id: id,
            q: def.q,
            r: def.r,
            type: def.isHome ? 'green' : type,
            label: label,
            tileName: tileName || type,
            imagePath: imagePath
        });
    }

    return hexes;
},

getColors: function(style) {
    if (style === 'ascii') return asciiColors;
    return classicColors;
},

getImages: function(style) {
    if (style !== 'artistic') return null;
    return { _perHex: true };
},

rendererOptions: function() {
    return { hexSize: 40, flat: true };
}
});
