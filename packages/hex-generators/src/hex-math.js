function axialToPixelPointy(q, r, size) {
    var x = size * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
    var y = size * (3 / 2 * r);
    return { x: x, y: y };
}

function axialToPixelFlat(q, r, size) {
    var x = size * (3 / 2 * q);
    var y = size * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
    return { x: x, y: y };
}

function hexCornerPointy(cx, cy, size, i) {
    var angleDeg = 60 * i - 30;
    var angleRad = Math.PI / 180 * angleDeg;
    return {
        x: cx + size * Math.cos(angleRad),
        y: cy + size * Math.sin(angleRad)
    };
}

function hexCornerFlat(cx, cy, size, i) {
    var angleDeg = 60 * i;
    var angleRad = Math.PI / 180 * angleDeg;
    return {
        x: cx + size * Math.cos(angleRad),
        y: cy + size * Math.sin(angleRad)
    };
}

function getHexCorners(cx, cy, size, flat) {
    var corners = [];
    for (var i = 0; i < 6; i++) {
        if (flat) {
            corners.push(hexCornerFlat(cx, cy, size, i));
        } else {
            corners.push(hexCornerPointy(cx, cy, size, i));
        }
    }
    return corners;
}

function generateRing(ring) {
    if (ring === 0) return [{ q: 0, r: 0 }];
    var results = [];
    var directions = [
        { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
        { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }
    ];
    var hex = { q: ring, r: -ring };
    hex = { q: hex.q + directions[4].q * ring, r: hex.r + directions[4].r * ring };
    hex = { q: ring, r: 0 };

    hex = { q: 0, r: -ring };
    for (var i = 0; i < 6; i++) {
        for (var j = 0; j < ring; j++) {
            results.push({ q: hex.q, r: hex.r });
            hex = { q: hex.q + directions[i].q, r: hex.r + directions[i].r };
        }
    }
    return results;
}

function generateHexGrid(rings) {
    var hexes = [];
    for (var ring = 0; ring <= rings; ring++) {
        if (ring === 0) {
            hexes.push({ q: 0, r: 0, ring: 0 });
        } else {
            var ringHexes = generateRing(ring);
            for (var i = 0; i < ringHexes.length; i++) {
                ringHexes[i].ring = ring;
                hexes.push(ringHexes[i]);
            }
        }
    }
    return hexes;
}

function axialDistance(a, b) {
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

function getNeighbors(q, r) {
    var directions = [
        { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
        { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
    ];
    return directions.map(function(d) {
        return { q: q + d.q, r: r + d.r };
    });
}

export var HexMath = {
    axialToPixelPointy: axialToPixelPointy,
    axialToPixelFlat: axialToPixelFlat,
    getHexCorners: getHexCorners,
    generateRing: generateRing,
    generateHexGrid: generateHexGrid,
    axialDistance: axialDistance,
    getNeighbors: getNeighbors
};
