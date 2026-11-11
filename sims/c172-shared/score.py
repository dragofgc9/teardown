"""Score for the Cessna 172E teardown film: a light bed (Fmaj9, 92 bpm) the whole way, the O-300's six-cylinder
rumble following the run-up's rpm (three firing pulses per crank turn), a starter whine, a soft air under every
assembly as it comes off, a thud as each one is set down, a lighter knock as each is refitted, and a quiet click on
every button the operator presses.

    python run_sfx.py sims/c172-shared/score.py

Every time comes from c172-film/timeline.json and the rpm from c172-film/rpm.json, both written by
c172-film/timeline.mjs from the film's own code.
"""

import json
import os

from sfx.score_kit import airy, bed, chords, hz, motor, rumble, thud
from sfx.synth import SR, click

TIMELINE = "../c172-film/timeline.json"
OUT = os.path.join(os.environ.get("TEARDOWN_OUT", "teardown-out"), "c172-score.wav")
TARGET_LUFS = -14.0
SEED = 64

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "..", "c172-film", "rpm.json")) as f:
    RPM = json.load(f)

CHORDS = chords("Fmaj9:F2 C3 E3 G3 A3/F1", "Dm9:D2 A2 C3 E3 F3/D1", "Bbmaj7:Bb2 F3 A3 D4/Bb1", "C6sus:C3 F3 G3 A3 D4/C2")
MOTIF = [(0.5, hz("A5")), (1.5, hz("C6")), (2.5, hz("G5"))]
# an assembly travels for SPAN (1.3) levels: 1.5 s in the teardown, 1.1 s in the rebuild
SET_DOWN = 1.3 * 1.15
SEATED = 1.3 * 0.85


def rpm_at(t):
    i = min(len(RPM["rpm"]) - 2, max(0, int(t / RPM["step"])))
    k = t / RPM["step"] - i
    return RPM["rpm"][i] * (1 - k) + RPM["rpm"][i + 1] * k


def score(mix, tl):
    dur = tl["duration"]
    left, right, low, drums = bed(dur, 92, CHORDS, MOTIF, motif_voice="epiano", kicks=(0, 2.5), snares=(), hats=8, swing=0.0, keys_vel=0.7, keys_lp=3600)
    mix.put_stereo(0, left, right, 0.11)
    mix.put(0, low, 0.11)
    mix.put(0, drums, 0.04)
    ru = tl["runup"]
    # the starter, then the engine from the catch to the cut-off: pitch is the firing frequency, rpm / 60 * 3
    mix.put(ru["starter"], motor(0.8, 160, 1100, 9), 0.03)
    start, stop = ru["catch"] - 0.2, ru["cutoff"] + 1.2
    eng = rumble(stop - start, lambda t: max(8.0, rpm_at(start + t) / 60 * 3), 1.0)
    mix.put(start, [x * min(1.0, rpm_at(start + k / SR) / 900) for k, x in enumerate(eng)], 0.05)
    for t in tl["teardown"]:
        mix.put(t, airy(1.3, 380, 1200, 0.5), 0.02)
        if t + SET_DOWN < dur - 0.3:
            mix.put(t + SET_DOWN, thud(82, 0.05, 0.4), 0.08)
    for t in tl["rebuild"]:
        if t + SEATED < dur - 0.3:
            mix.put(t + SEATED, thud(120, 0.03, 0.3), 0.06)
    for t in tl["clicks"]:
        mix.put(t, click(2400, 0.025), 0.055)
