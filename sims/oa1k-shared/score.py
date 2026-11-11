"""Score for the OA-1K Skyraider II film, in D minor: a wide pad under the pass with the turboprop's drone and wind,
one riser into a single low impact as the aircraft comes apart, a drum and a rising note for each of the eight systems
over a quiet tick, a whoosh through the rebuild that lands on a D major bell chord, and the engine back for the exit.

    python run_sfx.py sims/oa1k-shared/score.py

Every time comes from oa1k-film/timeline.json. The engine's pitch mirrors film.js's live(t).
"""

import os

from sfx.score_kit import airy, hz, rattle, rumble, thud
from sfx.synth import bass, blip, chime, envelope, hat, impact, pad, riser, whoosh

TIMELINE = "../oa1k-film/timeline.json"
OUT = os.path.join(os.environ.get("TEARDOWN_OUT", "teardown-out"), "oa1k-score.wav")
TARGET_LUFS = -14.0
SEED = 62

SYSTEMS = ("powerplant", "fuselage", "cockpit", "wing", "tail", "gear", "stores", "mission")
CLIMB = ("D4", "F4", "G4", "A4", "C5", "D5", "F5", "A5")


def notes(names):
    return [hz(n) for n in names.split()]


def smooth(x):
    u = min(1.0, max(0.0, x))
    return u * u * (3 - 2 * u)


def score(mix, tl):
    dur = tl["duration"]
    apart, rebuild, whole, flyout = tl["apart"], tl["rebuild"], tl["whole"], tl["flyout"]
    each = tl["fuselage"] - tl["powerplant"]

    def live(t):  # 1 in flight, 0 while the aircraft is held apart
        return 1 - smooth((t - (apart - 0.9)) / 1.2) + smooth((t - (whole - 0.5)) / 1.3)

    # the pad: Dm9 for the pass, darker under the teardown, lifting to D major when it is whole again
    progression = [
        (0.0, notes("D2 A2 D3 F3 A3 E4")),
        (apart, notes("Bb1 F2 Bb2 D3 F3 A3")),
        (tl["cockpit"], notes("G1 D2 G2 Bb2 D3 F3")),
        (tl["tail"], notes("Bb1 F2 Bb2 D3 F3 C4")),
        (tl["stores"], notes("C2 G2 C3 E3 G3 D4")),
        (rebuild, notes("A1 E2 A2 D3 E3 A3")),
        (whole, notes("D2 A2 D3 F#3 A3 D4 F#4")),
    ]
    vol = envelope([(0, 0.0), (1.2, 0.8), (apart - 0.3, 1.0), (apart + 0.4, 0.62), (rebuild, 0.7), (whole, 1.15), (dur - 2.4, 1.0), (dur, 0.0)])
    left, right = pad(dur, progression, volume=vol, detune=0.7, tremolo=0.17, xfade=0.5)
    mix.put_stereo(0, left, right, 0.05)
    for t, root in ((0.0, "D1"), (apart, "Bb0"), (tl["cockpit"], "G0"), (tl["tail"], "Bb0"), (tl["stores"], "C1"), (rebuild, "A0"), (whole, "D1")):
        mix.put(t, bass(hz(root) * 2, 2.6, 0.9), 0.07)

    # the aircraft itself: five blades at 1,700 rpm is a 142 Hz blade-pass note, heard here an octave down
    eng = rumble(dur, lambda t: 30 + 41 * live(t) ** 1.5)
    k = 48000
    eng = [s * (0.12 + 0.88 * live(i / k)) for i, s in enumerate(eng)]
    mix.put(0, eng, 0.034)
    mix.put(0, airy(apart, 420, 760, 0.6), 0.035)
    mix.put(whole - 0.4, airy(dur - whole + 0.3, 520, 900, 0.6), 0.035)
    mix.put(tl["pass"] - 0.8, whoosh(1.8, 300, 1400, 0.5), 0.05, pan=-0.3)

    # coming apart: one riser, one impact, and the clatter of 61 parts letting go
    mix.put(apart - 1.3, riser(1.3, 240, 4200), 0.06)
    mix.put(apart, impact(1.6), 0.22)
    mix.put(apart + 0.1, rattle(1.6, 26, 2600, seed=3), 0.03)

    # one drum and one step up the scale for each system, over a tick on every third of the beat
    for i, key in enumerate(SYSTEMS):
        t = tl[key]
        mix.put(t, thud(62, 0.16, 0.6), 0.16)
        mix.put(t + 0.02, blip(hz(CLIMB[i]), 0.7, 0.24), 0.07, pan=-0.35 + 0.1 * i)
        mix.put(t + each / 2, blip(hz(CLIMB[i]) * 1.5, 0.4, 0.12), 0.03, pan=0.35 - 0.1 * i)
        for j in range(6):
            mix.put(t + j * each / 6, hat(0.5 if j % 3 == 0 else 0.28), 0.03)

    # back together in reverse: a rising whoosh and the clatter again, landing on the bell chord
    span = whole - rebuild
    mix.put(rebuild, whoosh(span, 260, 5200, 0.92), 0.09)
    mix.put(rebuild + 0.05, rattle(span - 0.1, 40, 3000, seed=5), 0.03)
    mix.put(whole, thud(55, 0.22, 0.8), 0.2)
    mix.put(whole, chime(notes("D4 A4 D5 F#5 A5"), 3.2, 1.2), 0.08)

    # the break away
    mix.put(flyout - 0.6, whoosh(2.4, 1600, 260, 0.3), 0.06, pan=0.4)
    mix.put(flyout + 0.9, chime(notes("A4 D5 F#5"), 2.4, 1.0), 0.035)
