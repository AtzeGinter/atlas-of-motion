"""Soundtrack for the Atlas of Motion launch video: one piece, music and effects in D major, one shared room.
Reads sfx.json ([[time, kind], ...] written by render.js) and writes soundtrack.wav (48 kHz stereo, 16 bit)."""
import json, wave, numpy as np

SR, DUR = 48000, 22.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
BEAT, T0 = 0.6, 1.8            # 100 BPM, beat 0 = the heat reveal
def bt(b): return T0 + b * BEAT
def mf(m): return 440.0 * 2 ** ((m - 69) / 12)

def lp_mag(f, fc, n=2): return 1 / np.sqrt(1 + (f / fc) ** (2 * n))
def filt(x, lo=None, hi=None, n=2):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); g = np.ones_like(f)
    if hi: g *= lp_mag(f, hi, n)
    if lo: g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** (2 * n))
    return np.fft.irfft(X * g, len(x))

def add(buf, sig, t, gain=1.0, pan=0.0):
    i = int(round(t * SR)); j = min(N, i + len(sig))
    if j <= i: return
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[0, i:j] += sig[:j - i] * gain * l * 1.414; buf[1, i:j] += sig[:j - i] * gain * r * 1.414

def env(n, a, r_start=None, r=0.05):
    e = np.ones(n); na = max(1, int(a * SR)); e[:na] = np.linspace(0, 1, na) ** 1.5
    nr = max(1, int(r * SR)); e[-nr:] *= np.linspace(1, 0, nr) ** 2
    return e

# ---------- instruments ----------
def piano(m, dur=1.6, vel=1.0, bright=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; f = mf(m); s = np.zeros(n)
    for k in range(1, 9):
        fk = f * k * (1 + 0.0004 * k * k)
        if fk > 15000: break
        amp = (1 / k ** (1.35 / bright)) * (0.6 if k == 2 else 1)
        s += amp * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28)) * np.exp(-t * (1.6 + 0.9 * k) * (0.7 + f / 900))
    a = int(0.004 * SR); s[:a] *= np.linspace(0, 1, a)
    s *= env(n, 0.003, r=0.08)
    return s * vel * 0.22

def pad_note(m, dur, att=0.6, rel=0.9):
    n = int(dur * SR); t = np.arange(n) / SR; f = mf(m); s = np.zeros(n)
    for det in (-7, 0, 6):
        fd = f * 2 ** (det / 1200)
        for k in range(1, 7):
            s += (1 / k ** 1.6) * np.sin(2 * np.pi * fd * k * t + rng.uniform(0, 6.28))
    e = np.ones(n); na = int(att * SR); e[:na] = np.sin(np.linspace(0, np.pi / 2, na)) ** 2
    nr = int(rel * SR); e[-nr:] *= np.cos(np.linspace(0, np.pi / 2, nr)) ** 2
    return s * e * 0.05

def bass(m, dur, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; f = mf(m)
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)
    s = np.tanh(1.4 * s) * np.exp(-t * 1.8)
    return s * env(n, 0.008, r=0.08) * vel * 0.33

def kick(vel=1.0):
    n = int(0.45 * SR); t = np.arange(n) / SR
    fr = 46 + 70 * np.exp(-t * 28); ph = 2 * np.pi * np.cumsum(fr) / SR
    s = np.sin(ph) * np.exp(-t * 7.5) + 0.25 * filt(rng.standard_normal(n), lo=1500, hi=5000) * np.exp(-t * 160)
    return s * vel * 0.5

def hat(vel=1.0):
    n = int(0.09 * SR); t = np.arange(n) / SR
    return filt(rng.standard_normal(n), lo=7000, hi=14000) * np.exp(-t * 55) * vel * 0.05

