"""Render the app icon (a muscle belly with fibres and tendons) to icons/*.png and icons/icon.svg.
One-off generator; its outputs are committed and are not part of the CI pipeline. Needs numpy (already a build.py dependency).
python icons.py  (run from tools/)"""
import os, zlib, struct, math
import numpy as np
here = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(here, '..', 'icons')
os.makedirs(out, exist_ok=True)

BG = (0xf3, 0xee, 0xe4)   # --bg (light theme paper)
FG = (0x8e, 0x2a, 0x1e)   # --accent (oxblood)
ANG = 35                  # tilt of the muscle axis, degrees (counter-clockwise on screen)
L, W = 140, 84            # half-length and half-thickness of the belly (512 units)
TEND0, TEND1, TENDR = L - 6, L + 60, 9   # tendon capsule: from, to, radius
FIB = (-0.55, 0, 0.55); FIBA = 0.7 * L; FIBW = 8   # fibre offsets (fraction of local half-thickness), half-extent, stroke width

def svg_mark(scale, bg_corner, size=512, bg=True):
    """SVG document for the icon. bg_corner: corner radius of the background in 512 units (0 = full bleed, None = no background)."""
    p = []
    if bg_corner is not None:
        p.append('<rect width="512" height="512" rx="%g" fill="#%02x%02x%02x"/>' % (bg_corner, *BG))
    p.append('<g transform="translate(256 256) rotate(-%d) scale(%g)">' % (ANG, scale))
    p.append('<path d="M%d 0Q0 %d %d 0Q0 %d %d 0Z" fill="#%02x%02x%02x"/>' % (-L, 2 * W, L, -2 * W, -L, *FG))
    p.append('<path d="M%d 0H%d M%d 0H%d" stroke="#%02x%02x%02x" stroke-width="%d" stroke-linecap="round" fill="none"/>' % (TEND0, TEND1, -TEND0, -TEND1, *FG, 2 * TENDR))
    for k in FIB:
        c = k * W; ya = c * (1 - (FIBA / L) ** 2); yc = c * (1 + (FIBA / L) ** 2)
        p.append('<path d="M%g %gQ0 %g %g %g" stroke="#%02x%02x%02x" stroke-width="%d" fill="none"/>' % (-FIBA, ya, yc, FIBA, ya, *BG, FIBW))
    p.append('</g>')
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="%d" height="%d">%s</svg>\n' % (size, size, ''.join(p))

def render(size, scale, corner, alpha, ss=4):
    """Rasterise with ss x ss supersampling. corner: background corner radius in 512 units; alpha: transparent outside the rounded square."""
    n = size * ss
    c = (np.arange(n) + 0.5) / n * 512 - 256
    dx, dy = np.meshgrid(c, c)
    a = math.radians(ANG)
    u = (dx * math.cos(a) - dy * math.sin(a)) / scale   # along the muscle axis
    v = (dx * math.sin(a) + dy * math.cos(a)) / scale   # across it
    au = np.abs(u)
    w = W * np.clip(1 - (u / L) ** 2, 0, None)
    belly = (au <= L) & (np.abs(v) <= w)
    t = np.clip(au, TEND0, TEND1)
    tend = (au - t) ** 2 + v ** 2 <= TENDR ** 2
    fg = belly | tend
    for k in FIB:
        fg &= ~((au <= FIBA) & (np.abs(v - k * w) <= FIBW / 2 * np.sqrt(1 + (2 * k * W * u / L ** 2) ** 2)))
    img = np.empty((n, n, 3), np.float64); img[:] = BG
    img[fg] = FG
    cov = np.ones((n, n))
    if alpha:
        r = corner; q = np.abs(np.stack([dx, dy])) - (256 - r)
        d = np.hypot(np.clip(q[0], 0, None), np.clip(q[1], 0, None)) + np.minimum(np.maximum(q[0], q[1]), 0) - r
        cov = (d <= 0).astype(np.float64)
    def down(x): return x.reshape(size, ss, size, ss, *x.shape[2:]).mean(axis=(1, 3))
    rgb = down(img * cov[..., None]); cv = down(cov)
    rgb = np.where(cv[..., None] > 0, rgb / np.maximum(cv[..., None], 1e-9), 0)
    if not alpha: return np.clip(rgb + .5, 0, 255).astype(np.uint8), None
    return np.clip(rgb + .5, 0, 255).astype(np.uint8), np.clip(cv * 255 + .5, 0, 255).astype(np.uint8)

def png(path, rgb, a=None):
    h, w = rgb.shape[:2]
    if a is None: raw = np.concatenate([np.zeros((h, 1), np.uint8), rgb.reshape(h, w * 3)], axis=1); ct = 2
    else: raw = np.concatenate([np.zeros((h, 1), np.uint8), np.concatenate([rgb, a[..., None]], axis=2).reshape(h, w * 4)], axis=1); ct = 6
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, ct, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw.tobytes(), 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data); print(os.path.basename(path), len(data), 'bytes')

CORNER = 112
for name, size in (('icon-192.png', 192), ('icon-512.png', 512), ('favicon-32.png', 32)):
    png(os.path.join(out, name), *render(size, 0.95, CORNER, True))
png(os.path.join(out, 'icon-maskable-512.png'), *render(512, 0.8, 0, False))   # full bleed; mark inside the 80% safe circle
png(os.path.join(out, 'apple-touch-icon.png'), *render(180, 0.9, 0, False))   # iOS applies its own mask
open(os.path.join(out, 'icon.svg'), 'w', newline='\n').write(svg_mark(0.95, CORNER))
print('icon.svg written')
