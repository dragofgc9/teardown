// The 172E teardown console, laid out at 1600 x 900: the orange 172 badge and the title, the parts list (every
// assembly, on or off, each row a button), the engine and controls panel (rpm dial, absorbed power, tip speed, the
// four control surfaces), the 1964 specification sheet, the sequence switch, the views, the display toggles, the
// operation timeline, floor notes and the labels with leaders into the aircraft. update(s) redraws every live part.
import {DISP, GROUPS, hpAt, NG, SPEC, tipAt} from './teardown.js';

export const C = {ink: '#23272b', mute: '#8b9196', faint: '#d3d7da', line: '#e1e4e6', panel: 'rgba(250,251,251,.95)', or: '#e3562a', green: '#2fa36b', blue: '#3c79a8', track: '#e7eaec'};
export const VIEWS = ['hero', 'front', 'side', 'top', 'engine', 'tail'];
export const VIEW_LABEL = {hero: 'HERO', front: 'FRONT', side: 'SIDE', top: 'TOP', engine: 'ENGINE', tail: 'TAIL'};
export const DISPLAY = ['labels', 'xray', 'orbit'];
export const DISPLAY_LABEL = {labels: 'LABELS', xray: 'X-RAY SKIN', orbit: 'ORBIT'};
export const SEQ_LABEL = {runup: 'RUN-UP', teardown: 'TEAR DOWN', rebuild: 'REBUILD'};
const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.mo{font-family:'JetBrains Mono',ui-monospace,monospace}
.cp{position:absolute;background:${C.panel};border:1px solid ${C.line};border-radius:6px;box-shadow:0 2px 10px rgba(40,60,80,.07)}
.ph{position:absolute;display:flex;align-items:center;gap:9px;font:700 10.5px 'JetBrains Mono',monospace;letter-spacing:1.8px}
.ph i{display:block;width:3px;height:13px;background:${C.or}}
.pn{position:absolute;font:500 9.5px 'JetBrains Mono',monospace;color:${C.mute};letter-spacing:1px}
.sm{font:500 9px 'JetBrains Mono',monospace;letter-spacing:1.6px;color:${C.mute};text-transform:uppercase;white-space:nowrap}
.bt{position:absolute;height:21px;padding:0 10px;display:flex;align-items:center;justify-content:center;border:1px solid ${C.faint};border-radius:4px;background:#fff;font:700 9.4px 'JetBrains Mono',monospace;letter-spacing:1.3px;color:${C.ink};white-space:nowrap}
.row{position:absolute;height:16px;display:flex;align-items:center;border-radius:3px;font:600 9px 'JetBrains Mono',monospace;letter-spacing:1.1px;white-space:nowrap}
.row s{display:block;width:16px;color:${C.mute};text-decoration:none;font-weight:500}
.row u{display:block;flex:1;text-decoration:none}
.row em{display:block;width:44px;text-align:right;font-style:normal;font-weight:700}
.call{position:absolute;white-space:nowrap}
.call b{display:flex;align-items:center;gap:6px;font:700 9.4px 'JetBrains Mono',monospace;letter-spacing:1.3px;color:${C.ink}}
.call b i{display:block;width:6px;height:6px;background:${C.or}}
.call span{display:block;font:500 7.8px 'JetBrains Mono',monospace;letter-spacing:1.2px;color:${C.mute};margin-top:2px}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:1.5px solid ${C.or};opacity:0;z-index:49}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
const ft = (m) => {
  const inch = Math.round(m / 0.0254);
  return `${Math.floor(inch / 12)} FT ${inch % 12} IN`;
};

