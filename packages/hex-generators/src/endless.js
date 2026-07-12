import { registerGame } from './game-registry.js';
import { createSeededRng } from '../../core/src/xorshift.js';
import { EndlessSystems } from './data/endless-systems.js';
import { MongoLayout } from './data/mongo-layout.js';

var factions = [
    { id: 'republic', label: '1', name: 'Republic', region: 'Near Earth', home: 'Sol' },
    { id: 'alphas', label: '8', name: 'Alphas', region: 'Far North', home: 'Prime' },
    { id: 'syndicate', label: '4', name: 'Syndicate', region: 'The Core', home: 'Markab' },
    { id: 'freeworlds', label: '6', name: 'Free Worlds', region: 'Dirt Belt', home: 'Dabih' },
    { id: 'pirates', label: '2', name: 'Pirates', region: 'The Rim', home: 'Alkaid' },
    { id: 'remnant', label: '7', name: 'Remnant', region: 'Ember Wastes', home: 'Arculus' },
    { id: 'coalition', label: '3', name: 'Coalition', region: 'Paradise', home: 'Talita' },
    { id: 'wanderers', label: '5', name: 'Wanderers', region: 'Wanderer Space', home: "Ka'ch'chrai" }
];

var classicColors = {
    space: '#263238',
    spaceport: '#FFD700',
    homeworld: '#4CAF50',
    republic: '#1565C0',
    alphas: '#C62828',
    syndicate: '#7B1FA2',
    freeworlds: '#2E7D32',
    pirates: '#F57C00',
    remnant: '#00838F',
    coalition: '#AD1457',
    wanderers: '#4E342E'
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

function hexDistance(q1, r1, q2, r2) {
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}

function findSystem(systemData, name) {
    for (var i = 0; i < systemData.systems.length; i++) {
        if (systemData.systems[i].name === name) return systemData.systems[i];
        if (systemData.systems[i].name.indexOf(name) === 0) return systemData.systems[i];
    }
    return null;
}

function buildSystemHover(sys) {
    var text = sys.name;
    if (sys.code) text += ' [' + sys.code + ']';
    text += ' — ' + sys.region + ' (' + sys.faction + ')';
    var stats = [];
    if (sys.planets) stats.push(sys.planets + ' planets');
    if (sys.habitats) stats.push(sys.habitats + ' hab');
    if (sys.population) stats.push('pop ' + sys.population);
    if (sys.events) stats.push(sys.events + ' events');
    if (sys.wormholes && sys.wormholes !== '0') stats.push('WH: ' + sys.wormholes);
    if (stats.length) text += ' | ' + stats.join(', ');
    return text;
}

function getSystemImagePath(systemName, base) {
    var systemData = EndlessSystems || null;
    if (!systemData || !systemName) return null;
    var imgPath = systemData.images[systemName];
    if (!imgPath) return null;
    return base + 'tiles/sets/' + imgPath;
}

function generate(size, players, seed) {
    var layout = MongoLayout || null;
    var systemData = EndlessSystems || null;
    if (!layout) return [];

    var rng = createSeededRng(seed + '_endless');
    var centre = layout.centre;
    var activeFactions = players > 0 ? Math.min(players, 8) : 8;

    var factionPositions = layout.factions;
    var base = '../';

    var hexes = [];
    for (var i = 0; i < layout.hexes.length; i++) {
        var def = layout.hexes[i];
        var ring = def.id === 'R0' ? 0 : parseInt(def.id.match(/R(\d+)/)[1]);
        if (ring > 5) continue;
        var offsetCol = def.q - centre.q;
        var offsetRow = -(def.r - centre.r);
        var q = offsetCol - Math.floor((offsetRow - (offsetRow & 1)) / 2);
        var r = offsetRow;
        hexes.push({ id: def.id, q: q, r: r, origQ: def.q, origR: def.r });
    }

    var homeAxials = [];
    for (var f = 0; f < activeFactions; f++) {
        var fp = factionPositions[f];
        var offsetCol = fp.q - centre.q;
        var offsetRow = -(fp.r - centre.r);
        var hq = offsetCol - Math.floor((offsetRow - (offsetRow & 1)) / 2);
        var hr = offsetRow;
        homeAxials.push({ q: hq, r: hr, faction: factions[f] });
    }

    for (var i = 0; i < hexes.length; i++) {
        var hex = hexes[i];
        var isHome = false;
        for (var f = 0; f < homeAxials.length; f++) {
            if (hex.q === homeAxials[f].q && hex.r === homeAxials[f].r) {
                hex.faction = homeAxials[f].faction.id;
                hex.isHome = true;
                isHome = true;
                break;
            }
        }
        if (hex.origQ === centre.q && hex.origR === centre.r) {
            hex.isCentre = true;
        }
        if (!isHome && !hex.isCentre) {
            var minDist = 999;
            var closest = null;
            for (var f = 0; f < homeAxials.length; f++) {
                var d = hexDistance(hex.q, hex.r, homeAxials[f].q, homeAxials[f].r);
                if (d < minDist) { minDist = d; closest = homeAxials[f].faction.id; }
            }
            hex.faction = closest;
        }
    }

    var pools = {};
    var overflow = [];
    if (systemData) {
        for (var f = 0; f < activeFactions; f++) {
            var fid = factions[f].id;
            var regionSystems = systemData.regions[fid] ? systemData.regions[fid].slice() : [];
            var placeable = [];
            for (var j = 0; j < regionSystems.length; j++) {
                var sys = findSystem(systemData, regionSystems[j]);
                if (!sys) continue;
                if (sys.name.indexOf('Asteroid Belt') !== -1) continue;
                if (sys.name.indexOf('Space Port') !== -1) continue;
                if (sys.name === factions[f].home || sys.name.indexOf(factions[f].home) === 0) continue;
                placeable.push(sys);
            }
            shuffle(placeable, rng);
            pools[fid] = placeable.slice(0, 10);
            for (var j = 10; j < placeable.length; j++) overflow.push(placeable[j]);
        }
        for (var f = activeFactions; f < 8; f++) {
            var fid = factions[f].id;
            var regionSystems = systemData.regions[fid] ? systemData.regions[fid].slice() : [];
            for (var j = 0; j < regionSystems.length; j++) {
                var sys = findSystem(systemData, regionSystems[j]);
                if (!sys) continue;
                if (sys.name.indexOf('Asteroid Belt') !== -1) continue;
                if (sys.name.indexOf('Space Port') !== -1) continue;
                overflow.push(sys);
            }
        }
        shuffle(overflow, rng);
    }

    var priority = [];
    var rest = [];
    for (var i = 0; i < hexes.length; i++) {
        if (hexes[i].isCentre || hexes[i].isHome) priority.push(hexes[i]);
        else rest.push(hexes[i]);
    }
    shuffle(rest, rng);
    hexes = priority.concat(rest);

    var result = [];
    for (var i = 0; i < hexes.length; i++) {
        var hex = hexes[i];
        var type = hex.faction ? hex.faction : 'space';
        if (hex.isHome) type = 'homeworld';
        var label = type.charAt(0).toUpperCase();

        var system = null;
        var imagePath = null;
        if (hex.isHome) {
            var fIdx = -1;
            for (var f = 0; f < factions.length; f++) {
                if (factions[f].id === hex.faction) { fIdx = f; break; }
            }
            if (fIdx >= 0 && systemData) {
                system = findSystem(systemData, factions[fIdx].home);
            }
            label = factions[fIdx] ? factions[fIdx].label : 'H';
        } else if (hex.isCentre) {
            type = 'spaceport';
            label = 'SP';
            system = { name: 'Central Space Port', code: null, region: 'Neutral', faction: 'Shared', events: 0, planets: 0, habitats: 1, population: 0, wormholes: '0' };
            imagePath = base + 'img/tiles/endless/space_port.png';
        } else if (hex.faction && pools[hex.faction] && pools[hex.faction].length > 0) {
            system = pools[hex.faction].shift();
        } else if (overflow.length > 0) {
            system = overflow.shift();
        } else {
            for (var pk in pools) {
                if (pools[pk].length > 0) { system = pools[pk].shift(); break; }
            }
        }
        if (!imagePath && !system) {
            imagePath = base + 'img/tiles/endless/void.png';
            system = { name: 'Empty Space', region: 'Void', faction: 'None', events: 0, planets: 0, habitats: 0, population: 0, wormholes: '0' };
        }

        if (!imagePath && system) {
            if (system._empty) {
                imagePath = base + 'img/tiles/endless/void.png';
            } else {
                imagePath = getSystemImagePath(system.name, base);
            }
            if (!label || label.length <= 1) label = system.name.substring(0, 3);
        }

        var out = {
            id: hex.id,
            q: hex.q,
            r: hex.r,
            type: type,
            label: label,
            faction: hex.faction || null
        };
        if (system) out.tileName = buildSystemHover(system);
        if (imagePath) out.imagePath = imagePath;
        if (hex.isHome) {
            out.overlay = { text: label, color: '#FFFFFF', size: 0.4 };
        }

        result.push(out);
    }

    return result;
}

registerGame('endless', {
    label: 'Endless Skies',
    orientation: 'pointy',
    sizes: [
        { value: 5, label: '5 Rings (91 hexes)' }
    ],
    defaultSize: 5,
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
        if (style !== 'artistic') return null;
        var base = '../';
        var voidTile = base + 'img/tiles/endless/void.png';
        return {
            _perHex: true,
            space: voidTile,
            spaceport: base + 'img/tiles/endless/space_port.png',
            homeworld: voidTile,
            republic: voidTile,
            alphas: voidTile,
            syndicate: voidTile,
            freeworlds: voidTile,
            pirates: voidTile,
            remnant: voidTile,
            coalition: voidTile,
            wanderers: voidTile
        };
    },

    getDescriptions: function() {
        return {
            space: { name: 'Deep Space', desc: 'Uncharted void' },
            homeworld: { name: 'Homeworld', desc: 'Faction starting system' },
            republic: { name: 'Republic Space', desc: 'Near Earth sector' },
            alphas: { name: 'Alphas Space', desc: 'Far North sector' },
            syndicate: { name: 'Syndicate Space', desc: 'The Core sector' },
            freeworlds: { name: 'Free Worlds Space', desc: 'Dirt Belt sector' },
            pirates: { name: 'Pirates Space', desc: 'The Rim sector' },
            remnant: { name: 'Remnant Space', desc: 'Ember Wastes sector' },
            coalition: { name: 'Coalition Space', desc: 'Paradise sector' },
            wanderers: { name: 'Wanderer Space', desc: 'Wanderer sector' }
        };
    },

    rendererOptions: function() {
        return { hexSize: 22, flat: false };
    }
});

