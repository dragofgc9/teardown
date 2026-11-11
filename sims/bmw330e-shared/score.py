"""Sound for the 330e tunnel film: the B48 at a steady cruise inside a concrete tube, then the car coming apart.

    python run_sfx.py sims/bmw330e-shared/score.py

The car bus (engine, tyres, wind, e-motor whine) goes through a long, dark reverb, because a tunnel is mostly
reflections. As the body panels come off, the engine's filter opens: the shell was what kept it muffled. The jet fans
overhead pass at the times the film places them. From the pull's start every part makes a sound as it leaves, picked
by what it is: steel panels clank and whoosh, seats thud, engine parts clink, cables crack, wheels drop, springs ring.

Times and the drive mirror bmw330e-shared/film.js (the pull order from live.js ORDER, fans from tunnel.place()).
"""

import math
import os
import random

from sfx.dsp import add, onepole_hp, reverb, svf, zeros
from sfx.score_kit import env_fade, hz, thud
from sfx.synth import SR, bandnoise, impact, pad, riser, whoosh

TIMELINE = "../bmw330e-film/timeline.json"
OUT = os.path.join(os.environ.get("TEARDOWN_OUT", "teardown-out"), "bmw330e-score.wav")
TARGET_LUFS = -15.0
SEED = 330

# live.js ORDER, with what each part is made of
ORDER = [
    ("hood", "panel"), ("trunk", "panel"), ("roof", "glass"), ("doorFL", "panel"), ("doorFR", "panel"), ("doorRL", "panel"),
    ("doorRR", "panel"), ("bumperF", "plastic"), ("bumperR", "plastic"),
    ("seatFL", "soft"), ("seatFR", "soft"), ("seatR", "soft"), ("dash", "soft"), ("steer", "soft"),
    ("cover", "clink"), ("valvetrain", "clink"), ("head", "heavy"), ("intake", "plastic"), ("turbo", "clink"), ("liners", "clink"),
    ("rods", "clink"), ("crank", "heavy"), ("pan", "clink"), ("cooling", "plastic"),
    ("gearbox", "heavy"), ("converter", "clink"), ("k0", "clink"), ("rotor", "clink"), ("stator", "heavy"),
    ("cables", "zap"), ("eme", "zap"), ("port", "zap"), ("pack", "heavy"), ("exhaust", "clink"), ("tank", "plastic"),
    ("prop", "clink"), ("diff", "heavy"), ("halfshafts", "clink"),
    ("brakeFL", "clink"), ("brakeFR", "clink"), ("brakeRL", "clink"), ("brakeRR", "clink"),
    ("wheelFL", "wheel"), ("wheelFR", "wheel"), ("wheelRL", "wheel"), ("wheelRR", "wheel"),
    ("suspFL", "spring"), ("suspFR", "spring"), ("suspRL", "spring"), ("suspRR", "spring"),
    ("subF", "heavy"), ("subR", "heavy"), ("floor", "panel"),
]


def smooth(x):
    u = min(1.0, max(0.0, x))
    return u * u * (3 - 2 * u)


def ring(freqs, dur, tau, level=1.0):
    """An inharmonic metal ring: a struck plate or bracket."""
    n = int(dur * SR)
    out = zeros(n)
    for j, f in enumerate(freqs):
        w = 2 * math.pi * f / SR
        g = level / (1 + j * 0.6)
        d = tau * SR / (1 + j * 0.8)
        add(out, [g * math.sin(w * k) * math.exp(-k / d) * min(1.0, k / 24) for k in range(n)])
    return out


def burst(dur, fc, level=1.0, tau=0.02, q=0.7):
    """A short band of noise: scrape, latch, crackle."""
    n = int(dur * SR)
    x = bandnoise(n, lambda k: fc, q=q)
    return [level * x[k] * math.exp(-k / (tau * SR)) * min(1.0, k / 30) for k in range(n)]


