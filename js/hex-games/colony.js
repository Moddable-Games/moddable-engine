import { registerGame } from './game-registry.js';
import { createSeededRng } from './xorshift.js';

var terrainPool = {
    base: [
        { type: 'forest', count: 4 },
        { type: 'pasture', count: 4 },
        { type: 'fields', count: 4 },
        { type: 'hills', count: 3 },
        { type: 'mountains', count: 3 },
        { type: 'desert', count: 1 }
    ],
    expanded: [
        { type: 'forest', count: 6 },
        { type: 'pasture', count: 6 },
        { type: 'fields', count: 6 },
        { type: 'hills', count: 5 },
        { type: 'mountains', count: 5 },
        { type: 'desert', count: 2 }
    ]
};

var numberTokens = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
var expandedTokens = [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12];

var tokenColors = {
    6: '#C62828',
    8: '#C62828'
};

var classicColors = {
    forest: '#2E7D32',
    pasture: '#8BC34A',
    fields: '#FDD835',
    hills: '#D84315',
    mountains: '#616161',
    desert: '#FFF8E1',
    sea: '#1565C0',
    gold: '#FFD700',
    fog: '#9E9E9E'
};

var directions = [
    { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
    { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }
];

function generateRing(radius) {
    if (radius === 0) return [{ q: 0, r: 0 }];
    var results = [];
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

function generateGrid(rings) {
    var positions = [];
    for (var ring = 0; ring <= rings; ring++) {
        var hexes = generateRing(ring);
        for (var i = 0; i < hexes.length; i++) {
            positions.push({ q: hexes[i].q, r: hexes[i].r, ring: ring });
        }
    }
    return positions;
}

function buildPool(poolDef) {
    var tiles = [];
    for (var i = 0; i < poolDef.length; i++) {
        for (var j = 0; j < poolDef[i].count; j++) {
            tiles.push(poolDef[i].type);
        }
    }
    return tiles;
}

function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
        var j = rng.integer(0, i);
        var tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

function getNeighborKeys(q, r) {
    var keys = [];
    for (var i = 0; i < directions.length; i++) {
        keys.push((q + directions[i].q) + ',' + (r + directions[i].r));
    }
    return keys;
}

function hasAdjacentHighTokens(hexData) {
    var hexMap = {};
    for (var i = 0; i < hexData.length; i++) {
        hexMap[hexData[i].q + ',' + hexData[i].r] = hexData[i];
    }
    for (var i = 0; i < hexData.length; i++) {
        var hex = hexData[i];
        if (!hex.overlay) continue;
        var num = parseInt(hex.overlay.text);
        if (num !== 6 && num !== 8) continue;
        var neighbors = getNeighborKeys(hex.q, hex.r);
        for (var j = 0; j < neighbors.length; j++) {
            var neighbor = hexMap[neighbors[j]];
            if (neighbor && neighbor.overlay) {
                var nNum = parseInt(neighbor.overlay.text);
                if (nNum === 6 || nNum === 8) return true;
            }
        }
    }
    return false;
}

function assignTokens(hexData, tokens, rng) {
    var available = tokens.slice();
    shuffle(available, rng);
    var tokenIdx = 0;
    for (var i = 0; i < hexData.length; i++) {
        var hex = hexData[i];
        if (hex.type === 'desert' || hex.type === 'sea' || hex.type === 'fog') continue;
        if (tokenIdx >= available.length) break;
        var num = available[tokenIdx];
        if (hex.type === 'gold' && (num === 6 || num === 8)) {
            var swapped = false;
            for (var s = tokenIdx + 1; s < available.length; s++) {
                if (available[s] !== 6 && available[s] !== 8) {
                    var tmp = available[tokenIdx];
                    available[tokenIdx] = available[s];
                    available[s] = tmp;
                    num = available[tokenIdx];
                    swapped = true;
                    break;
                }
            }
            if (!swapped) continue;
        }
        hex.overlay = {
            text: String(num),
            color: tokenColors[num] || '#FFF8E1',
            size: 0.35
        };
        tokenIdx++;
    }
}

var portTypes = {
    base: ['3:1', '3:1', '3:1', '3:1', 'lumber', 'brick', 'wool', 'grain', 'ore'],
    expanded: ['3:1', '3:1', '3:1', '3:1', '3:1', 'wool', 'wool', 'lumber', 'ore', 'grain', 'brick']
};

function assignPorts(seaHexes, landMap, portPool, rng) {
    var candidates = [];
    for (var i = 0; i < seaHexes.length; i++) {
        var s = seaHexes[i];
        var neighbors = getNeighborKeys(s.q, s.r);
        var adjLand = false;
        for (var j = 0; j < neighbors.length; j++) {
            if (landMap[neighbors[j]]) { adjLand = true; break; }
        }
        if (adjLand) candidates.push(s);
    }
    shuffle(candidates, rng);

    var ports = portPool.slice();
    shuffle(ports, rng);
    var placed = {};
    var result = [];

    for (var i = 0; i < candidates.length && result.length < ports.length; i++) {
        var c = candidates[i];
        var key = c.q + ',' + c.r;
        var tooClose = false;
        var neighbors = getNeighborKeys(c.q, c.r);
        for (var j = 0; j < neighbors.length; j++) {
            if (placed[neighbors[j]]) { tooClose = true; break; }
        }
        if (tooClose) continue;
        placed[key] = true;
        c.port = ports[result.length];
        result.push(c);
    }
    return result;
}

var expandedLandCoords = [
    {q:0,r:-2},{q:1,r:-2},{q:2,r:-2},{q:3,r:-2},
    {q:-1,r:-1},{q:0,r:-1},{q:1,r:-1},{q:2,r:-1},{q:3,r:-1},
    {q:-2,r:0},{q:-1,r:0},{q:0,r:0},{q:1,r:0},{q:2,r:0},{q:3,r:0},
    {q:-3,r:1},{q:-2,r:1},{q:-1,r:1},{q:0,r:1},{q:1,r:1},{q:2,r:1},
    {q:-3,r:2},{q:-2,r:2},{q:-1,r:2},{q:0,r:2},{q:1,r:2},
    {q:-3,r:3},{q:-2,r:3},{q:-1,r:3},{q:0,r:3}
];

var seafarersTerrainPools = {
    newWorld: [
        { type: 'forest', count: 5 },
        { type: 'pasture', count: 5 },
        { type: 'fields', count: 5 },
        { type: 'mountains', count: 4 },
        { type: 'hills', count: 4 }
    ],
    newShores: [
        { type: 'forest', count: 5 },
        { type: 'pasture', count: 5 },
        { type: 'fields', count: 5 },
        { type: 'mountains', count: 5 },
        { type: 'hills', count: 5 },
        { type: 'gold', count: 2 }
    ],
    fourIslands: [
        { type: 'forest', count: 5 },
        { type: 'pasture', count: 5 },
        { type: 'fields', count: 5 },
        { type: 'mountains', count: 4 },
        { type: 'hills', count: 4 }
    ],
    desert: [
        { type: 'forest', count: 5 },
        { type: 'pasture', count: 5 },
        { type: 'fields', count: 5 },
        { type: 'mountains', count: 5 },
        { type: 'hills', count: 5 },
        { type: 'gold', count: 2 },
        { type: 'desert', count: 3 }
    ],
    fogIslands: [
        { type: 'forest', count: 4 },
        { type: 'pasture', count: 4 },
        { type: 'fields', count: 3 },
        { type: 'mountains', count: 3 },
        { type: 'hills', count: 3 },
        { type: 'fog', count: 12 }
    ]
};

var seafarersTokens = {
    newWorld: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12, 2, 3, 4, 5, 9],
    newShores: [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12],
    fourIslands: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12, 2, 3, 4, 5, 9],
    desert: [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12],
    fogIslands: [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11]
};

