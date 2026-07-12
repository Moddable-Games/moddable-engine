import { registerGame } from './game-registry.js';
import { createSeededRng } from '../../core/src/xorshift.js';
import { MongoLayout } from './data/mongo-layout.js';
import { MongoTiles } from './data/mongo-tiles.js';

var classicColors = {
    oceanic: '#1565C0',
    submerged: '#0D47A1',
    glacial: '#B3E5FC',
    volcanic: '#E65100',
    mountain: '#795548',
    woodland: '#2E7D32',
    desert: '#FFC107',
    jungle: '#388E3C',
    market: '#FFD700'
};

function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
        var j = rng.integer(0, i);
        var tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

function buildCommodityStr(tile) {
    var parts = [];
    if (tile.ice) parts.push(tile.ice + ' ice');
    if (tile.water) parts.push(tile.water + ' water');
    if (tile.food) parts.push(tile.food + ' food');
    if (tile.wood) parts.push(tile.wood + ' wood');
    if (tile.stone) parts.push(tile.stone + ' stone');
    if (tile.metal) parts.push(tile.metal + ' metal');
    if (tile.mrg) parts.push(tile.mrg + ' energy');
    if (tile.gem) parts.push(tile.gem + ' gems');
    if (parts.length === 0) return '';
    return ' | ' + parts.join(', ');
}

function buildTilePools(rng) {
    var tileData = MongoTiles || null;
    if (!tileData) return null;
    var pools = {};
    for (var i = 0; i < tileData.tiles.length; i++) {
        var t = tileData.tiles[i];
        if (!pools[t.biome]) pools[t.biome] = [];
        pools[t.biome].push(t);
    }
    for (var b in pools) shuffle(pools[b], rng);
    return pools;
}

function drawTile(pools, biome, faction, isCapital) {
    if (!pools || !pools[biome]) return null;
    var pool = pools[biome];

    if (isCapital && faction) {
        for (var i = 0; i < pool.length; i++) {
            if (pool[i].faction === faction && pool[i].id.charAt(0) === 'C') {
                return pool.splice(i, 1)[0];
            }
        }
    }

    if (faction) {
        for (var i = 0; i < pool.length; i++) {
            if (pool[i].faction === faction) {
                return pool.splice(i, 1)[0];
            }
        }
    }

    for (var i = 0; i < pool.length; i++) {
        if (!pool[i].city) {
            return pool.splice(i, 1)[0];
        }
    }
    if (pool.length > 0) return pool.splice(0, 1)[0];
    return null;
}

function generate(size, players, seed) {
    var layout = MongoLayout || null;
    if (!layout) return [];

    var rng = createSeededRng(seed + '_mongo');
    var centre = layout.centre;
    var tilePools = buildTilePools(rng);

    var factionMap = {};
    for (var i = 0; i < layout.factions.length; i++) {
        var f = layout.factions[i];
        factionMap[f.q + ',' + f.r] = f;
    }

    var hexData = [];
    for (var i = 0; i < layout.hexes.length; i++) {
        var def = layout.hexes[i];
        var offsetCol = def.q - centre.q;
        var offsetRow = -(def.r - centre.r);
        var q = offsetCol - Math.floor((offsetRow - (offsetRow & 1)) / 2);
        var r = offsetRow;
        var biome = def.biome;
        var faction = def.faction || null;
        var isCapital = !!faction;
        var factionInfo = factionMap[def.q + ',' + def.r] || null;

        var label = biome.charAt(0).toUpperCase();
        if (factionInfo) label = factionInfo.label;

        var tile = drawTile(tilePools, biome, faction, isCapital);

        var hex = {
            id: def.id,
            q: q,
            r: r,
            type: biome,
            label: label,
            faction: faction
        };

        if (tile) {
            hex.tileName = tile.name + ' [' + tile.id + '] — Pop: ' + tile.pop + buildCommodityStr(tile) + (tile.special ? ' ★ ' + tile.special : '');
            hex.tileId = tile.id;
        }
        if (factionInfo) {
            hex.overlay = { text: factionInfo.label, color: '#FFFFFF', size: 0.4 };
        }

        hexData.push(hex);
    }

    return hexData;
}

registerGame('mongo', {
    label: 'Mongo',
    orientation: 'pointy',
    sizes: [
        { value: 6, label: '6 Rings (127 hexes)' }
    ],
    defaultSize: 6,
    defaultPlayers: 8,
    styles: ['artistic', 'classic'],
    hasEditor: false,

    playerCounts: function() { return [2, 3, 4, 5, 6, 7, 8]; },

    generate: function(size, players, seed) {
        return generate(size, players, seed);
    },

    getColors: function() {
        return classicColors;
    },

    getImages: function(style) {
        if (style === 'classic') return null;
        var base = '../';
        var folders = { artistic: 'mongo' };
        var folder = folders[style];
        if (!folder) return null;
        return {
            oceanic: base + 'tiles/sets/' + folder + '/oceanic.png',
            submerged: base + 'tiles/sets/' + folder + '/submerged.png',
            glacial: base + 'tiles/sets/' + folder + '/glacial.png',
            volcanic: base + 'tiles/sets/' + folder + '/volcanic.png',
            mountain: base + 'tiles/sets/' + folder + '/mountain.png',
            woodland: base + 'tiles/sets/' + folder + '/woodland.png',
            desert: base + 'tiles/sets/' + folder + '/desert.png',
            jungle: base + 'tiles/sets/' + folder + '/jungle.png',
            market: base + 'tiles/sets/' + folder + '/market.png'
        };
    },

    getDescriptions: function() {
        return {
            oceanic: { name: 'Oceanic', desc: 'Deep ocean — naval territory' },
            submerged: { name: 'Submerged', desc: 'Shallow seas — Coralian domain' },
            glacial: { name: 'Glacial', desc: 'Ice fields — Frigian territory' },
            volcanic: { name: 'Volcanic', desc: 'Lava flows — Volcanian homeland' },
            mountain: { name: 'Mountain', desc: 'Rocky peaks — defensive terrain' },
            woodland: { name: 'Woodland', desc: 'Dense forest — Arborian realm' },
            desert: { name: 'Desert', desc: 'Arid wastes — Lionmen domain' },
            jungle: { name: 'Jungle', desc: 'Tropical growth — Tropican territory' },
            market: { name: 'Central Market', desc: "Ming's Palace — trade hub" }
        };
    },

    rendererOptions: function() {
        return { hexSize: 22, flat: false };
    }
});