def clap(vel=1.0):
    n = int(0.3 * SR); t = np.arange(n) / SR; s = filt(rng.standard_normal(n), lo=900, hi=4200)
    e = np.exp(-t * 26); e[:int(.012 * SR)] *= np.array([1 if (i // int(.004 * SR)) % 2 == 0 else .4 for i in range(int(.012 * SR))])
    return s * e * vel * 0.07

def boom(f0=55, dur=2.0, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    fr = f0 * (0.78 + 0.22 * np.exp(-t * 3)); s = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t * 1.6)
    s[:int(.01 * SR)] *= np.linspace(0, 1, int(.01 * SR))
    return s * vel * 0.55

def whoosh(dur=0.6, lo=500, hi=4500, vel=1.0):
    n = int(dur * SR); x = np.linspace(0, 1, n); s = filt(rng.standard_normal(n), lo=lo, hi=hi)
    e = np.sin(np.pi * x) ** 2.2
    return s * e * vel * 0.06

def riser(dur=1.25):
    n = int(dur * SR); x = np.linspace(0, 1, n); s = np.zeros(n)
    # noise rising in brightness: crossfade three bands
    for k, (lo, hi) in enumerate(((200, 1200), (800, 3500), (2500, 9000))):
        w = np.clip(x * 3 - k + 0.5, 0, 1) * (1 - np.clip(x * 3 - k - 1.5, 0, 1) * 0.5)
        s += filt(rng.standard_normal(n), lo=lo, hi=hi) * w
    return s * x ** 2.4 * 0.05

# ---------- harmony ----------
D, Bm, G, A = [62, 66, 69, 73], [59, 62, 66, 69], [55, 59, 62, 66], [57, 61, 64, 66]
DMAJ9 = [62, 66, 69, 73, 76]
BARS = [D, Bm, G, A, D, Bm, None, DMAJ9]        # bar 6 = G for two beats, then A

mus = np.zeros((2, N)); rev_send = np.zeros((2, N))
def put(sig, t, gain=1.0, pan=0.0, wet=0.3):
    add(mus, sig, t, gain, pan); add(rev_send, sig, t, gain * wet, pan)

# intro: A sus pad swelling into the reveal, a riser on top
for m in (57, 62, 64, 69):
    put(pad_note(m, 2.3, att=1.4, rel=0.6), 0.0, 0.9, pan=(m - 62) / 20, wet=0.5)
put(riser(1.3), T0 - 1.3, 1.0, wet=0.4)
for i, m in enumerate((76, 74)):        # two soft high notes while the question appears
    put(piano(m, 2.0, 0.55), 0.25 + i * 0.6, 1.0, pan=0.25 - i * .5, wet=0.55)

# the reveal hit
put(boom(55, 2.4, 1.0), T0, 1.0, wet=0.15)
for m in [50, 57] + D:
    put(piano(m, 3.0, 0.9), T0 + 0.005 * (m % 3), 1.0, pan=(m - 62) / 30, wet=0.45)

def chord_at(b):
    bar = int(b // 4)
    if bar == 6: return G if (b % 4) < 2 else A
    return BARS[bar] if bar < len(BARS) else DMAJ9

# pads under every bar from the reveal on
for bar in range(7):
    t = bt(bar * 4)
    if bar == 6:
        for half, ch in enumerate((G, A)):
            for m in ch: put(pad_note(m, 1.4, att=0.2, rel=0.5), t + half * 1.2, 0.8, pan=(m - 62) / 24, wet=0.5)
        continue
    for m in BARS[bar]: put(pad_note(m, 2.6, att=0.35, rel=0.6), t, 0.8 if bar else 0.6, pan=(m - 62) / 24, wet=0.5)

# piano arpeggio: quarters from the reveal, eighths from scene 3 (beat 8) to the outro (beat 28)
pattern = [0, 2, 1, 3, 2, 1, 3, 2]
for b8 in range(2, 56):
    b = b8 / 2
    if b < 8 and b8 % 2: continue          # quarters before scene 3
    ch = chord_at(b); idx = pattern[b8 % 8]; m = ch[idx % len(ch)] + 12
    vel = (0.62 if b8 % 2 == 0 else 0.42) * (0.8 if b < 8 else 1.0)
    put(piano(m, 1.2, vel, bright=1.1), bt(b), 1.0, pan=0.35 * np.sin(b8 * 0.9), wet=0.38)

# groove from scene 3 (beat 8) to the outro (beat 28)
for b in range(8, 28):
    ch = chord_at(b); root = {id(D): 38, id(Bm): 35, id(G): 31, id(A): 33}.get(id(ch), 38)
    if b % 2 == 0: put(kick(0.9 if b % 4 == 0 else 0.7), bt(b), 1.0, wet=0.06)
    put(bass(root, 0.55, 0.9 if b % 2 == 0 else 0.6), bt(b), 1.0, wet=0.05)
    if b >= 15 and b % 2 == 1: put(clap(0.8), bt(b), 1.0, pan=0.0, wet=0.45)
    for h in (0.5,):
        put(hat(0.8 if b >= 15 else 0.55), bt(b + h), 1.0, pan=0.3, wet=0.2)
    if b >= 15: put(hat(0.35), bt(b), 1.0, pan=-0.3, wet=0.2)
# a soft lift into the outro
put(riser(1.1), bt(28) - 1.1, 0.7, wet=0.5)

# outro: resolving chord, then a slow falling motif, long tail
put(boom(49, 3.0, 0.7), bt(28), 1.0, wet=0.2)
for m in [38, 50] + DMAJ9:
    put(piano(m, 3.4, 0.85), bt(28) + 0.004 * (m % 4), 1.0, pan=(m - 62) / 30, wet=0.55)
for m in DMAJ9: put(pad_note(m, 3.4, att=0.3, rel=1.6), bt(28), 0.9, pan=(m - 62) / 24, wet=0.6)
for i, m in enumerate((81, 78, 74, 69)):
    put(piano(m, 2.4, 0.5 - i * 0.06), bt(29) + i * 0.6, 1.0, pan=0.3 - i * 0.2, wet=0.6)

# ---------- effects (same key, same room, tucked under the music) ----------
sfx = json.load(open("sfx.json"))
for t, kind in sfx:
    if kind == "click":
        put(piano(86, 0.5, 0.42, bright=1.6), t, 1.0, pan=0.15, wet=0.35)               # D6 pluck
        put(filt(rng.standard_normal(int(.012 * SR)), lo=2500, hi=8000) * np.exp(-np.arange(int(.012 * SR)) / SR * 400) * 0.05, t, 1.0, wet=0.1)
    elif kind == "tick":
        put(piano(81, 0.35, 0.3, bright=1.6), t, 1.0, pan=-0.15, wet=0.3)                # A5
    elif kind == "key":
        n = int(.02 * SR); s = filt(rng.standard_normal(n), lo=1800, hi=6000) * np.exp(-np.arange(n) / SR * 260)
        put(s * 0.035, t, 1.0, pan=rng.uniform(-.2, .2), wet=0.15)
    elif kind in ("dip", "dipsoft"):
        put(whoosh(0.62 if kind == "dip" else 0.5, vel=1.0 if kind == "dip" else 0.7), t - 0.05, 1.0, wet=0.5)
    elif kind == "lift":
        for i, m in enumerate((81, 86)): put(piano(m, 1.2, 0.36, bright=1.4), t + i * 0.12, 1.0, pan=.2 - i * .4, wet=0.5)

# ---------- room: one shared reverb ----------
L = int(2.4 * SR); tt = np.arange(L) / SR
ir = np.zeros((2, L))
for c in range(2):
    nz = rng.standard_normal(L) * np.exp(-tt * 6.9 / 1.9)
    nz = filt(nz, lo=180, hi=6500); pre = int(0.018 * SR)
    ir[c, pre:] = nz[:L - pre]
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True)) * 3.2
wet = np.zeros((2, N))
for c in range(2):
    n2 = 1 << int(np.ceil(np.log2(N + L)))
    wet[c] = np.fft.irfft(np.fft.rfft(rev_send[c], n2) * np.fft.rfft(ir[c], n2), n2)[:N]
mix = mus + wet * 1.1

# ---------- master: gentle top roll-off, low cut, soft limiting, fade ----------
for c in range(2): mix[c] = filt(mix[c], lo=28, hi=14000, n=1)
rms = np.sqrt((mix ** 2).mean()); mix *= 10 ** (-17 / 20) / rms
mix = np.tanh(mix * 1.15) / 1.15
mix *= 10 ** (-1 / 20) / np.abs(mix).max()
fade = np.ones(N); nf = int(0.9 * SR); fade[-nf:] = np.cos(np.linspace(0, np.pi / 2, nf)) ** 2
mix *= fade
pcm = (np.clip(mix.T, -1, 1) * 32767).astype("<i2")
with wave.open("soundtrack.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("rms dBFS", round(20 * np.log10(np.sqrt((mix ** 2).mean())), 1), "peak", round(20 * np.log10(np.abs(mix).max()), 2))