def part_sound(kind, rnd):
    """What a part sounds like as it lets go: (mono samples, gain)."""
    r = 0.9 + 0.2 * rnd.random()
    if kind == "panel":
        x = ring([310 * r, 857 * r, 1693 * r, 2911 * r], 0.9, 0.22, 0.6)
        add(x, thud(78 * r, 0.09, 0.4), 0, 0.9)
        add(x, burst(0.12, 2400, 0.8, 0.03))
        add(x, whoosh(0.75, 260, 2600, peak=0.35), int(0.02 * SR), 0.5)
        return x, 0.5
    if kind == "glass":
        x = ring([1210 * r, 2870 * r, 4420 * r], 0.9, 0.3, 0.35)
        add(x, thud(64, 0.12, 0.5), 0, 0.9)
        add(x, whoosh(1.0, 200, 2200, peak=0.4), 0, 0.6)
        return x, 0.5
    if kind == "plastic":
        x = thud(120 * r, 0.05, 0.25)
        add(x, burst(0.08, 1300 * r, 0.9, 0.018, 0.6))
        add(x, whoosh(0.5, 300, 1800, peak=0.3), 0, 0.35)
        return x, 0.36
    if kind == "soft":
        x = thud(92 * r, 0.07, 0.35)
        add(x, burst(0.1, 500, 0.5, 0.04, 0.5))
        return x, 0.3
    if kind == "clink":
        x = ring([1850 * r, 4130 * r, 6020 * r], 0.35, 0.07, 0.5)
        add(x, burst(0.03, 5200, 0.6, 0.004))
        return x, 0.17
    if kind == "heavy":
        x = ring([182 * r, 507 * r, 1121 * r], 0.8, 0.18, 0.5)
        add(x, thud(55 * r, 0.14, 0.6), 0, 1.0)
        add(x, burst(0.06, 900, 0.7, 0.02))
        return x, 0.42
    if kind == "zap":
        n = int(0.22 * SR)
        x = [rnd.uniform(-1, 1) * (1.0 if rnd.random() < 0.08 else 0.12) * math.exp(-k / (0.06 * SR)) for k in range(n)]
        x = svf(x, 3600, 0.8, "bp")
        add(x, ring([1460, 2920], 0.25, 0.05, 0.2))
        return x, 0.3
    if kind == "wheel":
        x = thud(48 * r, 0.16, 0.6)
        add(x, burst(0.12, 260, 1.2, 0.05, 0.5))
        return x, 0.5
    # spring
    n = int(0.7 * SR)
    f0 = 360 * r
    x = [0.5 * math.sin(2 * math.pi * f0 * (k / SR) * (1 + 0.04 * math.exp(-k / (0.1 * SR)))) * math.exp(-k / (0.16 * SR)) * (1 + 0.3 * math.sin(2 * math.pi * 23 * k / SR)) for k in range(n)]
    add(x, ring([2600 * r], 0.2, 0.04, 0.3))
    return x, 0.24


