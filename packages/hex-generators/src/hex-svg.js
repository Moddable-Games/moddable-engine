import { HexMath } from './hex-math.js';

function isLightColor(hex) {
    var c = hex.replace('#', '');
    if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
    var r = parseInt(c.substring(0, 2), 16);
    var g = parseInt(c.substring(2, 4), 16);
    var b = parseInt(c.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 180;
}

var DEFAULTS = {
    hexSize: 30,
    flat: false,
    colors: {},
    images: null,
    imageMode: 'none',
    strokeColor: 'rgba(0,0,0,0.3)',
    strokeWidth: 1,
    labels: false,
    padding: 15,
    bgColor: null,
    scaleFactor: 0.95
};

var ANNOTATION_STYLES = {
    valid: { stroke: '#2aaa10', strokeWidth: 2.5 },
    blocked: { color: '#c03030', strokeWidth: 2.8 },
    selected: { stroke: '#c9a84c', strokeWidth: 3 },
    friendly: { stroke: '#c9a84c', strokeWidth: 3 }
};

function merge(defaults, overrides) {
    var result = {};
    for (var k in defaults) result[k] = defaults[k];
    if (overrides) {
        for (var k2 in overrides) result[k2] = overrides[k2];
    }
    return result;
}

function hexCenter(hex, opts) {
    if (opts.flat) {
        return HexMath.axialToPixelFlat(hex.q, hex.r, opts.hexSize);
    }
    return HexMath.axialToPixelPointy(hex.q, hex.r, opts.hexSize);
}

function hexPoints(cx, cy, opts) {
    var corners = HexMath.getHexCorners(cx, cy, opts.hexSize * opts.scaleFactor, opts.flat);
    return corners.map(function(c) {
        return c.x.toFixed(2) + ',' + c.y.toFixed(2);
    }).join(' ');
}

function computeViewBox(hexes, opts) {
    var minX = Infinity, maxX = -Infinity;
    var minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < hexes.length; i++) {
        var pos = hexCenter(hexes[i], opts);
        if (pos.x < minX) minX = pos.x;
        if (pos.x > maxX) maxX = pos.x;
        if (pos.y < minY) minY = pos.y;
        if (pos.y > maxY) maxY = pos.y;
    }
    var pad = opts.hexSize + opts.padding;
    return {
        x: minX - pad,
        y: minY - pad,
        w: (maxX - minX) + pad * 2,
        h: (maxY - minY) + pad * 2
    };
}

function getColor(hex, opts) {
    if (opts.colors && opts.colors[hex.type]) {
        return opts.colors[hex.type];
    }
    return '#666';
}