var seafarersPorts = {
    newWorld: ['3:1', '3:1', '3:1', '3:1', '3:1', 'lumber', 'brick', 'wool', 'grain', 'ore'],
    newShores: ['3:1', '3:1', '3:1', '3:1', 'lumber', 'brick', 'wool', 'grain', 'ore'],
    fourIslands: ['3:1', '3:1', '3:1', '3:1', 'lumber', 'brick', 'wool', 'grain', 'ore'],
    desert: ['3:1', '3:1', '3:1', '3:1', 'lumber', 'brick', 'wool', 'grain', 'ore'],
    fogIslands: ['3:1', '3:1', '3:1', '3:1', 'lumber', 'brick', 'wool', 'grain', 'ore']
};

function generateSeafarersMap(layoutKey, seed) {
    var rng = createSeededRng(seed + '_colony_' + layoutKey);
    var pool = buildPool(seafarersTerrainPools[layoutKey]);
    var landCount = pool.length;
    var gridSize = landCount > 30 ? 4 : 3;
    var allPositions = generateGrid(gridSize);

    shuffle(pool, rng);

    var landPositions, seaPositions;

    if (layoutKey === 'fourIslands') {
        landPositions = placeFourIslands(allPositions, landCount, rng);
    } else if (layoutKey === 'desert') {
        landPositions = placeWithDesertBarrier(allPositions, pool, rng);
    } else {
        landPositions = placeRandomIsland(allPositions, landCount, rng);
    }

    var landSet = {};
    for (var i = 0; i < landPositions.length; i++) {
        landSet[landPositions[i].q + ',' + landPositions[i].r] = true;
    }
    seaPositions = [];
    for (var i = 0; i < allPositions.length; i++) {
        var key = allPositions[i].q + ',' + allPositions[i].r;
        if (!landSet[key]) seaPositions.push(allPositions[i]);
    }

    var frameRing = generateRing(gridSize + 1);
    for (var i = 0; i < frameRing.length; i++) {
        seaPositions.push({ q: frameRing[i].q, r: frameRing[i].r, ring: gridSize + 1 });
    }

    var hexData = [];
    for (var i = 0; i < landPositions.length; i++) {
        var pos = landPositions[i];
        var type = pool[i] || 'fields';
        hexData.push({
            id: 'L' + (i + 1),
            q: pos.q, r: pos.r,
            type: type,
            label: type.charAt(0).toUpperCase(),
            tileName: type
        });
    }

    var tokens = seafarersTokens[layoutKey].slice();
    assignTokens(hexData, tokens, rng);

    var landMap = {};
    for (var i = 0; i < hexData.length; i++) {
        landMap[hexData[i].q + ',' + hexData[i].r] = true;
    }

    var seaHexData = [];
    for (var i = 0; i < seaPositions.length; i++) {
        var pos = seaPositions[i];
        var sh = {
            id: 'S' + (i + 1),
            q: pos.q, r: pos.r,
            type: 'sea',
            label: '',
            tileName: 'Sea'
        };
        seaHexData.push(sh);
    }

    assignPorts(seaHexData, landMap, seafarersPorts[layoutKey], rng);

    for (var i = 0; i < seaHexData.length; i++) {
        var sh = seaHexData[i];
        if (sh.port) {
            sh.tileName = 'Port (' + sh.port + ')';
            sh.label = sh.port === '3:1' ? '?' : sh.port.charAt(0).toUpperCase();
        }
        hexData.push(sh);
    }

    return hexData;
}

