import { registerGame } from './game-registry.js';
import { seededRandom } from './xorshift.js';
import { NukesHexData } from '../hex-data/nukes-hexes.js';

var editTypes = ['water', 'grass', 'trees', 'mount', 'sand', 'base'];

var terrainOptions = [
{ value: '', label: 'No change' },
{ value: 'grass', label: 'Fields' },
{ value: 'trees', label: 'Forests' },
{ value: 'mount', label: 'Mountains' },
{ value: 'water', label: 'Water' },
{ value: 'sand', label: 'Desert' }
];

function offsetToAxial(col, row) {
var q = col - Math.floor((row - (row & 1)) / 2);
var r = row;
return { q: q, r: r };
}

function getHexRing(id) {
if (id === 'R0') return 0;
var match = id.match(/^R(\d+)D/);
return match ? parseInt(match[1]) : -1;
}

registerGame('nukes', {
label: 'Nukes',
orientation: 'pointy',
sizes: [
    { value: 2, label: '2 Rings (12 hexes)' },
    { value: 3, label: '3 Rings (18 hexes)' },
    { value: 4, label: '4 Rings (24 hexes)' },
    { value: 5, label: '5 Rings (30 hexes)' },
    { value: 6, label: '6 Rings (36 hexes)' }
],
defaultSize: 6,
defaultPlayers: 0,
styles: ['artistic', 'classic', 'kenney', 'realistic'],
labels: false,
hasEditor: true,

playerCounts: function(size) {
    var mapData = NukesHexData.maps['r' + size];
    if (mapData && mapData.bases) {
        var counts = [0];
        Object.keys(mapData.bases).forEach(function(k) {
            counts.push(parseInt(k.substring(1)));
        });
        return counts;
    }
    return [];
},

generate: function(size, players, seed) {
    var mapDef = NukesHexData.maps['r' + size];
    if (!mapDef) return [];

    var terrains = NukesHexData.terrains;
    var hexes = [];
    var baseIds = [];

    if (players > 0 && mapDef.bases['p' + players]) {
        baseIds = mapDef.bases['p' + players];
    }

    var centreHex = mapDef.hexes.R0;
    var centreAxial = offsetToAxial(centreHex.q, centreHex.r);

    var keys = Object.keys(mapDef.hexes);
    for (var i = 0; i < keys.length; i++) {
        var id = keys[i];
        var coords = mapDef.hexes[id];
        var type;

        if (baseIds.indexOf(id) !== -1) {
            type = 'base';
        } else {
            type = terrains[seededRandom(id, seed, 0, terrains.length - 1)];
        }

        var axial = offsetToAxial(coords.q, coords.r);

        hexes.push({
            id: id,
            q: axial.q - centreAxial.q,
            r: axial.r - centreAxial.r,
            type: type,
            label: type.charAt(0).toUpperCase()
        });
    }

    return hexes;
},

getColors: function() {
    return {
        water: '#2196F3',
        trees: '#4CAF50',
        mount: '#795548',
        grass: '#8BC34A',
        sand: '#FFC107',
        base: '#F44336'
    };
},

onHexClick: function(hex) {
    var currentIdx = editTypes.indexOf(hex.type);
    var nextIdx = (currentIdx + 1) % editTypes.length;
    hex.type = editTypes[nextIdx];
    hex.label = hex.type.charAt(0).toUpperCase();
    return hex;
},

editorPanel: function(container, state) {
    container.innerHTML = '';
    for (var ring = 0; ring <= state.size; ring++) {
        var group = document.createElement('div');
        group.className = 'ring-reset-group';

        var label = document.createElement('label');
        label.textContent = ring === 0 ? 'Centre Hex' : 'Ring ' + ring;

        var select = document.createElement('select');
        select.setAttribute('data-ring', ring);

        for (var t = 0; t < terrainOptions.length; t++) {
            var opt = document.createElement('option');
            opt.value = terrainOptions[t].value;
            opt.textContent = terrainOptions[t].label;
            select.appendChild(opt);
        }

        select.addEventListener('change', function() {
            var ringNum = parseInt(this.getAttribute('data-ring'));
            var terrain = this.value;
            if (terrain) {
                state.resetRing(ringNum, terrain);
            }
        });

        group.appendChild(label);
        group.appendChild(select);
        container.appendChild(group);
    }
},

resetRing: function(ring, terrain, hexData) {
    for (var i = 0; i < hexData.length; i++) {
        var hex = hexData[i];
        var hexRing = getHexRing(hex.id);
        if (hexRing === ring) {
            hex.type = terrain;
            hex.label = terrain.charAt(0).toUpperCase();
        }
    }
},

exportForParent: function(hexData, meta) {
    var maxRing = 0;
    for (var i = 0; i < hexData.length; i++) {
        var ring = getHexRing(hexData[i].id);
        if (ring > maxRing) maxRing = ring;
    }

    var rings = [];
    for (var r = 0; r <= maxRing; r++) rings.push([]);

    for (var i = 0; i < hexData.length; i++) {
        var hex = hexData[i];
        var ringNum = getHexRing(hex.id);
        if (ringNum === 0) {
            rings[0] = [{ id: hex.id, t: hex.type }];
        } else if (ringNum > 0) {
            var match = hex.id.match(/^R\d+D(\d+)$/);
            var pos = match ? parseInt(match[1]) - 1 : rings[ringNum].length;
            rings[ringNum][pos] = { id: hex.id, t: hex.type };
        }
    }

    return rings;
},

importFromParent: function(data) {
    if (!Array.isArray(data)) return null;
    return data;
},

importMap: function(data, hexData) {
    if (!Array.isArray(data)) return null;
    for (var ring = 0; ring < data.length; ring++) {
        if (!Array.isArray(data[ring])) continue;
        for (var h = 0; h < data[ring].length; h++) {
            var entry = data[ring][h];
            for (var i = 0; i < hexData.length; i++) {
                if (hexData[i].id === entry.id) {
                    hexData[i].type = entry.t;
                    hexData[i].label = entry.t.charAt(0).toUpperCase();
                    break;
                }
            }
        }
    }
    return hexData;
},

getImages: function(style) {
    if (style === 'classic') return null;
    var base = '../';
    var folders = { artistic: 'nukes', kenney: 'nukes-kenney', realistic: 'nukes-realistic' };
    var folder = folders[style] || 'nukes';
    return {
        water: base + 'tiles/sets/' + folder + '/water.png',
        trees: base + 'tiles/sets/' + folder + '/trees.png',
        mount: base + 'tiles/sets/' + folder + '/mount.png',
        grass: base + 'tiles/sets/' + folder + '/grass.png',
        sand: base + 'tiles/sets/' + folder + '/sand.png',
        base: base + 'tiles/sets/' + folder + '/base.png'
    };
},

rendererOptions: function() {
    return { hexSize: 40, flat: false };
}
});
