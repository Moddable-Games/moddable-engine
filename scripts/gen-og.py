#!/usr/bin/env python3
"""Generate OG images (1200x630) for engine.moddable.games.

Blueprint/schematic aesthetic matching moddable-rules style.
One image per page, type-differentiated schematics.

Usage: python3 scripts/gen-og.py
Requires: pip install Pillow
"""

import os
import math
import random
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1200, 630
BG = (10, 13, 42)

ACCENTS = {
    'engine': {'primary': (64, 192, 96), 'secondary': (40, 150, 70)},
    'play': {'primary': (224, 64, 64), 'secondary': (180, 40, 40)},
    'create': {'primary': (160, 112, 208), 'secondary': (120, 80, 180)},
    'boards': {'primary': (45, 212, 191), 'secondary': (20, 160, 150)},
    'pieces': {'primary': (194, 158, 96), 'secondary': (150, 120, 70)},
    'tiles': {'primary': (64, 160, 224), 'secondary': (40, 120, 180)},
    'docs': {'primary': (232, 228, 223), 'secondary': (138, 133, 126)},
}

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(SCRIPT_DIR)


def load_font(size, bold=False):
    paths = [
        '/System/Library/Fonts/Supplemental/Helvetica Neue.ttc',
        '/System/Library/Fonts/Helvetica.ttc',
        '/System/Library/Fonts/SFNSText.ttf',
    ]
    for p in paths:
        if not os.path.exists(p):
            continue
        try:
            idx = 4 if bold and p.endswith('.ttc') else 0
            return ImageFont.truetype(p, size, index=idx)
        except (OSError, IndexError):
            try:
                return ImageFont.truetype(p, size, index=0)
            except OSError:
                continue
    return ImageFont.load_default()


def draw_base_grid(draw, colors):
    pr, pg, pb = colors['primary']
    br, bg_, bb = BG
    mr = int(br + (pr - br) * 0.04)
    mg = int(bg_ + (pg - bg_) * 0.04)
    mb = int(bb + (pb - bb) * 0.04)
    grid_color = (mr, mg, mb)
    Mr = int(br + (pr - br) * 0.08)
    Mg = int(bg_ + (pg - bg_) * 0.08)
    Mb = int(bb + (pb - bb) * 0.08)
    grid_color_major = (Mr, Mg, Mb)
    for x in range(0, WIDTH, 30):
        c = grid_color_major if x % 150 == 0 else grid_color
        draw.line([(x, 0), (x, HEIGHT)], fill=c, width=1)
    for y in range(0, HEIGHT, 30):
        c = grid_color_major if y % 150 == 0 else grid_color
        draw.line([(0, y), (WIDTH, y)], fill=c, width=1)


def draw_registration_marks(draw, colors):
    mark_color = (*colors['primary'], 80)
    mark_len = 30
    inset = 40
    corners = [
        (inset, inset),
        (WIDTH - inset, inset),
        (inset, HEIGHT - inset),
        (WIDTH - inset, HEIGHT - inset),
    ]
    for cx, cy in corners:
        draw.line([(cx - mark_len, cy), (cx + mark_len, cy)],
                  fill=mark_color, width=1)
        draw.line([(cx, cy - mark_len), (cx, cy + mark_len)],
                  fill=mark_color, width=1)


def draw_dimension_lines(draw, colors, seed=0):
    random.seed(seed + 77)
    dim_color = (*colors['secondary'], 35)
    arrow_color = (*colors['primary'], 50)
    y_pos = HEIGHT - 60
    x1 = random.randint(600, 700)
    x2 = random.randint(900, 1050)
    draw.line([(x1, y_pos), (x2, y_pos)], fill=dim_color, width=1)
    draw.line([(x1, y_pos - 5), (x1, y_pos + 5)], fill=arrow_color, width=1)
    draw.line([(x2, y_pos - 5), (x2, y_pos + 5)], fill=arrow_color, width=1)
    x_pos = WIDTH - 60
    y1 = random.randint(80, 150)
    y2 = random.randint(250, 400)
    draw.line([(x_pos, y1), (x_pos, y2)], fill=dim_color, width=1)
    draw.line([(x_pos - 5, y1), (x_pos + 5, y1)], fill=arrow_color, width=1)
    draw.line([(x_pos - 5, y2), (x_pos + 5, y2)], fill=arrow_color, width=1)