function placeRandomIsland(allPositions, landCount, rng) {
    var inner = [];
    for (var i = 0; i < allPositions.length; i++) {
        if (allPositions[i].ring <= 2) inner.push(allPositions[i]);
    }
    var outer = [];
    for (var i = 0; i < allPositions.length; i++) {
        if (allPositions[i].ring > 2) outer.push(allPositions[i]);
    }
    shuffle(outer, rng);
    var result = inner.slice();
    for (var i = 0; i < outer.length && result.length < landCount; i++) {
        result.push(outer[i]);
    }
    shuffle(result, rng);
    return result.slice(0, landCount);
}

function placeFourIslands(allPositions, landCount, rng) {
    var seeds = [
        { q: 1, r: -2 }, { q: 2, r: 1 },
        { q: -1, r: 2 }, { q: -2, r: -1 }
    ];

    var gridSet = {};
    for (var i = 0; i < allPositions.length; i++) {
        gridSet[allPositions[i].q + ',' + allPositions[i].r] = true;
    }

    var islandOf = {};
    var islands = [[], [], [], []];
    for (var i = 0; i < 4; i++) {
        islands[i].push(seeds[i]);
        islandOf[seeds[i].q + ',' + seeds[i].r] = i;
    }

    var placed = 4;
    while (placed < landCount) {
        var grew = false;
        for (var i = 0; i < 4; i++) {
            if (placed >= landCount) break;
            var candidates = [];
            for (var j = 0; j < islands[i].length; j++) {
                var h = islands[i][j];
                for (var d = 0; d < directions.length; d++) {
                    var nq = h.q + directions[d].q;
                    var nr = h.r + directions[d].r;
                    var nk = nq + ',' + nr;
                    if (!gridSet[nk] || islandOf[nk] !== undefined) continue;
                    var adjOther = false;
                    for (var d2 = 0; d2 < directions.length; d2++) {
                        var ak = (nq + directions[d2].q) + ',' + (nr + directions[d2].r);
                        if (islandOf[ak] !== undefined && islandOf[ak] !== i) {
                            adjOther = true; break;
                        }
                    }
                    if (!adjOther) candidates.push({ q: nq, r: nr });
                }
            }
            if (candidates.length > 0) {
                var pick = candidates[rng.integer(0, candidates.length - 1)];
                islands[i].push(pick);
                islandOf[pick.q + ',' + pick.r] = i;
                placed++;
                grew = true;
            }
        }
        if (!grew) break;
    }

    var result = [];
    for (var i = 0; i < 4; i++) result = result.concat(islands[i]);
    return result;
}

