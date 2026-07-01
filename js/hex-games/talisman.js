import { registerGame } from './game-registry.js';
import { createSeededRng } from './xorshift.js';
import { HexMath } from './hex-math.js';

var ringTypes = { 1: 'inner', 2: 'middle', 3: 'river', 4: 'outer', 5: 'dungeon' };

var terrainPools = {
inner: [
    'mines', 'den', 'death', 'crypt', 'vampire', 'pits',
    'peril', 'fire'
],
middle: [
    'runes', 'runes', 'runes',
    'temple', 'cave', 'chasm', 'castle', 'woods', 'portal', 'hills', 'glade', 'knight'
],
river: [
    'desert', 'desert', 'desert', 'desert', 'desert', 'desert',
    'river', 'river', 'river', 'river', 'river',
    'river', 'river', 'river', 'river', 'river',
    'oasis', 'valley'
],
outer: [
    'fields', 'fields', 'fields', 'fields', 'fields', 'fields',
    'plains', 'plains', 'plains', 'plains',
    'woods', 'woods', 'woods',
    'hills', 'hills',
    'forest', 'graveyard', 'crags', 'sentinel', 'ruins',
    'city', 'village', 'tavern', 'chapel'
],
dungeon: [
    'cavern', 'cavern', 'cavern', 'cavern',
    'corridor', 'corridor', 'corridor', 'corridor', 'corridor', 'corridor',
    'tunnel', 'tunnel', 'tunnel', 'tunnel', 'tunnel', 'tunnel',
    'vault', 'vault', 'vault',
    'cell', 'entrance', 'guard', 'hall', 'kitchen', 'library',
    'monster', 'summon', 'torture', 'treasure', 'mountains'
],
ending: [
    'crown', 'battle', 'dragon', 'guild', 'eagle', 'demon', 'doom'
]
};

var classicColors = {
plains: '#C8E6C9', fields: '#DCEDC8', woods: '#81C784', hills: '#A5D6A7',
forest: '#388E3C', graveyard: '#78909C', crags: '#8D6E63', sentinel: '#B0BEC5',
ruins: '#BCAAA4', city: '#90A4AE', village: '#A1887F', tavern: '#D7CCC8',
chapel: '#CE93D8', river: '#42A5F5', desert: '#FFE0B2', oasis: '#80DEEA',
valley: '#C5E1A5', runes: '#D1C4E9', temple: '#E1BEE7', cave: '#616161',
chasm: '#455A64', castle: '#B0BEC5', portal: '#7E57C2', glade: '#81C784',
knight: '#FFB74D', mines: '#5D4037', den: '#4E342E', death: '#212121',
crypt: '#37474F', vampire: '#880E4F', pits: '#3E2723', peril: '#E65100',
fire: '#FF6F00', cavern: '#424242', corridor: '#616161', tunnel: '#757575',
vault: '#FFC107', cell: '#455A64', entrance: '#78909C', guard: '#546E7A',
hall: '#607D8B', kitchen: '#8D6E63', library: '#5C6BC0', monster: '#B71C1C',
summon: '#6A1B9A', torture: '#4A148C', treasure: '#FFC107', mountains: '#795548',
crown: '#FFD700', battle: '#C62828', dragon: '#FF6F00', guild: '#1565C0',
eagle: '#0277BD', demon: '#880E4F', doom: '#311B92'
};

function buildHexes(rings, seed) {
var hexes = [];
var rng = createSeededRng(seed + '_talisman_' + rings);
var grid = HexMath.generateHexGrid(rings);

var pools = {};
for (var key in terrainPools) {
    pools[key] = terrainPools[key].slice();
}

function drawTile(pool) {
    if (pool.length === 0) return 'plains';
    var idx = rng.integer(0, pool.length - 1);
    return pool.splice(idx, 1)[0];
}

for (var i = 0; i < grid.length; i++) {
    var h = grid[i];
    var type;
    if (h.ring === 0) {
        type = drawTile(pools.ending);
    } else {
        var ringName = ringTypes[h.ring] || 'outer';
        type = drawTile(pools[ringName]);
    }
    hexes.push({
        id: 'R' + h.ring + 'D' + i,
        q: h.q,
        r: h.r,
        type: type,
        label: type.substring(0, 3).charAt(0).toUpperCase() + type.substring(1, 3),
        tileName: type.charAt(0).toUpperCase() + type.slice(1)
    });
}

return hexes;
}