def draw_board_schematic(draw, colors, seed=0):
    random.seed(seed + 10)
    ox, oy = 750, 120
    cell = 45
    rows, cols = 6, 6
    outline_color = (*colors['primary'], 12)
    fill_color = (*colors['primary'], 3)
    for r in range(rows):
        for c in range(cols):
            x = ox + c * cell
            y = oy + r * cell
            draw.rectangle([(x, y), (x + cell, y + cell)],
                           outline=outline_color)
            if (r + c) % 2 == 0:
                draw.rectangle([(x + 1, y + 1), (x + cell - 1, y + cell - 1)],
                               fill=fill_color)
    for i in range(3):
        r, c = random.randint(0, rows - 1), random.randint(0, cols - 1)
        cx = ox + c * cell + cell // 2
        cy = oy + r * cell + cell // 2
        draw.ellipse([(cx - 8, cy - 8), (cx + 8, cy + 8)],
                     outline=(*colors['primary'], 35), width=2)


def draw_hex_schematic(draw, colors, seed=0):
    random.seed(seed + 50)
    ox, oy = 780, 130
    size = 28
    for row in range(5):
        for col in range(4):
            cx = ox + col * size * 1.75 + (row % 2) * size * 0.875
            cy = oy + row * size * 1.5
            points = []
            for i in range(6):
                angle = math.pi / 3 * i - math.pi / 6
                px = cx + size * 0.85 * math.cos(angle)
                py = cy + size * 0.85 * math.sin(angle)
                points.append((px, py))
            draw.polygon(points, outline=(*colors['primary'], 20))
    for _ in range(4):
        cx = ox + random.randint(0, 180)
        cy = oy + random.randint(0, 200)
        draw.ellipse([(cx - 6, cy - 6), (cx + 6, cy + 6)],
                     fill=(*colors['primary'], 25))


def draw_topology_schematic(draw, colors, seed=0):
    random.seed(seed + 30)
    nodes = []
    for i in range(9):
        x = random.randint(700, 1100)
        y = random.randint(100, 500)
        nodes.append((x, y))
    line_color = (*colors['primary'], 15)
    node_color = (*colors['primary'], 30)
    for i in range(len(nodes)):
        for j in range(i + 1, len(nodes)):
            dist = math.hypot(nodes[i][0] - nodes[j][0],
                              nodes[i][1] - nodes[j][1])
            if dist < 200:
                draw.line([nodes[i], nodes[j]], fill=line_color, width=1)
    for x, y in nodes:
        r = random.randint(4, 9)
        draw.ellipse([(x - r, y - r), (x + r, y + r)],
                     outline=node_color, width=2)