function placeWithDesertBarrier(allPositions, pool, rng) {
    shuffle(allPositions.slice(), rng);
    var sorted = allPositions.slice().sort(function(a, b) { return a.ring - b.ring; });
    return sorted.slice(0, pool.length);
}

function generateBaseMap(layoutDef, seed) {
    var rng = createSeededRng(seed + '_colony');
    var positions;

    if (layoutDef.landCoords) {
        positions = [];
        for (var i = 0; i < layoutDef.landCoords.length; i++) {
            var c = layoutDef.landCoords[i];
            positions.push({ q: c.q, r: c.r, ring: Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r)) });
        }
    } else {
        positions = generateGrid(layoutDef.rings);
    }

    var tiles = buildPool(terrainPool[layoutDef.pool]);
    shuffle(tiles, rng);

    var tokens = layoutDef.tokens.slice();
    shuffle(tokens, rng);

    var hexData = [];
    var tokenIdx = 0;

    for (var i = 0; i < positions.length; i++) {
        var pos = positions[i];
        var type = i < tiles.length ? tiles[i] : 'sea';
        var id = 'R' + pos.ring + 'D' + (i + 1);
        if (pos.ring === 0 && i === 0) id = 'R0';

        var hex = {
            id: id,
            q: pos.q,
            r: pos.r,
            type: type,
            label: type === 'sea' ? '' : type.charAt(0).toUpperCase(),
            tileName: type === 'sea' ? 'Sea' : type
        };

        if (type !== 'desert' && type !== 'sea' && tokenIdx < tokens.length) {
            var num = tokens[tokenIdx];
            hex.overlay = {
                text: String(num),
                color: tokenColors[num] || '#FFF8E1',
                size: 0.35
            };
            tokenIdx++;
        }

        hexData.push(hex);
    }

    var landMap = {};
    for (var i = 0; i < hexData.length; i++) {
        landMap[hexData[i].q + ',' + hexData[i].r] = true;
    }

    var seaSet = {};
    for (var i = 0; i < hexData.length; i++) {
        var neighbors = getNeighborKeys(hexData[i].q, hexData[i].r);
        for (var j = 0; j < neighbors.length; j++) {
            if (!landMap[neighbors[j]] && !seaSet[neighbors[j]]) {
                seaSet[neighbors[j]] = true;
            }
        }
    }

    var seaHexes = [];
    var seaKeys = Object.keys(seaSet);
    for (var i = 0; i < seaKeys.length; i++) {
        var parts = seaKeys[i].split(',');
        var sh = {
            id: 'S' + (i + 1),
            q: parseInt(parts[0]),
            r: parseInt(parts[1]),
            type: 'sea',
            label: '',
            tileName: 'Sea'
        };
        seaHexes.push(sh);
    }

    var portPool = layoutDef.ports || portTypes.base;
    assignPorts(seaHexes, landMap, portPool, rng);

    for (var i = 0; i < seaHexes.length; i++) {
        var sh = seaHexes[i];
        if (sh.port) {
            sh.tileName = 'Port (' + sh.port + ')';
            sh.label = sh.port === '3:1' ? '?' : sh.port.charAt(0).toUpperCase();
        }
        hexData.push(sh);
    }

    return hexData;
}