def score(mix, tl):
    dur = tl["duration"]
    n = int(dur * SR)
    rnd = random.Random(SEED)
    pull = tl["pull"]
    t_pull = pull["start"]
    t_open = t_pull + pull["span"]
    v = tl["speed_kmh"] / 3.6
    fire = tl["engine_rpm"] / 60 * 2  # four cylinders, two firings per crank turn

    # ---- the engine: one pulse per firing, cylinders a little unequal, the period jittering by a few per cent
    eng = zeros(n)
    cyl_gain = (1.0, 0.86, 0.95, 0.9)
    pulse_n = int(0.05 * SR)
    t, i = 0.0, 0
    while t < dur:
        g = cyl_gain[i % 4] * (0.92 + 0.16 * rnd.random())
        f = 105 + 20 * rnd.random()
        p = [g * (math.sin(2 * math.pi * f * k / SR) * math.exp(-k / (0.011 * SR)) + 0.5 * rnd.uniform(-1, 1) * math.exp(-k / (0.004 * SR))) for k in range(pulse_n)]
        add(eng, p, int(t * SR))
        t += (1 / fire) * (1 + 0.018 * (rnd.random() - 0.5))
        i += 1
    # the steady orders under it: half order (crank), second (firing), fourth
    w = 2 * math.pi * fire / SR
    add(eng, [0.18 * math.sin(0.5 * w * k) + 0.45 * math.sin(w * k) + 0.16 * math.sin(2 * w * k + 0.7) for k in range(n)])
    # the body comes off and the engine comes out from behind it: the filter opens over the pull
    eng = svf(eng, lambda k: 520 + 2800 * smooth((k / SR - t_pull) / (t_open - t_pull)) ** 1.5, 0.75, "lp", 64)
    eng = onepole_hp(eng, 28)
    # e-motor on the crank: a thin whine, louder once its housing is out
    wh = 2 * math.pi * tl["engine_rpm"] / 60 * 48 / SR
    whine = [(0.02 + 0.05 * smooth((k / SR - 4.2) / 1.0)) * (math.sin(wh * k) + 0.3 * math.sin(2 * wh * k)) for k in range(n)]

    # ---- tyres on concrete and the air: noise beds, the roar breathing a little at the lamp pitch (the ribs and lamp
    # housings bounce it back once per pitch)
    lamp_hz = v / tl["lamp_pitch_m"]
    roar = bandnoise(n, lambda k: 380, q=0.55)
    rumble = svf([rnd.uniform(-1, 1) for _ in range(n)], 110, 0.9, "lp")
    wind = bandnoise(n, lambda k: 1600, q=0.5)
    road = [(0.5 * roar[k] + 1.1 * rumble[k]) * (1 + 0.07 * math.sin(2 * math.pi * lamp_hz * k / SR)) + 0.12 * wind[k] for k in range(n)]

    car = [1.0 * eng[k] + whine[k] + 0.8 * road[k] for k in range(n)]
    car = env_fade(car, 0.25, 0.02)
    # the bed ducks under the impact and comes back as the parts fly
    duck = lambda t: 1.0 - 0.45 * math.exp(-((t - t_pull - 0.25) ** 2) / 0.18)
    car = [car[k] * duck(k / SR) for k in range(n)]
    wl, wr = reverb(car, size=0.88, damp=0.62, scale=1.7)
    mix.put(0, car, 0.2)
    mix.put_stereo(0, wl, wr, 0.24)

    # ---- the jet fans overhead, where tunnel.place() puts them: z = mod(100 + 99 i - d, 198) - 60 crosses zero
    for i in range(2):
        d = (40 + 99 * i) % 198
        t_pass = d / v
        if 0.4 < t_pass < dur - 0.4:
            x = bandnoise(int(1.6 * SR), lambda k: 900 - 500 * (k / (1.6 * SR)), q=0.8)
            hum = [0.4 * math.sin(2 * math.pi * (148 - 30 * smooth(k / (1.6 * SR))) * k / SR) for k in range(len(x))]
            x = [(x[k] * 1.4 + hum[k]) * math.exp(-((k / SR - 0.8) ** 2) / 0.09) for k in range(len(x))]
            fl, fr = reverb(x, size=0.8, damp=0.5, scale=1.4)
            mix.put(t_pass - 0.8, x, 0.22, -0.2)
            mix.put_stereo(t_pass - 0.8, fl, fr, 0.2)

    # ---- music: a dark minor bed, quiet while the car cruises, opening up as it comes apart
    vol = lambda t: 0.25 + 0.75 * smooth((t - t_pull + 0.8) / 2.0)
    chords = [(0.0, [hz("D2"), hz("A2"), hz("F3"), hz("C4")]), (t_pull, [hz("Bb1"), hz("F2"), hz("D3"), hz("A3")]), (7.2, [hz("G1"), hz("D2"), hz("Bb2"), hz("F3"), hz("A3")])]
    pl, pr = pad(dur, chords, volume=vol, detune=0.9, tremolo=0.17)
    pl = svf(pl, 1500, 0.7)
    pr = svf(pr, 1500, 0.7)
    mix.put_stereo(0, env_fade(pl, 1.5, 0.6), env_fade(pr, 1.5, 0.6), 0.05)

    # ---- the pull: one riser into it, one impact on it, then every part in order
    mix.put(t_pull - 1.2, riser(1.2, 180, 4200), 0.12)
    mix.put(t_pull, impact(1.4), 0.5)
    k_last = len(ORDER) - 1
    for i, (pid, kind) in enumerate(ORDER):
        t0 = t_pull + (i / k_last) * pull["span"]
        x, g = part_sound(kind, rnd)
        pan = 0.35 if pid.endswith("L") else -0.35 if pid.endswith("R") and pid[-2] in "FR" else (rnd.random() - 0.5) * 0.3
        mix.put(t0 + 0.012, x, g, pan)
        rl, rr = reverb(x, size=0.75, damp=0.5, scale=1.3)
        mix.put_stereo(t0 + 0.012, rl, rr, g * 0.35)
    # the last parts settle: a few small ticks thinning out
    for j in range(14):
        t0 = t_open + 0.1 + (j ** 1.5) * 0.09 + rnd.random() * 0.05
        if t0 < dur - 0.4:
            mix.put(t0, ring([2400 + 1800 * rnd.random(), 5300], 0.2, 0.04, 0.4), 0.05 * (1 - j / 14), (rnd.random() - 0.5) * 0.8)