export function createConsole(app) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h) => {
    const n = el(h);
    ui.appendChild(n);
    return n;
  };
  const panel = (x, y, w, h, title, n) => {
    add(`<div class="cp" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px"></div>`);
    add(`<div class="ph" style="left:${x + 14}px;top:${y + 13}px"><i></i>${title}</div>`);
    add(`<div class="pn" style="right:${1600 - x - w + 14}px;top:${y + 15}px">${n}</div>`);
  };

  // ------------------------------------------------------------ header
  add(`<div style="position:absolute;left:0;top:0;width:160px;height:89px;background:${C.or}"></div>`);
  add(`<svg style="position:absolute;left:26px;top:30px" width="46" height="28"><g fill="#fff"><path d="M6 0h7L7 28H0z"/><path d="M19 0h7l-6 28h-7z"/><path d="M32 0h7l-6 28h-7z"/></g><circle cx="43" cy="25" r="3" fill="#fff"/></svg>`);
  add(`<div class="mo" style="position:absolute;left:85px;top:35px;color:#fff;font-size:16px;font-weight:600;letter-spacing:4px">172</div>`);
  add(`<div class="sm" style="position:absolute;left:182px;top:22px;letter-spacing:2.4px">GENERAL AVIATION · 1964 MODEL YEAR</div>`);
  add(`<div style="position:absolute;left:181px;top:37px;font-size:33px;font-weight:700;letter-spacing:-.6px;line-height:1">Cessna 172E <span style="color:${C.or};font-weight:400">/</span></div>`);
  add(`<div class="mo" style="position:absolute;left:182px;top:77px;font-size:11.2px;letter-spacing:2.2px;color:#5f666c">AIRFRAME TEARDOWN / EXPLODED ASSEMBLY</div>`);
  add(`<div class="sm" style="position:absolute;left:1066px;top:49px;letter-spacing:2.6px;font-size:9.6px">HIGH WING · FOUR SEATS · TRICYCLE</div>`);
  add(`<div class="mo" style="position:absolute;left:1352px;top:47px;color:${C.or};font-size:12px;letter-spacing:-1px">//////</div>`);
  add(`<div style="position:absolute;left:1406px;top:34px;color:${C.or};font-size:39px;font-weight:700;letter-spacing:-.8px;line-height:1">172E</div>`);
  add(`<div style="position:absolute;left:1500px;top:33px;width:1px;height:44px;background:${C.faint}"></div>`);
  add(`<div class="sm" style="position:absolute;left:1516px;top:34px;line-height:14px;letter-spacing:2.2px">TAKE<br>IT<br>APART</div>`);
  {
    let h = '';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) h += `<path d="M${c * 25.5 + 4} ${r * 25.5}v8M${c * 25.5} ${r * 25.5 + 4}h8" stroke="${C.or}" stroke-width="1.1" opacity=".7"/>`;
    add(`<svg style="position:absolute;left:740px;top:80px" width="300" height="64">${h}</svg>`);
  }

  const btn = {};
  // ------------------------------------------------------------ 01 parts
  panel(28, 126, 282, 306, 'ASSEMBLIES', '01');
  const chip = add(`<div style="position:absolute;left:42px;top:162px;width:13px;height:24px;border-radius:2px"></div>`);
  const stTitle = add(`<div style="position:absolute;left:66px;top:160px;font-size:15px;font-weight:600"></div>`);
  const stSub = add(`<div class="sm" style="position:absolute;left:67px;top:179px"></div>`);
  add(`<div style="position:absolute;left:42px;top:199px;width:254px;height:1px;background:${C.line}"></div>`);
  const rows = GROUPS.map((g, i) => {
    const y = 207 + i * 18;
    const r = add(`<div class="row" style="left:38px;top:${y}px;width:262px;padding:0 4px"><s>${String(i + 1).padStart(2, '0')}</s><u>${g.short}</u><em></em></div>`);
    btn[`part:${g.id}`] = r;
    const bar = add(`<div style="position:absolute;left:42px;top:${y + 16}px;height:1.5px;background:${C.or};width:0"></div>`);
    return {r, em: r.querySelector('em'), bar};
  });

  // ------------------------------------------------------------ 02 engine & controls
  panel(28, 446, 282, 236, 'ENGINE & CONTROLS', '02');
  const dial = add(`<svg style="position:absolute;left:38px;top:476px" width="120" height="82"></svg>`);
  const read = [['POWER', 'hp'], ['PROP TIP', 'tip'], ['FIRING ORDER', 'fire']].map(([n], i) => {
    add(`<div class="sm" style="position:absolute;left:170px;top:${484 + i * 26}px">${n}</div>`);
    return add(`<div class="mo" style="position:absolute;left:170px;top:${494 + i * 26}px;font-size:11px;font-weight:700"></div>`);
  });
  read[2].textContent = SPEC.firing;
  add(`<div style="position:absolute;left:42px;top:566px;width:254px;height:1px;background:${C.line}"></div>`);
  const ctl = ['AILERON', 'ELEVATOR', 'RUDDER', 'FLAPS'].map((n, i) => {
    const y = 578 + i * 23;
    add(`<div class="sm" style="position:absolute;left:42px;top:${y}px">${n}</div>`);
    add(`<div style="position:absolute;left:120px;top:${y + 4}px;width:116px;height:4px;background:${C.track};border-radius:2px"></div>`);
    if (i < 3) add(`<div style="position:absolute;left:177px;top:${y + 1}px;width:1px;height:10px;background:${C.faint}"></div>`);
    const f = add(`<div style="position:absolute;top:${y + 4}px;height:4px;background:${C.or};border-radius:2px"></div>`);
    const v = add(`<div class="mo" style="position:absolute;right:${1600 - 296}px;top:${y - 2}px;font-size:11px;font-weight:600"></div>`);
    return {f, v, signed: i < 3};
  });

  // ------------------------------------------------------------ 03 specification
  panel(1313, 126, 258, 210, 'SPECIFICATION', '03');
  const spec = [
    ['SPAN', ft(SPEC.span)],
    ['LENGTH', ft(SPEC.length)],
    ['HEIGHT', ft(SPEC.height)],
    ['GROSS WEIGHT', `${SPEC.gross.toLocaleString('en-US')} LB`],
    ['ENGINE', `O-300-D · ${SPEC.hp} HP`],
    ['DISPLACEMENT', `${Math.round(DISP)} CU IN`],
    ['FUEL', `${SPEC.fuel} GAL · ${SPEC.fuelUsable} USABLE`],
    ['FLAPS', `MANUAL · 0-${SPEC.flapMax}°`],
  ];
  spec.forEach(([k, v], i) => {
    const y = 160 + i * 21;
    add(`<div class="sm" style="position:absolute;left:1327px;top:${y}px">${k}</div>`);
    add(`<div class="mo" style="position:absolute;right:${1600 - 1557}px;top:${y - 1}px;font-size:10px;font-weight:700;letter-spacing:.6px">${v}</div>`);
    if (i) add(`<div style="position:absolute;left:1327px;top:${y - 6}px;width:230px;height:1px;background:${C.line}"></div>`);
  });

  // ------------------------------------------------------------ 04 sequence, 05 views, 06 display
  panel(1313, 350, 258, 82, 'SEQUENCE', '04');
  add(`<div style="position:absolute;left:1327px;top:387px;width:230px;height:30px;border-radius:5px;background:${C.track}"></div>`);
  ['runup', 'teardown', 'rebuild'].forEach((k, i) => {
    btn[k] = add(`<div class="bt" style="left:${1330 + i * 75}px;top:390px;width:74px;height:24px;border:none;background:transparent;padding:0">${SEQ_LABEL[k]}</div>`);
  });
  const btnRow = (keys, labels, x0, y, wmax = 230) => {
    let x = x0;
    let yy = y;
    for (const k of keys) {
      const w = Math.round(labels[k].length * 7.1 + 22);
      if (x + w > x0 + wmax) {
        x = x0;
        yy += 31;
      }
      btn[k] = add(`<div class="bt" style="left:${x}px;top:${yy}px;width:${w}px;height:23px">${labels[k]}</div>`);
      x += w + 6;
    }
  };
  panel(1313, 446, 258, 107, 'VIEWS', '05');
  btnRow(VIEWS, VIEW_LABEL, 1327, 483);
  panel(1313, 567, 258, 76, 'DISPLAY', '06');
  btnRow(DISPLAY, DISPLAY_LABEL, 1327, 604);

  // ------------------------------------------------------------ 07 operation
  panel(430, 752, 740, 108, 'OPERATION', '07');
  btn.play = add(`<div class="bt" style="left:445px;top:795px;width:44px;height:44px;border-radius:50%;border:none;background:${C.or};color:#fff;font-size:15px"></div>`);
  const opFrom = add(`<div class="sm" style="position:absolute;left:506px;top:791px"></div>`);
  const opPhase = add(`<div class="mo" style="position:absolute;left:506px;width:500px;top:790px;text-align:center;font-size:9.6px;font-weight:700;letter-spacing:1.6px;color:${C.or}"></div>`);
  const opTo = add(`<div class="sm" style="position:absolute;right:${1600 - 1010}px;top:791px"></div>`);
  const TL = {x: 508, w: 504};
  add(`<div style="position:absolute;left:${TL.x}px;top:820px;width:${TL.w}px;height:3px;background:${C.track};border-radius:2px"></div>`);
  const tlFill = add(`<div style="position:absolute;left:${TL.x}px;top:820px;height:3px;background:${C.or};border-radius:2px"></div>`);
  const tlKnob = add(`<div style="position:absolute;top:814px;width:15px;height:15px;margin-left:-7.5px;border-radius:50%;background:#fff;border:2px solid ${C.or};box-sizing:border-box"></div>`);
  const tlTime = add(`<div class="mo" style="position:absolute;left:506px;top:834px;font-size:9.6px;color:${C.mute};letter-spacing:1px"></div>`);
  add(`<div class="sm" style="position:absolute;left:1029px;top:805px">SPEED</div>`);
  const SP = {x: 1031, w: 92};
  add(`<div style="position:absolute;left:${SP.x}px;top:823px;width:${SP.w}px;height:3px;background:${C.track};border-radius:2px"></div>`);
  const spFill = add(`<div style="position:absolute;left:${SP.x}px;top:823px;height:3px;background:${C.or};border-radius:2px"></div>`);
  const spKnob = add(`<div style="position:absolute;top:817px;width:15px;height:15px;margin-left:-7.5px;border-radius:50%;background:#fff;border:2px solid ${C.or};box-sizing:border-box"></div>`);
  const spVal = add(`<div class="mo" style="position:absolute;left:1128px;top:818px;font-size:10px;font-weight:700"></div>`);

  // ------------------------------------------------------------ footer and floor notes
  add(`<div class="sm" style="position:absolute;left:27px;top:882px;letter-spacing:2.2px">AIRFRAME STUDY &nbsp;·&nbsp; PROCEDURAL MODEL &nbsp;·&nbsp; ONE INPUT: THE TEARDOWN LEVEL</div>`);
  add(`<div class="sm" style="position:absolute;right:28px;top:882px;letter-spacing:2.2px">CLICK ANY PART TO PULL IT OFF <span style="color:${C.or}">//////</span></div>`);
  const notes = add(`<div style="position:absolute;inset:0"></div>`);
  notes.innerHTML = `<div class="sm" style="position:absolute;left:342px;top:708px;line-height:16px;letter-spacing:2px">MODEL 172E · 1964<br>FOUR-PLACE LANDPLANE</div>
    <svg style="position:absolute;left:1180px;top:700px" width="48" height="10"><path d="M48 5H8" stroke="${C.mute}" stroke-width="1.2"/><path d="M8 1L1 5l7 4z" fill="${C.mute}"/></svg>
    <div class="sm" style="position:absolute;left:1196px;top:719px">FWD</div>
    <svg style="position:absolute;left:342px;top:150px" width="90" height="80"><path d="M0 80V0h80" fill="none" stroke="${C.or}" stroke-width="1" stroke-dasharray="3 3" opacity=".55"/></svg>
    <svg style="position:absolute;left:1206px;top:612px" width="80" height="80"><path d="M80 0v76H0" fill="none" stroke="${C.or}" stroke-width="1" stroke-dasharray="3 3" opacity=".55"/></svg>`;

  // ------------------------------------------------------------ labels, the pointer
  const callSvg = add(`<svg data-callouts style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const callG = add(`<div data-callouts style="position:absolute;inset:0"></div>`);
  const ring = add(`<div class="ring"></div>`);
  const cur = add(`<div class="cur"><svg width="22" height="22" viewBox="0 0 34 34"><path d="M4 3 L30 13.5 L17.5 17.5 L13.5 30 Z" fill="#111" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg></div>`);
  const centre = (n) => {
    const r = n.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  const spots = Object.fromEntries(Object.entries(btn).map(([k, n]) => [k, centre(n)]));
  const pointer = (c) => {
    cur.style.display = c.x < 0 ? 'none' : 'block';
    cur.style.transform = `translate(${(c.x - 3).toFixed(2)}px, ${(c.y - 2).toFixed(2)}px) scale(${c.press ? 0.88 : 1})`;
    ring.style.left = `${c.ringX}px`;
    ring.style.top = `${c.ringY}px`;
    ring.style.opacity = String(c.ring * 0.85);
    ring.style.transform = `scale(${(0.35 + 0.9 * (1 - c.ring)).toFixed(3)})`;
  };
  const fmt = (s) => `00:${String(Math.floor(s)).padStart(2, '0')}`;

  return {
    spots,
    btn,
    root: ui,
    TL,
    SP,
    update(s) {
      const [title, sub, kind] = s.state;
      chip.style.background = kind === 'ok' ? C.green : C.or;
      stTitle.textContent = title;
      stSub.textContent = sub;
      // the parts list: on, coming off (a bar under the row), off
      for (let i = 0; i < NG; i++) {
        const k = s.raw[i];
        const r = rows[i];
        const hov = s.hover === GROUPS[i].id;
        r.r.style.background = hov ? '#fbe9e2' : 'transparent';
        r.r.style.color = k >= 1 ? C.or : C.ink;
        r.em.textContent = k <= 0 ? 'ON' : k >= 1 ? 'OFF' : `${Math.round(k * 100)}%`;
        r.em.style.color = k <= 0 ? C.mute : C.or;
        r.bar.style.width = `${(k > 0 && k < 1 ? k * 254 : 0).toFixed(1)}px`;
      }
      // the engine: a 0..2700 rpm dial, power off the propeller curve, tip speed
      {
        const m = s.mech;
        const a0 = 210;
        const sweep = 240;
        const ang = (r) => ((a0 - (r / 3000) * sweep) * Math.PI) / 180;
        const P = (r, rad) => [60 + rad * Math.cos(ang(r)), 52 - rad * Math.sin(ang(r))];
        const arc = (r0, r1, rad) => {
          const [x0, y0] = P(r0, rad);
          const [x1, y1] = P(r1, rad);
          return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${rad} ${rad} 0 ${((r1 - r0) / 3000) * sweep > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
        };
        let h = `<path d="${arc(0, 3000, 38)}" fill="none" stroke="${C.track}" stroke-width="5"/>`;
        h += `<path d="${arc(2100, 2700, 38)}" fill="none" stroke="${C.green}" stroke-width="5" opacity=".55"/><path d="${arc(2700, 2740, 38)}" fill="none" stroke="${C.or}" stroke-width="5"/>`;
        if (m.rpm > 5) h += `<path d="${arc(0, Math.min(2999, m.rpm), 38)}" fill="none" stroke="${C.or}" stroke-width="2"/>`;
        for (let r = 0; r <= 3000; r += 500) {
          const [x0, y0] = P(r, 30);
          const [x1, y1] = P(r, 34);
          h += `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${C.mute}" stroke-width="1"/>`;
        }
        const [nx, ny] = P(m.rpm, 31);
        h += `<line x1="60" y1="52" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="${C.ink}" stroke-width="1.6" stroke-linecap="round"/><circle cx="60" cy="52" r="3" fill="${C.ink}"/>`;
        h += `<text x="60" y="76" text-anchor="middle" font-family="JetBrains Mono" font-size="12" font-weight="700" fill="${C.ink}">${Math.round(m.rpm)}</text><text x="60" y="36" text-anchor="middle" font-family="JetBrains Mono" font-size="6.6" letter-spacing="1" fill="${C.mute}">RPM</text>`;
        dial.innerHTML = h;
        read[0].textContent = `${hpAt(m.rpm).toFixed(0)} HP`;
        read[1].textContent = `${tipAt(m.rpm).toFixed(0)} M/S`;
        const vals = [m.ail, m.elev, m.rud];
        const deg = [
          m.ail > 0 ? m.ail * SPEC.ail[0] : -m.ail * SPEC.ail[0],
          m.elev > 0 ? m.elev * SPEC.elev[0] : -m.elev * SPEC.elev[1],
          Math.abs(m.rud) * SPEC.rud,
        ];
        const dirs = [m.ail > 0.02 ? ' R' : m.ail < -0.02 ? ' L' : '', m.elev > 0.02 ? ' UP' : m.elev < -0.02 ? ' DN' : '', m.rud > 0.02 ? ' R' : m.rud < -0.02 ? ' L' : ''];
        ctl.forEach((c, i) => {
          if (c.signed) {
            const v = vals[i];
            const w = Math.abs(v) * 58;
            c.f.style.left = `${(v >= 0 ? 177 : 177 - w).toFixed(1)}px`;
            c.f.style.width = `${w.toFixed(1)}px`;
            c.v.textContent = `${deg[i].toFixed(0)}°${dirs[i]}`;
          } else {
            c.f.style.left = '120px';
            c.f.style.width = `${((m.flap / SPEC.flapMax) * 116).toFixed(1)}px`;
            c.v.textContent = `${m.flap.toFixed(0)}°`;
          }
        });
      }
      // sequence, views, display
      const onBtn = (k, on) => {
        btn[k].style.background = on ? C.or : '#fff';
        btn[k].style.color = on ? '#fff' : C.ink;
        btn[k].style.borderColor = on ? C.or : C.faint;
      };
      for (const k of ['runup', 'teardown', 'rebuild']) {
        const on = s.seq === k;
        btn[k].style.background = on ? C.or : 'transparent';
        btn[k].style.color = on ? '#fff' : '#7d848a';
        btn[k].style.borderRadius = '4px';
      }
      for (const k of VIEWS) onBtn(k, s.view === k);
      for (const k of DISPLAY) onBtn(k, !!s.display[k]);
      // the operation timeline
      btn.play.innerHTML = s.paused ? '▶' : '❚❚';
      opFrom.textContent = s.from;
      opTo.textContent = s.to;
      opPhase.textContent = s.phase;
      const kx = TL.x + s.prog * TL.w;
      tlFill.style.width = `${(s.prog * TL.w).toFixed(1)}px`;
      tlKnob.style.left = `${kx.toFixed(1)}px`;
      tlTime.textContent = `${fmt(s.tau)} / ${fmt(s.dur)}`;
      const sk = SP.x + s.speedK * SP.w;
      spFill.style.width = `${(s.speedK * SP.w).toFixed(1)}px`;
      spKnob.style.left = `${sk.toFixed(1)}px`;
      spVal.textContent = `${s.speed.toFixed(1)}×`;
      // labels: an orange square, the name, the note, a thin leader to the part
      let lh = '';
      let ch = '';
      for (const c of s.callouts) {
        if (c.o < 0.02 || !c.at) continue;
        const [ax, ay] = c.at;
        const [lx, ly] = c.label;
        const right = lx > ax;
        const ex = right ? lx - 6 : lx + c.w + 6;
        lh += `<polyline points="${ax.toFixed(1)},${ay.toFixed(1)} ${ex.toFixed(1)},${(ly + 6).toFixed(1)}" fill="none" stroke="${C.or}" stroke-width=".9" opacity="${c.o.toFixed(2)}"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="2.4" fill="${C.or}" opacity="${c.o.toFixed(2)}"/>`;
        ch += `<div class="call" style="left:${lx.toFixed(1)}px;top:${(ly - 1).toFixed(1)}px;opacity:${c.o.toFixed(2)}"><b><i></i>${c.name}</b><span>${c.sub}</span></div>`;
      }
      callSvg.innerHTML = lh;
      callG.innerHTML = ch;
      pointer(s.cursor);
    },
    pointer,
  };
}