var layouts = {
    'standard': {
        label: 'Standard (3-4 Players)',
        rings: 2,
        pool: 'base',
        tokens: numberTokens,
        ports: portTypes.base
    },
    'expanded': {
        label: 'Expanded (5-6 Players)',
        landCoords: expandedLandCoords,
        pool: 'expanded',
        tokens: expandedTokens,
        ports: portTypes.expanded
    },
    'newWorld': {
        label: 'Seafarers: New World',
        seafarers: true
    },
    'newShores': {
        label: 'Seafarers: New Shores',
        seafarers: true
    },
    'fourIslands': {
        label: 'Seafarers: Four Islands',
        seafarers: true
    },
    'desert': {
        label: 'Seafarers: Through the Desert',
        seafarers: true
    },
    'fogIslands': {
        label: 'Seafarers: Fog Islands',
        seafarers: true
    }
};

registerGame('colony', {
    label: 'Colony',
    orientation: 'pointy',
    sizes: [
        { value: 2, label: 'Standard' }
    ],
    defaultSize: 2,
    defaultPlayers: 0,
    styles: ['classic', 'kenney', 'realistic'],
    labels: false,
    hasEditor: false,
    layouts: [
        { value: 'standard', label: 'Standard (3-4 Players)' },
        { value: 'expanded', label: 'Expanded (5-6 Players)' },
        { value: 'newWorld', label: 'Seafarers: New World' },
        { value: 'newShores', label: 'Seafarers: New Shores' },
        { value: 'fourIslands', label: 'Seafarers: Four Islands' },
        { value: 'desert', label: 'Seafarers: Through the Desert' },
        { value: 'fogIslands', label: 'Seafarers: Fog Islands' }
    ],
    defaultLayout: 'standard',

    playerCounts: function() { return []; },

    generate: function(size, players, seed, selectedLayout) {
        var layoutDef = layouts[selectedLayout] || layouts['standard'];
        if (layoutDef.seafarers) {
            return generateSeafarersMap(selectedLayout, seed);
        }
        return generateBaseMap(layoutDef, seed);
    },

    constraints: function(hexData) {
        return !hasAdjacentHighTokens(hexData);
    },

    getColors: function() {
        return classicColors;
    },

    getImages: function(style) {
        if (style === 'classic') return null;
        var base = '../';
        var folder = style === 'realistic' ? 'colony-realistic' : 'colony';
        return {
            forest: base + 'tiles/sets/' + folder + '/forest.png',
            pasture: base + 'tiles/sets/' + folder + '/pasture.png',
            fields: base + 'tiles/sets/' + folder + '/fields.png',
            hills: base + 'tiles/sets/' + folder + '/hills.png',
            mountains: base + 'tiles/sets/' + folder + '/mountains.png',
            desert: base + 'tiles/sets/' + folder + '/desert.png',
            sea: base + 'tiles/sets/' + folder + '/sea.png',
            gold: base + 'tiles/sets/' + folder + '/gold.png',
            fog: base + 'tiles/sets/' + folder + '/fog.png'
        };
    },

    rendererOptions: function() {
        return { hexSize: 50, flat: false };
    }
});