var descriptions = {
plains:    { name: 'Plains', desc: 'draw one card' },
fields:    { name: 'Fields', desc: 'draw one card' },
woods:     { name: 'Woods', desc: 'draw one card' },
hills:     { name: 'Hills', desc: 'draw one card' },
forest:    { name: 'Forest', desc: 'roll D6' },
graveyard: { name: 'Graveyard', desc: 'based on alignment' },
crags:     { name: 'Crags', desc: 'roll D6' },
sentinel:  { name: 'Sentinel', desc: 'strength 9 to cross to middle' },
ruins:     { name: 'Ruins', desc: 'draw two cards' },
city:      { name: 'City', desc: 'enchantress, doctor or alchemist' },
village:   { name: 'Village', desc: 'blacksmith, healer or mystic' },
tavern:    { name: 'Tavern', desc: 'roll D6' },
chapel:    { name: 'Chapel', desc: 'based on alignment' },
desert:    { name: 'Desert', desc: 'cannot cross without water bottle' },
river:     { name: 'River', desc: 'cannot cross without raft' },
oasis:     { name: 'Oasis', desc: 'draw 2 cards / outward only' },
valley:    { name: 'Hidden Valley', desc: 'draw 3 cards / outward only' },
runes:     { name: 'Runes', desc: 'draw one card +2 for enemies' },
temple:    { name: 'Temple', desc: 'roll 2D6' },
cave:      { name: "Warlock's Cave", desc: 'draw quest card' },
chasm:     { name: 'Chasm', desc: 'roll D6(s)' },
castle:    { name: 'Castle', desc: 'heal for gold' },
portal:    { name: 'Portal of Power', desc: 'access inner region' },
glade:     { name: 'Cursed Glade', desc: 'draw one card - no magic allowed' },
knight:    { name: 'Black Knight', desc: 'pay one gold or one life' },
mines:     { name: 'Mines', desc: 'roll 3D6 minus craft' },
den:       { name: "Werewolve's Den", desc: 'fight werewolf (roll 2D6 strength)' },
death:     { name: 'Death', desc: 'roll 2D6 vs Death' },
crypt:     { name: 'Crypt', desc: 'roll 3D6 minus strength' },
vampire:   { name: "Vampire's Tower", desc: 'roll D6 lose life' },
pits:      { name: 'Pits', desc: 'fight pit fiends (roll D6 for count, S4 each)' },
peril:     { name: 'Plains of Peril', desc: 'stop here, one space per turn' },
fire:      { name: 'Valley of Fire', desc: 'must have talisman to enter' },
cavern:    { name: 'Cavern', desc: 'draw two cards' },
corridor:  { name: 'Corridor', desc: 'draw one card' },
tunnel:    { name: 'Tunnel', desc: 'draw one card' },
vault:     { name: 'Vault', desc: 'draw three cards' },
cell:      { name: 'Cell', desc: 'leave follower / take follower' },
entrance:  { name: 'Dungeon Entrance', desc: 'draw two cards' },
guard:     { name: 'Guard Room', desc: 'bribe guard (2G) or fight (S5)' },
hall:      { name: 'Hall of Darkness', desc: 'roll d6 next turn' },
kitchen:   { name: 'Kitchen', desc: 'you may roll a d6' },
library:   { name: 'Library', desc: 'roll d6' },
monster:   { name: 'Monster Pit', desc: 'roll d6' },
summon:    { name: 'Summoning Circle', desc: 'move closest enemy' },
torture:   { name: 'Torture Chamber', desc: 'pay 1G or lose one S or C' },
treasure:  { name: 'Treasure Chamber', desc: 'fight lord of darkness (S12/C12)' },
mountains: { name: 'Mountains', desc: 'cannot enter or pass through' },
crown:     { name: 'Crown of Command', desc: 'cast command spell' },
battle:    { name: 'Battle Royale', desc: 'last player standing wins' },
dragon:    { name: 'Dragon King', desc: 'fight dragon king' },
guild:     { name: "Thieves Guild", desc: 'steal from all players' },
eagle:     { name: 'Eagle King', desc: 'gain followers' },
demon:     { name: 'Demon Lord', desc: 'fight demon lord' },
doom:      { name: 'Hand of Doom', desc: 'all players roll fate' }
};

registerGame('talisman', {
label: 'Talisman',
orientation: 'pointy',
sizes: [
    { value: 4, label: '4 Rings (Standard)' },
    { value: 5, label: '5 Rings (Dungeon Expansion)' }
],
defaultSize: 4,
defaultPlayers: 0,
styles: ['artistic', 'classic', 'kenney', 'realistic'],
hasEditor: false,

playerCounts: function() { return []; },

generate: function(size, players, seed) {
    return buildHexes(size, seed);
},

getColors: function() {
    return classicColors;
},

getImages: function(style) {
    if (style === 'classic') return null;
    var base = '../';
    var folders = { artistic: 'talisman', kenney: 'talisman-kenney', realistic: 'talisman-realistic' };
    var folder = folders[style] || 'talisman';
    var allTiles = {};
    var allTypes = Object.keys(classicColors);
    for (var i = 0; i < allTypes.length; i++) {
        allTiles[allTypes[i]] = base + 'tiles/sets/' + folder + '/' + allTypes[i] + '.png';
    }
    return allTiles;
},

getDescriptions: function() {
    return descriptions;
},

rendererOptions: function() {
    return { hexSize: 40, flat: false };
}
});