def draw_piece_schematic(draw, colors, seed=0):
    random.seed(seed + 60)
    ox, oy = 780, 140
    for i in range(12):
        x = ox + (i % 4) * 80 + random.randint(-10, 10)
        y = oy + (i // 4) * 110 + random.randint(-10, 10)
        r = random.randint(12, 22)
        draw.ellipse([(x - r, y - r), (x + r, y + r)],
                     outline=(*colors['primary'], 30), width=2)
        inner_r = r - 5
        if inner_r > 4:
            draw.ellipse([(x - inner_r, y - inner_r), (x + inner_r, y + inner_r)],
                         outline=(*colors['primary'], 15), width=1)


def draw_gear_schematic(draw, colors, seed=0):
    random.seed(seed + 70)
    cx, cy = 900, 300
    outer_r = 100
    inner_r = 60
    teeth = 12
    points = []
    for i in range(teeth * 2):
        angle = math.pi * 2 * i / (teeth * 2)
        r = outer_r if i % 2 == 0 else inner_r
        px = cx + r * math.cos(angle)
        py = cy + r * math.sin(angle)
        points.append((px, py))
    draw.polygon(points, outline=(*colors['primary'], 20), width=1)
    draw.ellipse([(cx - 20, cy - 20), (cx + 20, cy + 20)],
                 outline=(*colors['primary'], 25), width=2)


def draw_doc_schematic(draw, colors, seed=0):
    random.seed(seed + 80)
    ox, oy = 760, 120
    line_color = (*colors['primary'], 18)
    for i in range(12):
        y = oy + i * 32
        w = random.randint(120, 300)
        draw.line([(ox, y), (ox + w, y)], fill=line_color, width=2)
        if i % 4 == 0:
            draw.rectangle([(ox - 12, y - 3), (ox - 4, y + 3)],
                           fill=(*colors['primary'], 30))


SCHEMATIC_MAP = {
    'engine': draw_topology_schematic,
    'play': draw_board_schematic,
    'create': draw_gear_schematic,
    'boards': draw_board_schematic,
    'pieces': draw_piece_schematic,
    'tiles': draw_hex_schematic,
    'docs': draw_doc_schematic,
}


def base_image(page_type='engine', seed=0):
    img = Image.new('RGBA', (WIDTH, HEIGHT), (*BG, 255))
    draw = ImageDraw.Draw(img, 'RGBA')
    colors = ACCENTS[page_type]
    draw_base_grid(draw, colors)
    draw_registration_marks(draw, colors)
    draw_dimension_lines(draw, colors, seed=seed)
    schematic_fn = SCHEMATIC_MAP.get(page_type, draw_topology_schematic)
    schematic_fn(draw, colors, seed=seed)
    return img


def wrap_text(text, font, max_width):
    words = text.split()
    lines = []
    current = ''
    for word in words:
        test = (current + ' ' + word).strip()
        bbox = font.getbbox(test)
        if bbox[2] > max_width and current:
            lines.append(current)
            current = word
        else:
            current = test
    if current:
        lines.append(current)
    return lines


def add_text(img, eyebrow, title, subtitle='', page_type='engine'):
    draw = ImageDraw.Draw(img)
    colors = ACCENTS[page_type]
    y_cursor = 200
    if eyebrow:
        font_eyebrow = load_font(13, bold=True)
        draw.text((80, y_cursor), eyebrow.upper(),
                  fill=(*colors['primary'], 200), font=font_eyebrow)
        y_cursor += 36
    font_title = load_font(48, bold=True)
    lines = wrap_text(title, font_title, 620)
    for line in lines:
        draw.text((80, y_cursor), line,
                  fill=(240, 237, 232, 255), font=font_title)
        y_cursor += 60
    if subtitle:
        y_cursor += 8
        font_sub = load_font(18)
        sub_lines = wrap_text(subtitle, font_sub, 600)
        for line in sub_lines:
            draw.text((80, y_cursor), line,
                      fill=(138, 133, 126, 230), font=font_sub)
            y_cursor += 26
    draw.rectangle([(80, 560), (260, 563)], fill=(*colors['primary'], 180))
    font_url = load_font(12)
    draw.text((WIDTH - 250, 568), 'engine.moddable.games',
              fill=(90, 86, 80, 180), font=font_url)
    pill_font = load_font(10, bold=True)
    pill_text = page_type.upper()
    pill_bbox = pill_font.getbbox(pill_text)
    pill_w = pill_bbox[2] - pill_bbox[0] + 16
    pill_x = WIDTH - pill_w - 55
    pill_y = 45
    draw.rounded_rectangle(
        [(pill_x, pill_y), (pill_x + pill_w, pill_y + 22)],
        radius=3, outline=(*colors['primary'], 80))
    draw.text((pill_x + 8, pill_y + 4), pill_text,
              fill=(*colors['primary'], 200), font=pill_font)
    return img


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.convert('RGB').save(path, 'PNG', optimize=True)
    size_kb = os.path.getsize(path) // 1024
    print(f'  {os.path.relpath(path, ROOT)} ({size_kb}KB)')


PAGES = [
    {
        'slug': 'home',
        'type': 'engine',
        'eyebrow': 'Universal Game Engine',
        'title': 'Moddable Engine',
        'subtitle': 'Any game. Any topology. Zero game-specific code.',
    },
    {
        'slug': 'play',
        'type': 'play',
        'eyebrow': 'Interactive Boards',
        'title': 'Play',
        'subtitle': 'Select any game, see its board rendered live with pieces and interaction.',
    },
    {
        'slug': 'create',
        'type': 'create',
        'eyebrow': 'Game Builder',
        'title': 'Create',
        'subtitle': 'Build your own game variant. Select topology, configure rules, export config.',
    },
    {
        'slug': 'boards',
        'type': 'boards',
        'eyebrow': 'Board Gallery',
        'title': 'Every Board',
        'subtitle': '375 variants across 42 families. SVG and PNG export for all boards.',
    },
    {
        'slug': 'pieces',
        'type': 'pieces',
        'eyebrow': 'Piece Gallery',
        'title': 'Every Piece Set',
        'subtitle': '112 piece sets across 13 game families. Recolorable SVGs.',
    },
    {
        'slug': 'tiles',
        'type': 'tiles',
        'eyebrow': 'Tile Gallery',
        'title': 'Game Tiles',
        'subtitle': 'Hex, square, and rectangle tiles. Terrain, mahjong, star systems, and more.',
    },
    {
        'slug': 'docs',
        'type': 'docs',
        'eyebrow': 'Documentation',
        'title': 'Engine Docs',
        'subtitle': 'Frontmatter schema, topology reference, render pipeline, plugin system.',
    },
    {
        'slug': 'docs-frontmatter',
        'type': 'docs',
        'eyebrow': 'Documentation',
        'title': 'Frontmatter Schema',
        'subtitle': 'How to write engine: blocks in game variant frontmatter.',
    },
    {
        'slug': 'docs-topologies',
        'type': 'docs',
        'eyebrow': 'Documentation',
        'title': 'Topologies',
        'subtitle': 'Grid, hex, track, pit, and graph. The universal adapter layer.',
    },
    {
        'slug': 'docs-surfaces',
        'type': 'docs',
        'eyebrow': 'Documentation',
        'title': 'Surfaces',
        'subtitle': 'Board surfaces as a resource type. Frame, surface, divider, generators.',
    },
    {
        'slug': 'docs-pieces',
        'type': 'docs',
        'eyebrow': 'Documentation',
        'title': 'Piece Sets',
        'subtitle': '112 sets with SVG rendering, recolouring, and composition fallback.',
    },
    {
        'slug': 'docs-plugins',
        'type': 'docs',
        'eyebrow': 'Documentation',
        'title': 'Plugins',
        'subtitle': '13 plugin families. Chess, go, draughts, reversi, mancala, and more.',
    },
    {
        'slug': 'docs-render-pipeline',
        'type': 'docs',
        'eyebrow': 'Documentation',
        'title': 'Render Pipeline',
        'subtitle': 'Layer-compositing SVG renderer. Board, topology, pieces, highlights.',
    },
]


def generate_all():
    print('Generating OG images for engine.moddable.games...')
    count = 0
    for page in PAGES:
        seed = hash(page['slug']) % 10000
        img = base_image(page['type'], seed=seed)
        add_text(img, page['eyebrow'], page['title'],
                 page['subtitle'], page['type'])
        save(img, os.path.join(ROOT, 'og', f'{page["slug"]}.png'))
        count += 1
    print(f'\nDone. Generated {count} OG images.')


if __name__ == '__main__':
    generate_all()