function renderHexes(hexes, opts) {
    var svg = '';
    for (var i = 0; i < hexes.length; i++) {
        var hex = hexes[i];
        var pos = hexCenter(hex, opts);
        var points = hexPoints(pos.x, pos.y, opts);
        var fill = getColor(hex, opts);

        svg += '<polygon points="' + points + '" ';
        svg += 'fill="' + fill + '" ';
        svg += 'stroke="' + opts.strokeColor + '" ';
        svg += 'stroke-width="' + opts.strokeWidth + '"';
        svg += ' data-q="' + hex.q + '" data-r="' + hex.r + '"';
        if (hex.type) svg += ' data-type="' + hex.type + '"';
        if (hex.id) svg += ' data-id="' + hex.id + '"';
        if (hex.tileName) svg += ' data-name="' + hex.tileName.replace(/"/g, '&quot;') + '"';
        svg += ' class="hex-cell"';
        svg += '/>\n';

        var hexImgHref = (opts.images && opts.images[hex.type]) ? opts.images[hex.type] : (hex.imagePath || null);
        if (hexImgHref && opts.imageMode !== 'none') {
            var imgSize = opts.hexSize * 2 * opts.scaleFactor;
            var clipId = 'clip-' + hex.q + '-' + hex.r;
            svg += '<clipPath id="' + clipId + '">';
            svg += '<polygon points="' + points + '"/>';
            svg += '</clipPath>\n';
            var href = hexImgHref;
            if (opts.imageMode === 'embed' && hex._dataUri) {
                href = hex._dataUri;
            }
            svg += '<image href="' + href + '" ';
            svg += 'x="' + (pos.x - imgSize / 2).toFixed(2) + '" ';
            svg += 'y="' + (pos.y - imgSize / 2).toFixed(2) + '" ';
            svg += 'width="' + imgSize.toFixed(2) + '" ';
            svg += 'height="' + imgSize.toFixed(2) + '" ';
            svg += 'clip-path="url(#' + clipId + ')" ';
            svg += 'pointer-events="none" ';
            svg += 'preserveAspectRatio="xMidYMid slice"/>\n';
        }

        if (opts.labels && hex.label) {
            svg += '<text x="' + pos.x.toFixed(2) + '" y="' + (pos.y + 4).toFixed(2) + '" ';
            svg += 'text-anchor="middle" font-size="' + (opts.hexSize * 0.4).toFixed(1) + '" ';
            svg += 'pointer-events="none" fill="#fff" font-family="sans-serif">';
            svg += hex.label + '</text>\n';
        }

        if (hex.overlay) {
            var r = opts.hexSize * (hex.overlay.size || 0.35);
            var oColor = hex.overlay.color || '#C62828';
            svg += '<circle cx="' + pos.x.toFixed(2) + '" cy="' + pos.y.toFixed(2) + '" ';
            svg += 'r="' + r.toFixed(2) + '" fill="' + oColor + '" ';
            svg += 'pointer-events="none" stroke="#fff" stroke-width="1.5"/>\n';
            if (hex.overlay.text) {
                var textFill = isLightColor(oColor) ? '#333' : '#fff';
                svg += '<text x="' + pos.x.toFixed(2) + '" y="' + (pos.y + r * 0.35).toFixed(2) + '" ';
                svg += 'text-anchor="middle" font-size="' + (r * 1.2).toFixed(1) + '" ';
                svg += 'pointer-events="none" fill="' + textFill + '" font-weight="bold" font-family="sans-serif">';
                svg += hex.overlay.text + '</text>\n';
            }
        }
    }
    return svg;
}

function renderAnnotations(hexes, annotations, opts) {
    if (!annotations) return '';
    var svg = '<g class="annotations">\n';

    if (annotations.highlights) {
        for (var i = 0; i < annotations.highlights.length; i++) {
            var h = annotations.highlights[i];
            var pos = hexCenter(h, opts);
            var style = ANNOTATION_STYLES[h.style] || ANNOTATION_STYLES.valid;
            var insetSize = opts.hexSize * opts.scaleFactor * 0.87;
            var corners = HexMath.getHexCorners(pos.x, pos.y, insetSize, opts.flat);
            var points = corners.map(function(c) {
                return c.x.toFixed(2) + ',' + c.y.toFixed(2);
            }).join(' ');

            if (h.style === 'blocked') {
                var sz = opts.hexSize * 0.35;
                svg += '<line x1="' + (pos.x - sz).toFixed(2) + '" y1="' + (pos.y - sz).toFixed(2) + '" ';
                svg += 'x2="' + (pos.x + sz).toFixed(2) + '" y2="' + (pos.y + sz).toFixed(2) + '" ';
                svg += 'stroke="' + style.color + '" stroke-width="' + style.strokeWidth + '"/>\n';
                svg += '<line x1="' + (pos.x + sz).toFixed(2) + '" y1="' + (pos.y - sz).toFixed(2) + '" ';
                svg += 'x2="' + (pos.x - sz).toFixed(2) + '" y2="' + (pos.y + sz).toFixed(2) + '" ';
                svg += 'stroke="' + style.color + '" stroke-width="' + style.strokeWidth + '"/>\n';
            } else {
                svg += '<polygon points="' + points + '" fill="none" ';
                svg += 'stroke="' + style.stroke + '" stroke-width="' + style.strokeWidth + '"/>\n';
            }
        }
    }

    if (annotations.tokens) {
        for (var t = 0; t < annotations.tokens.length; t++) {
            var tok = annotations.tokens[t];
            var tpos = hexCenter(tok, opts);
            var tr = opts.hexSize * 0.28;
            svg += '<circle cx="' + tpos.x.toFixed(2) + '" cy="' + tpos.y.toFixed(2) + '" ';
            svg += 'r="' + tr.toFixed(2) + '" fill="' + (tok.color || '#1c4a4a') + '" ';
            svg += 'stroke="' + (tok.stroke || '#fff') + '" stroke-width="1.5"/>\n';
            if (tok.label) {
                svg += '<text x="' + tpos.x.toFixed(2) + '" y="' + (tpos.y + tr * 0.35).toFixed(2) + '" ';
                svg += 'text-anchor="middle" font-size="' + (tr * 1.1).toFixed(1) + '" ';
                svg += 'fill="#fff" font-weight="bold" font-family="sans-serif">';
                svg += tok.label + '</text>\n';
            }
        }
    }

    if (annotations.arrows) {
        svg += '<defs><marker id="arrowhead" markerWidth="8" markerHeight="6" ';
        svg += 'refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" ';
        svg += 'fill="#2aaa10"/></marker></defs>\n';
        for (var a = 0; a < annotations.arrows.length; a++) {
            var arr = annotations.arrows[a];
            var fromPos = hexCenter(arr.from, opts);
            var toPos = hexCenter(arr.to, opts);
            var color = arr.color || '#2aaa10';
            var dashAttr = arr.style === 'dashed' ? ' stroke-dasharray="6,4"' : '';
            svg += '<line x1="' + fromPos.x.toFixed(2) + '" y1="' + fromPos.y.toFixed(2) + '" ';
            svg += 'x2="' + toPos.x.toFixed(2) + '" y2="' + toPos.y.toFixed(2) + '" ';
            svg += 'stroke="' + color + '" stroke-width="2" marker-end="url(#arrowhead)"';
            svg += dashAttr + '/>\n';
        }
    }

    svg += '</g>\n';

    if (annotations.legend && annotations.legend.length > 0) {
        var vb = computeViewBox(hexes, opts);
        var legendY = vb.y + vb.h - opts.padding + 5;

        var totalW = 0;
        for (var m = 0; m < annotations.legend.length; m++) {
            totalW += 20 + annotations.legend[m].text.length * 6 + 15;
        }
        totalW -= 15;
        var startX = (vb.w - totalW) / 2;

        svg += '<g class="legend" transform="translate(' + vb.x.toFixed(2) + ',' + legendY.toFixed(2) + ')">\n';
        var lx = startX;
        for (var l = 0; l < annotations.legend.length; l++) {
            var leg = annotations.legend[l];
            var legStyle = ANNOTATION_STYLES[leg.style] || ANNOTATION_STYLES.valid;
            if (leg.style === 'blocked') {
                svg += '<line x1="' + lx + '" y1="2" x2="' + (lx + 10) + '" y2="12" stroke="' + legStyle.color + '" stroke-width="2"/>\n';
                svg += '<line x1="' + (lx + 10) + '" y1="2" x2="' + lx + '" y2="12" stroke="' + legStyle.color + '" stroke-width="2"/>\n';
            } else {
                svg += '<rect x="' + lx + '" y="2" width="14" height="10" fill="none" stroke="' + (legStyle.stroke || '#2aaa10') + '" stroke-width="2"/>\n';
            }
            lx += 20;
            svg += '<text x="' + lx + '" y="11" font-size="10" fill="#aaa" font-family="sans-serif">' + leg.text + '</text>\n';
            lx += leg.text.length * 6 + 15;
        }
        svg += '</g>\n';
    }

    return svg;
}

export var HexSvg = {
    toSVG: toSVG,
    toAnnotatedSVG: toAnnotatedSVG
};

function toSVG(hexes, options) {
    var opts = merge(DEFAULTS, options);
    var vb = computeViewBox(hexes, opts);
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" ';
    svg += 'viewBox="' + vb.x.toFixed(2) + ' ' + vb.y.toFixed(2) + ' ' + vb.w.toFixed(2) + ' ' + vb.h.toFixed(2) + '" ';
    svg += 'width="' + Math.round(vb.w) + '" height="' + Math.round(vb.h) + '">\n';
    if (opts.bgColor) {
        svg += '<rect x="' + vb.x.toFixed(2) + '" y="' + vb.y.toFixed(2) + '" ';
        svg += 'width="' + vb.w.toFixed(2) + '" height="' + vb.h.toFixed(2) + '" fill="' + opts.bgColor + '"/>\n';
    }
    svg += renderHexes(hexes, opts);
    svg += '</svg>';
    return svg;
}

function toAnnotatedSVG(hexes, annotations, options) {
    var opts = merge(DEFAULTS, options);
    var legendExtra = (annotations && annotations.legend && annotations.legend.length > 0) ? 25 : 0;
    var vb = computeViewBox(hexes, opts);
    vb.h += legendExtra;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" ';
    svg += 'viewBox="' + vb.x.toFixed(2) + ' ' + vb.y.toFixed(2) + ' ' + vb.w.toFixed(2) + ' ' + vb.h.toFixed(2) + '" ';
    svg += 'width="' + Math.round(vb.w) + '" height="' + Math.round(vb.h) + '">\n';
    if (opts.bgColor) {
        svg += '<rect x="' + vb.x.toFixed(2) + '" y="' + vb.y.toFixed(2) + '" ';
        svg += 'width="' + vb.w.toFixed(2) + '" height="' + vb.h.toFixed(2) + '" fill="' + opts.bgColor + '"/>\n';
    }
    svg += renderHexes(hexes, opts);
    svg += renderAnnotations(hexes, annotations, opts);
    svg += '</svg>';
    return svg;
}
