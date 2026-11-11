#!/usr/bin/env node
// Writes the film's beats (timeline.json) and the engine's rpm track (rpm.json) from the same code that poses the
// aircraft, so the score and the review sheets can never drift from the picture. Run after changing film.js or
// teardown.js:   node sims/c172-film/timeline.mjs
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DURATION, SCRIPT, seqAt} from '../c172-shared/film.js';
import {mechAt, SEQ} from '../c172-shared/teardown.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const r = (x) => Math.round(x * 100) / 100;
const at = (s) => SCRIPT.find((e) => e.seq === s).t;
const tl = {
  duration: DURATION,
  clicks: SCRIPT.filter((e) => e.t > 0).map((e) => r(e.t)),
  runup: {start: at('runup'), starter: r(at('runup') + 0.8), catch: r(at('runup') + 1.5), runup: r(at('runup') + 3.0), idle: r(at('runup') + 6.0), flaps: r(at('runup') + 11.7), cutoff: r(at('runup') + 14.6)},
  teardown: SEQ.teardown.phases.slice(1, -1).map(([t]) => r(at('teardown') + t)),
  rebuild: SEQ.rebuild.phases.slice(1, -1).map(([t]) => r(at('rebuild') + t)),
};
fs.writeFileSync(path.join(HERE, 'timeline.json'), JSON.stringify(tl) + '\n');
const step = 0.02;
const rpm = [];
for (let t = 0; t <= DURATION; t += step) {
  const {seq, tau} = seqAt(t);
  rpm.push(Math.round(mechAt(seq, tau).rpm));
}
fs.writeFileSync(path.join(HERE, 'rpm.json'), JSON.stringify({step, rpm}) + '\n');
console.log('timeline.json, rpm.json');
