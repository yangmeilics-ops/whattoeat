#!/usr/bin/env python3
"""生成 tabBar 图标（纯 Python，无第三方依赖）。

用法：python3 tools/gen_icons.py
输出：images/tab-*.png（81×81，两套颜色：暖灰 = 未选中，番茄红 = 选中）
"""
import math
import os
import struct
import zlib

SIZE = 81          # 最终尺寸
S = 4              # 超采样倍数（抗锯齿）
C = SIZE * S       # 画布尺寸

INACTIVE = (139, 117, 105)   # 未选中：暖灰
ACTIVE = (201, 80, 59)       # 选中：番茄红

OUT_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'images'))


class Icon:
    """二值覆盖图：1 = 该像素有颜色，0 = 透明。坐标基于 C×C 画布。"""

    def __init__(self):
        self.grid = [[0] * C for _ in range(C)]

    def _set(self, x, y, on):
        if 0 <= x < C and 0 <= y < C:
            self.grid[y][x] = 1 if on else 0

    def circle(self, cx, cy, r, on=True):
        for y in range(int(cy - r) - 1, int(cy + r) + 2):
            for x in range(int(cx - r) - 1, int(cx + r) + 2):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    self._set(x, y, on)

    def ring(self, cx, cy, ro, ri, on=True):
        for y in range(int(cy - ro) - 1, int(cy + ro) + 2):
            for x in range(int(cx - ro) - 1, int(cx + ro) + 2):
                d2 = (x - cx) ** 2 + (y - cy) ** 2
                if ri * ri <= d2 <= ro * ro:
                    self._set(x, y, on)

    def rect(self, x0, y0, x1, y1, on=True):
        for y in range(max(0, int(y0)), min(C, int(math.ceil(y1)))):
            for x in range(max(0, int(x0)), min(C, int(math.ceil(x1)))):
                self._set(x, y, on)

    def round_rect(self, x0, y0, x1, y1, r, on=True):
        for y in range(max(0, int(y0)), min(C, int(math.ceil(y1)) + 1)):
            for x in range(max(0, int(x0)), min(C, int(math.ceil(x1)) + 1)):
                if self._in_round_rect(x + 0.5, y + 0.5, x0, y0, x1, y1, r):
                    self._set(x, y, on)

    @staticmethod
    def _in_round_rect(px, py, x0, y0, x1, y1, r):
        if not (x0 <= px <= x1 and y0 <= py <= y1):
            return False
        cx = min(max(px, x0 + r), x1 - r)
        cy = min(max(py, y0 + r), y1 - r)
        return (px - cx) ** 2 + (py - cy) ** 2 <= r * r

    def polygon(self, pts, on=True):
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        for y in range(max(0, int(min(ys))), min(C, int(max(ys)) + 2)):
            for x in range(max(0, int(min(xs))), min(C, int(max(xs)) + 2)):
                if self._in_poly(x + 0.5, y + 0.5, pts):
                    self._set(x, y, on)

    @staticmethod
    def _in_poly(px, py, pts):
        inside = False
        j = len(pts) - 1
        for i in range(len(pts)):
            xi, yi = pts[i]
            xj, yj = pts[j]
            if (yi > py) != (yj > py):
                xint = (xj - xi) * (py - yi) / (yj - yi) + xi
                if px < xint:
                    inside = not inside
            j = i
        return inside

    def segment(self, p, q, w, on=True):
        r = w / 2.0
        for y in range(max(0, int(min(p[1], q[1]) - r) - 1), min(C, int(max(p[1], q[1]) + r) + 2)):
            for x in range(max(0, int(min(p[0], q[0]) - r) - 1), min(C, int(max(p[0], q[0]) + r) + 2)):
                if self._dist_seg(x + 0.5, y + 0.5, p, q) <= r:
                    self._set(x, y, on)

    @staticmethod
    def _dist_seg(px, py, p, q):
        vx, vy = q[0] - p[0], q[1] - p[1]
        wx, wy = px - p[0], py - p[1]
        l2 = vx * vx + vy * vy
        if l2 == 0:
            return math.hypot(wx, wy)
        t = max(0.0, min(1.0, (wx * vx + wy * vy) / l2))
        return math.hypot(px - (p[0] + t * vx), py - (p[1] + t * vy))


def draw_home():
    i = Icon()
    i.round_rect(50, 50, 274, 274, 45)
    for x, y in [(104,104),(220,104),(162,162),(104,220),(220,220)]:
        i.circle(x, y, 20, on=False)
    return i


def draw_dish():
    i = Icon()
    i.round_rect(62, 38, 262, 286, 24)
    i.round_rect(82, 58, 242, 266, 10, on=False)
    for y in [108, 162, 216]:
        i.circle(111, y, 12)
        i.segment((150,y), (213,y), 16)
    return i


def draw_clock():
    i = Icon()
    i.ring(162, 162, 120, 94)                        # 表盘
    i.segment((162, 160), (162, 92), 20)             # 分针
    i.segment((162, 162), (208, 190), 20)            # 时针
    i.circle(162, 162, 17)                           # 圆心
    return i


def render(icon, color):
    rows = []
    for fy in range(SIZE):
        row = bytearray()
        for fx in range(SIZE):
            acc = 0
            for dy in range(S):
                line = icon.grid[fy * S + dy]
                for dx in range(S):
                    acc += line[fx * S + dx]
            a = int(round(acc / (S * S) * 255))
            row += bytes((color[0], color[1], color[2], a))
        rows.append(bytes(row))
    return rows


def write_png(path, rows):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b''.join(b'\x00' + r for r in rows)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', SIZE, SIZE, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, drawer in [('home', draw_home), ('dish', draw_dish), ('clock', draw_clock)]:
        for suffix, color in [('', INACTIVE), ('-active', ACTIVE)]:
            path = os.path.join(OUT_DIR, 'tab-{}{}.png'.format(name, suffix))
            write_png(path, render(drawer(), color))
            print('生成', path)


if __name__ == '__main__':
    main()
