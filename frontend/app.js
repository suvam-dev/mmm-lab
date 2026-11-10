'use strict';
/* SlopeGuard — Web Serial dashboard for the landslide node (main/landslide_node). */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

/* ---------- sensor model ---------- */
// dir 'below': unsafe when the value falls under the limit. 'above': unsafe when it rises over it.
const SENSORS = {
  dist: { label: 'Ground distance', short: 'distance', unit: 'cm', dir: 'below', min: 1, max: 60, step: 0.5, dec: 1, lim: 6, pair: 8,
    help: 'Ultrasonic sensor facing the slope. Debris or soil moving toward it shrinks the distance.' },
  soil: { label: 'Soil moisture', short: 'moisture', unit: 'raw', dir: 'below', min: 100, max: 700, step: 5, dec: 0, lim: 350, pair: 420,
    help: 'Capacitive probe. Wetter soil gives a lower raw value, so the limit is a floor.' },
  tilt: { label: 'Slope tilt', short: 'tilt', unit: '°', dir: 'above', min: 1, max: 45, step: 0.5, dec: 1, lim: 10, pair: 5,
    help: 'Angle the accelerometer has turned from its baseline.' },
  vib: { label: 'Vibration', short: 'vibration', unit: 'g', dir: 'above', min: 0.02, max: 1, step: 0.01, dec: 2, lim: 0.2, pair: 0.08,
    help: 'Sudden change between accelerometer readings, scaled so rest gravity is 1 g.' },
};
const KEYS = Object.keys(SENSORS);
const PAIRS = [['soil', 'tilt', true], ['soil', 'vib', true], ['dist', 'tilt', true], ['dist', 'soil', false], ['dist', 'vib', false], ['tilt', 'vib', false]];

const defaultCfg = () => ({
  limits: Object.fromEntries(KEYS.map(k => [k, SENSORS[k].lim])),
  pairs: PAIRS.map(([a, b, on]) => ({ a, b, on, la: SENSORS[a].pair, lb: SENSORS[b].pair })),
});
let cfg = store.get('sg-cfg', null);
if (!cfg || !cfg.limits || !cfg.pairs || cfg.pairs.length !== PAIRS.length) cfg = defaultCfg();

const fmt = (k, v) => v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(SENSORS[k].dec);
const breach = (k, v, lim) => v != null && (SENSORS[k].dir === 'below' ? v < lim : v > lim);
const risk = (k, v, lim) => {                     // 1.0 == exactly at the limit
  if (v == null) return 0;
  return SENSORS[k].dir === 'above' ? v / lim : (v <= 0 ? 2 : lim / v);
};

/* ---------- state ---------- */
const S = {
  step: 0, launched: false, mode: 'none',          // none | serial | demo
  port: null, reader: null, writer: null, readDone: null,
  vals: {}, got: {}, hist: Object.fromEntries(KEYS.map(k => [k, []])),
  rows: [], logLines: [], baseline: null, prevAcc: null, lastAcc: null, samples: 0,
  alarm: false, dangerStreak: 0, safeStreak: 0, level: 'idle', events: [],
  selected: 'soil', muted: false, paused: false, sim: null, simTimer: null, audio: null, buzzTimer: null,
};
const HIST_MAX = 150;

/* ---------- utilities ---------- */
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200);
}
const hms = (d = new Date()) => d.toTimeString().slice(0, 8);

function log(msg, cls = '') {
  const line = `${hms()}  ${msg}`;
  S.logLines.push(line);
  if (S.logLines.length > 5000) S.logLines.shift();
  if (S.paused) return;
  const c = $('#console');
  const el = document.createElement('div');
  el.className = 'ln ' + cls;
  el.innerHTML = `<span class="ts">${hms()}</span>`;
  el.append(document.createTextNode(msg));
  c.append(el);
  while (c.childElementCount > 400) c.firstChild.remove();
  if ($('#autoscroll').checked) c.scrollTop = c.scrollHeight;
}

/* ---------- theme ---------- */
function setTheme(t) { document.documentElement.dataset.theme = t; store.set('sg-theme', t); }
setTheme(store.get('sg-theme', matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
$('#themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

/* ---------- steps ---------- */
const STEP_NAMES = ['Connect', 'Sensors', 'Limits', 'Pairs', 'Review'];
function renderStepper() {
  $('#stepper').innerHTML = STEP_NAMES.map((n, i) =>
    `<button data-i="${i}" class="${i === S.step ? 'on' : i < S.step ? 'done' : ''}" ${i > S.step + 0 && !S.launched ? 'disabled' : ''}>${i + 1}. ${n}</button>`).join('');
  $$('#stepper button').forEach(b => b.onclick = () => goStep(+b.dataset.i));
}
function goStep(i) {
  S.step = Math.max(0, Math.min(STEP_NAMES.length - 1, i));
  $$('.step').forEach(el => el.classList.toggle('on', +el.dataset.step === S.step));
  renderStepper();
  $('#btnBack').style.visibility = S.step === 0 ? 'hidden' : 'visible';
  $('#btnNext').textContent = S.step === 4 ? 'Launch dashboard' : 'Continue';
  $('#btnNext').classList.toggle('hidden', S.step === 0);
  $('#btnToDash').classList.toggle('hidden', !S.launched);
  if (S.step === 1) renderCheck();
  if (S.step === 2) renderLimits();
  if (S.step === 3) renderPairs();
  if (S.step === 4) renderReview();
  updateNext();
}
function updateNext() {
  if (S.step === 1) $('#btnNext').disabled = S.mode === 'none';
  else $('#btnNext').disabled = false;
}
$('#btnBack').onclick = () => goStep(S.step - 1);
$('#btnNext').onclick = () => S.step === 4 ? showDashboard() : goStep(S.step + 1);
$('#btnToDash').onclick = showDashboard;
$('#btnSettings').onclick = () => { showView('onboarding'); goStep(2); };
$('#brand').onclick = e => { e.preventDefault(); S.launched ? showDashboard() : goStep(0); };

function showView(v) {
  $('#onboarding').classList.toggle('hidden', v !== 'onboarding');
  $('#dashboard').classList.toggle('hidden', v !== 'dashboard');
  if (v === 'dashboard') { drawAll(); }
}
function showDashboard() {
  S.launched = true; store.set('sg-cfg', cfg);
  showView('dashboard'); buildMetrics(); buildChartSeg(); refreshDash(); renderStepper();
}

/* step 1 — sensor check */
function renderCheck() {
  $('#checkList').innerHTML = KEYS.map(k => `
    <div class="check-row" id="chk-${k}"><span class="dot"></span>
      <div><div>${SENSORS[k].label}</div><div class="muted small">${SENSORS[k].help}</div></div>
      <span class="val" id="chkv-${k}">waiting…</span></div>`).join('');
  refreshCheck();
}
function refreshCheck() {
  KEYS.forEach(k => {
    const row = $('#chk-' + k); if (!row) return;
    const ok = S.got[k];
    row.classList.toggle('ok', !!ok);
    $('#chkv-' + k).textContent = ok ? `${fmt(k, S.vals[k])} ${SENSORS[k].unit}` : 'waiting…';
  });
  $('#calNote').textContent = S.baseline ? 'Baseline is set. Tilt reads 0° at this position.' : 'Baseline is set automatically from the first readings.';
}
$('#btnCalibrate').onclick = $('#btnCal').onclick = calibrate;
function calibrate() {
  if (!S.lastAcc) { toast('No accelerometer data yet'); return; }
  S.baseline = [...S.lastAcc]; S.prevAcc = null;
  log('Tilt baseline set', 'sys'); toast('Tilt baseline set to the current position'); refreshCheck();
}

/* step 2 — individual limits */
function renderLimits() {
  $('#limitCards').innerHTML = KEYS.map(k => {
    const s = SENSORS[k];
    return `<div class="card">
      <div class="lim-head"><div><div class="h3">${s.label}</div><div class="muted small">${s.dir === 'below' ? 'Alarm when it drops below' : 'Alarm when it rises above'}</div></div>
        <div class="lim-val"><span id="lv-${k}">${fmt(k, cfg.limits[k])}</span> <small>${s.unit}</small></div></div>
      <input class="slider" type="range" id="ls-${k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${cfg.limits[k]}" aria-label="${s.label} limit">
      <div class="now">Now: <span id="ln-${k}">${fmt(k, S.vals[k])}</span> ${s.unit}</div>
      <p class="rule">${s.help}</p></div>`;
  }).join('');
  KEYS.forEach(k => $('#ls-' + k).oninput = e => { cfg.limits[k] = +e.target.value; $('#lv-' + k).textContent = fmt(k, cfg.limits[k]); store.set('sg-cfg', cfg); });
}

/* step 3 — pair rules */
function pairTitle(p) { return `${SENSORS[p.a].label} + ${SENSORS[p.b].label}`; }
function pairRule(p) {
  const A = SENSORS[p.a], B = SENSORS[p.b];
  return `Alarm when ${A.short} ${A.dir === 'below' ? '<' : '>'} ${fmt(p.a, p.la)} ${A.unit} and ${B.short} ${B.dir === 'below' ? '<' : '>'} ${fmt(p.b, p.lb)} ${B.unit}`;
}
function renderPairs() {
  $('#pairCards').innerHTML = cfg.pairs.map((p, i) => {
    const A = SENSORS[p.a], B = SENSORS[p.b];
    return `<div class="card pair-card ${p.on ? '' : 'off'}" id="pc-${i}">
      <div class="lim-head"><div class="h3">${pairTitle(p)}</div>
        <label class="switch"><input type="checkbox" ${p.on ? 'checked' : ''} id="pt-${i}" aria-label="Enable ${pairTitle(p)}"><span></span></label></div>
      <div class="pair-sliders">
        <label>${A.label}<b id="pla-${i}">${fmt(p.a, p.la)} ${A.unit}</b></label>
        <input class="slider" type="range" id="psa-${i}" min="${A.min}" max="${A.max}" step="${A.step}" value="${p.la}">
        <label>${B.label}<b id="plb-${i}">${fmt(p.b, p.lb)} ${B.unit}</b></label>
        <input class="slider" type="range" id="psb-${i}" min="${B.min}" max="${B.max}" step="${B.step}" value="${p.lb}">
      </div><p class="rule" id="pr-${i}">${pairRule(p)}</p></div>`;
  }).join('');
  cfg.pairs.forEach((p, i) => {
    const upd = () => { store.set('sg-cfg', cfg); $('#pr-' + i).textContent = pairRule(p); };
    $('#pt-' + i).onchange = e => { p.on = e.target.checked; $('#pc-' + i).classList.toggle('off', !p.on); upd(); };
    $('#psa-' + i).oninput = e => { p.la = +e.target.value; $('#pla-' + i).textContent = `${fmt(p.a, p.la)} ${SENSORS[p.a].unit}`; upd(); };
    $('#psb-' + i).oninput = e => { p.lb = +e.target.value; $('#plb-' + i).textContent = `${fmt(p.b, p.lb)} ${SENSORS[p.b].unit}`; upd(); };
  });
}

/* step 4 — review */
function renderReview() {
  const rows = KEYS.map(k => [SENSORS[k].label, `${SENSORS[k].dir === 'below' ? '<' : '>'} ${fmt(k, cfg.limits[k])} ${SENSORS[k].unit}`]);
  const on = cfg.pairs.filter(p => p.on);
  on.forEach(p => rows.push([pairTitle(p), pairRule(p).replace('Alarm when ', '')]));
  if (!on.length) rows.push(['Pair rules', 'none enabled']);
  $('#review').innerHTML = rows.map(([a, b]) => `<div class="review-row"><span>${a}</span><span>${b}</span></div>`).join('');
}

/* ---------- connection ---------- */
function setConn() {
  const pill = $('#connPill');
  pill.className = 'pill ' + (S.mode === 'serial' ? 'live' : S.mode === 'demo' ? 'demo' : '');
  $('span', pill).textContent = S.mode === 'serial' ? 'Arduino connected' : S.mode === 'demo' ? 'Demo mode' : 'Not connected';
  $('#dashSub').textContent = S.mode === 'serial' ? 'Live data from the Arduino at 9600 baud'
    : S.mode === 'demo' ? 'Simulated sensors, no hardware attached' : 'Connect an Arduino or run the demo to see data';
  $('#btnConn').textContent = S.mode === 'serial' ? 'Disconnect' : 'Connect Arduino';
  $('#btnDemo').textContent = S.mode === 'demo' ? 'Stop demo' : 'Run demo';
  $('#demoBar').classList.toggle('hidden', S.mode !== 'demo');
  updateNext();
}
if (!('serial' in navigator)) $('#serialWarn').hidden = false;

async function connectSerial() {
  if (!('serial' in navigator)) { toast('Web Serial needs Chrome or Edge'); return false; }
  try {
    stopDemo();
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 9600 });
    S.port = port; S.mode = 'serial'; resetData();
    const dec = new TextDecoderStream(); S.readDone = port.readable.pipeTo(dec.writable).catch(() => {});
    S.reader = dec.readable.getReader();
    const enc = new TextEncoderStream(); enc.readable.pipeTo(port.writable).catch(() => {});
    S.writer = enc.writable.getWriter();
    setConn(); log('Serial port opened (9600 baud)', 'sys'); readLoop();
    return true;
  } catch (e) {
    if (e.name !== 'NotFoundError') { toast('Could not open the port. Close the Arduino Serial Monitor and try again.'); log('Open failed: ' + e.message, 'err'); }
    S.mode = S.mode === 'serial' ? 'none' : S.mode; setConn(); return false;
  }
}
async function readLoop() {
  let buf = '';
  try {
    for (;;) {
      const { value, done } = await S.reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) onLine(line); }
    }
  } catch (e) { log('Read error: ' + e.message, 'err'); }
  if (S.mode === 'serial') { await disconnectSerial(true); }
}
async function disconnectSerial(lost = false) {
  const { reader, writer, port, readDone } = S;
  S.reader = S.writer = S.port = null; S.mode = 'none'; buzz(false); setAlarmState(false, true);
  try { await reader?.cancel(); } catch {} try { await readDone; } catch {}
  try { await writer?.close(); } catch {} try { await port?.close(); } catch {}
  setConn(); log(lost ? 'Connection lost' : 'Disconnected', lost ? 'err' : 'sys');
  if (lost) toast('Arduino disconnected');
}
function send(c) {
  if (S.mode === 'serial' && S.writer) { S.writer.write(c + '\n').catch(() => {}); log('→ ' + c, 'tx'); }
}
function resetData() {
  S.vals = {}; S.got = {}; S.baseline = null; S.prevAcc = null; S.lastAcc = null; S.samples = 0;
  S.alarm = false; S.dangerStreak = S.safeStreak = 0; S.level = 'idle';
  KEYS.forEach(k => S.hist[k] = []);
}

$('#btnConnect').onclick = async () => { if (await connectSerial()) goStep(1); };
$('#btnDemo0').onclick = () => { startDemo(); goStep(1); };
$('#btnConn').onclick = () => S.mode === 'serial' ? disconnectSerial() : connectSerial();
$('#btnDemo').onclick = () => S.mode === 'demo' ? stopDemo(true) : (S.mode === 'serial' ? disconnectSerial().then(startDemo) : startDemo());

/* ---------- ingest & evaluation ---------- */
function onLine(line) {
  const isAlarm = /"a":1/.test(line);
  log(line, isAlarm ? 'alarm' : line.startsWith('#') ? 'sys' : '');
  if (line[0] !== '{') return;
  let o; try { o = JSON.parse(line); } catch { return; }
  if (typeof o.s !== 'number' || typeof o.ax !== 'number') return;
  ingest(o);
}

function ingest(o) {
  const acc = [o.ax, o.ay, o.az];
  const mag = v => Math.hypot(...v);
  S.lastAcc = acc; S.samples++;
  if (!S.baseline && S.samples >= 3 && mag(acc) > 100) { S.baseline = [...acc]; log('Tilt baseline set automatically', 'sys'); }
  let tilt = 0, vib = 0;
  if (S.baseline && mag(acc) > 0) {
    const dot = acc[0] * S.baseline[0] + acc[1] * S.baseline[1] + acc[2] * S.baseline[2];
    tilt = Math.acos(Math.max(-1, Math.min(1, dot / (mag(acc) * mag(S.baseline))))) * 180 / Math.PI;
  }
  if (S.prevAcc && S.baseline) vib = Math.hypot(acc[0] - S.prevAcc[0], acc[1] - S.prevAcc[1], acc[2] - S.prevAcc[2]) / mag(S.baseline);
  S.prevAcc = acc;

  S.vals = { dist: o.d >= 0 ? o.d : null, soil: o.s, tilt, vib };
  KEYS.forEach(k => { if (S.vals[k] != null && (k !== 'tilt' && k !== 'vib' || S.baseline)) S.got[k] = true; });
  KEYS.forEach(k => { const h = S.hist[k]; h.push(S.vals[k]); if (h.length > HIST_MAX) h.shift(); });

  const ev = evaluate(S.vals);
  if (ev.level === 'danger') { S.dangerStreak++; S.safeStreak = 0; } else { S.safeStreak++; S.dangerStreak = 0; }
  if (!S.alarm && S.dangerStreak >= 2) setAlarmState(true, false, ev);
  else if (S.alarm && S.safeStreak >= 6) setAlarmState(false, false, ev);
  const shown = S.alarm ? 'danger' : (ev.level === 'danger' ? 'warning' : ev.level);
  setLevel(shown, S.alarm ? (ev.reasons.length ? ev.reasons : S.lastReasons) : ev.reasons);
  if (ev.reasons.length) S.lastReasons = ev.reasons;

  S.rows.push({ time: new Date().toISOString(), distance_cm: S.vals.dist ?? '', soil_raw: o.s, ax: o.ax, ay: o.ay, az: o.az,
    tilt_deg: +tilt.toFixed(2), vibration_g: +vib.toFixed(3), status: shown, alarm: S.alarm ? 1 : 0 });
  if (S.rows.length > 20000) S.rows.shift();
  if (S.mode === 'serial' && S.samples === 1) syncOutputs();
  if (S.mode === 'serial' && ((o.a === 1) !== S.alarm)) syncOutputs();

  refreshCheck(); updateLiveNow(); refreshDash();
}

function evaluate(v) {
  const reasons = []; let warn = false;
  KEYS.forEach(k => {
    const lim = cfg.limits[k];
    if (breach(k, v[k], lim)) reasons.push(`${SENSORS[k].label} ${fmt(k, v[k])} ${SENSORS[k].unit} is past its limit`);
    else if (risk(k, v[k], lim) >= 0.8) warn = true;
  });
  cfg.pairs.filter(p => p.on).forEach(p => {
    if (breach(p.a, v[p.a], p.la) && breach(p.b, v[p.b], p.lb)) reasons.push(`${SENSORS[p.a].short} and ${SENSORS[p.b].short} are both past their pair limits`);
  });
  return { level: reasons.length ? 'danger' : warn ? 'warning' : 'safe', reasons };
}

function setAlarmState(on, silent, ev) {
  if (S.alarm === on && !silent) return;
  S.alarm = on;
  syncOutputs();
  if (silent) return;
  const reason = on ? (ev?.reasons[0] || 'limit crossed') : 'readings back inside limits';
  pushEvent(on ? 'danger' : 'safe', on ? `Alarm: ${reason}` : 'Alarm cleared');
  log(on ? `ALARM ON — ${reason}` : 'ALARM CLEARED', on ? 'alarm' : 'sys');
}
function syncOutputs() {
  send(S.alarm ? 'A' : 'N');
  if (S.mode === 'serial') send(S.muted ? 'M' : 'U');
  buzz(S.alarm && S.mode === 'demo' && !S.muted);
  refreshHardware();
}
function setLevel(level, reasons) {
  if (level !== S.level) {
    if (level === 'warning') pushEvent('warning', 'Watch: a sensor is close to its limit');
    S.level = level;
  }
  document.body.dataset.state = level;
  const text = { safe: 'Safe', warning: 'Watch', danger: 'Danger', idle: 'Waiting' }[level];
  $('#statusText').textContent = text;
  $('#statusReason').textContent = level === 'danger' ? (reasons[0] || 'Alarm active')
    : level === 'warning' ? 'A sensor is within 20% of its limit. The node is still green.'
    : level === 'safe' ? 'All sensors are inside their limits.' : 'No data yet.';
}
function pushEvent(level, text) {
  S.events.unshift({ t: hms(), level, text }); if (S.events.length > 50) S.events.pop();
  const ul = $('#events');
  ul.innerHTML = S.events.map(e => `<li><span class="t">${e.t}</span><br><span class="lv-${e.level}">${e.text}</span></li>`).join('');
  $('#evCount').textContent = S.events.length;
}

/* ---------- dashboard rendering ---------- */
function buildMetrics() {
  $('#metrics').innerHTML = KEYS.map(k => `
    <div class="card metric" id="m-${k}">
      <div class="metric-top"><span>${SENSORS[k].label}</span><span id="mt-${k}" class="muted small"></span></div>
      <div class="metric-val"><span id="mv-${k}">—</span><small>${SENSORS[k].unit}</small></div>
      <div class="bar"><i id="mb-${k}"></i></div>
      <div class="muted small" id="ml-${k}"></div>
      <canvas class="spark" id="sp-${k}" height="34"></canvas>
    </div>`).join('');
}
function buildChartSeg() {
  $('#chartSeg').innerHTML = KEYS.map(k => `<button data-k="${k}" class="${k === S.selected ? 'on' : ''}">${SENSORS[k].label}</button>`).join('');
  $$('#chartSeg button').forEach(b => b.onclick = () => { S.selected = b.dataset.k; buildChartSeg(); drawChart(); });
}
function updateLiveNow() { KEYS.forEach(k => { const el = $('#ln-' + k); if (el) el.textContent = fmt(k, S.vals[k]); }); }
function refreshHardware() {
  const live = S.mode !== 'none';
  $('#hwGreen').classList.toggle('on', live && !S.alarm);
  $('#hwRed').classList.toggle('on', live && S.alarm);
  $('#hwBuzz').classList.toggle('on', live && S.alarm && !S.muted);
}
function refreshDash() {
  KEYS.forEach(k => {
    if (!$('#mv-' + k)) return;
    const v = S.vals[k], lim = cfg.limits[k], r = risk(k, v, lim);
    $('#mv-' + k).textContent = fmt(k, v);
    $('#ml-' + k).textContent = `Limit ${SENSORS[k].dir === 'below' ? '<' : '>'} ${fmt(k, lim)} ${SENSORS[k].unit}`;
    $('#mb-' + k).style.width = Math.min(100, r * 100) + '%';
    const state = v == null ? '' : breach(k, v, lim) ? 'danger' : r >= 0.8 ? 'warning' : '';
    $('#m-' + k).className = 'card metric ' + state;
    $('#mt-' + k).textContent = v == null ? (k === 'dist' ? 'no echo' : '') : state === 'danger' ? 'past limit' : state === 'warning' ? 'close' : 'ok';
  });
  refreshHardware();
  $('#rowCount').textContent = `${S.rows.length} readings recorded`;
  drawAll();
}

/* ---------- canvas charts ---------- */
function css(v) { return getComputedStyle(document.body).getPropertyValue(v).trim(); }
function setupCanvas(c, h) {
  const dpr = devicePixelRatio || 1, w = c.clientWidth;
  if (!w) return null;
  c.width = w * dpr; c.height = h * dpr;
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  return { g, w, h };
}
function drawSeries(c, h, k, opts) {
  const cv = setupCanvas(c, h); if (!cv) return;
  const { g, w } = cv, data = S.hist[k], lim = cfg.limits[k];
  const nums = data.filter(v => v != null);
  const padL = opts.axes ? 46 : 2, padB = opts.axes ? 22 : 2, padT = 6, padR = 4;
  if (!nums.length) { g.fillStyle = css('--muted'); g.font = '13px ' + css('--font'); g.fillText('No data yet', padL + 6, h / 2); return; }
  let lo = Math.min(...nums, lim), hi = Math.max(...nums, lim);
  const span = (hi - lo) || 1; lo -= span * .15; hi += span * .15;
  const off = HIST_MAX - data.length;
  const X = i => padL + ((i + off) / (HIST_MAX - 1)) * (w - padL - padR);
  const Y = v => padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB);
  const col = css('--state') === css('--muted') ? css('--text') : css('--state');
  if (opts.axes) {
    g.strokeStyle = css('--line'); g.fillStyle = css('--muted'); g.font = '11px ' + css('--mono'); g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const v = lo + (hi - lo) * i / 4, y = Y(v);
      g.beginPath(); g.moveTo(padL, y); g.lineTo(w - padR, y); g.stroke();
      g.fillText(v.toFixed(SENSORS[k].dec > 0 ? 1 : 0), 4, y + 4);
    }
    g.fillText('older', padL, h - 5); g.textAlign = 'right'; g.fillText('now', w - padR, h - 5); g.textAlign = 'left';
  }
  // limit line
  g.setLineDash([5, 4]); g.strokeStyle = css('--danger'); g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(padL, Y(lim)); g.lineTo(w - padR, Y(lim)); g.stroke(); g.setLineDash([]);
  // area + line
  g.beginPath(); let started = false, first = 0, last = 0;
  data.forEach((v, i) => { if (v == null) return; const px = X(i), py = Y(v); if (!started) { g.moveTo(px, py); started = true; first = px; } else g.lineTo(px, py); last = px; });
  g.strokeStyle = col; g.lineWidth = opts.axes ? 2 : 1.5; g.lineJoin = 'round'; g.stroke();
  if (opts.axes && started) {
    g.lineTo(last, h - padB); g.lineTo(first, h - padB); g.closePath();
    const grad = g.createLinearGradient(0, padT, 0, h - padB); grad.addColorStop(0, col + '33'); grad.addColorStop(1, col + '00');
    g.fillStyle = grad; g.fill();
  }
}
function drawChart() {
  const c = $('#chart'); if (!c) return;
  drawSeries(c, 260, S.selected, { axes: true });
  const s = SENSORS[S.selected];
  $('#chartNote').textContent = `${s.label} (${s.unit}). The dashed red line is the ${s.dir === 'below' ? 'floor' : 'ceiling'} you set: ${fmt(S.selected, cfg.limits[S.selected])}.`;
}
function drawAll() {
  if ($('#dashboard').classList.contains('hidden')) return;
  KEYS.forEach(k => { const c = $('#sp-' + k); if (c) drawSeries(c, 34, k, { axes: false }); });
  drawChart();
}
addEventListener('resize', drawAll);

/* ---------- demo simulator ---------- */
const BASE_ACC = [-780, -460, -8100];
const SCENARIOS = {
  normal: { soil: 470, dist: 10, tilt: 0, vib: 0.01 },
  rain:   { soil: 280, dist: 9.4, tilt: 3, vib: 0.02 },
  shift:  { soil: 400, dist: 3.5, tilt: 14, vib: 0.3 },
};
function startDemo() {
  stopDemo(); S.mode = 'demo'; resetData();
  S.sim = { soil: 470, dist: 10, tilt: 0, vib: 0.01, target: SCENARIOS.normal };
  $$('#scenarioSeg button').forEach(b => b.classList.toggle('on', b.dataset.sc === 'normal'));
  setConn(); log('Demo started (simulated sensors)', 'sys');
  S.simTimer = setInterval(simTick, 500); simTick();
}
function stopDemo(announce) {
  if (S.simTimer) { clearInterval(S.simTimer); S.simTimer = null; }
  if (S.mode === 'demo') {
    S.mode = 'none'; buzz(false); S.alarm = false; setLevel('idle', []); refreshHardware(); setConn();
    if (announce) log('Demo stopped', 'sys');
  }
}
function simTick() {
  const s = S.sim, t = s.target, rate = 0.12;
  ['soil', 'dist', 'tilt', 'vib'].forEach(k => s[k] += (t[k] - s[k]) * rate);
  const th = (s.tilt + (Math.random() - .5) * 0.2) * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
  const amp = s.vib * 8100 * 0.5;
  const jit = () => (Math.random() - .5) * 2 * (amp + 25);
  const [bx, by, bz] = BASE_ACC;
  ingest({ d: +(s.dist + (Math.random() - .5) * 0.2).toFixed(1), s: Math.round(s.soil + (Math.random() - .5) * 4),
    ax: Math.round(bx + jit()), ay: Math.round(by * c - bz * sn + jit()), az: Math.round(by * sn + bz * c + jit()), a: S.alarm ? 1 : 0 });
  log(`{"d":${S.vals.dist?.toFixed(1)},"s":${Math.round(S.vals.soil)},"tilt":${S.vals.tilt.toFixed(1)},"vib":${S.vals.vib.toFixed(2)},"a":${S.alarm ? 1 : 0}}`, S.alarm ? 'alarm' : '');
}
$$('#scenarioSeg button').forEach(b => b.onclick = () => {
  if (!S.sim) return; S.sim.target = SCENARIOS[b.dataset.sc];
  $$('#scenarioSeg button').forEach(x => x.classList.toggle('on', x === b)); log('Scenario: ' + b.textContent, 'sys');
});

/* demo buzzer (browser audio stands in for the real one) */
function buzz(on) {
  clearInterval(S.buzzTimer); S.buzzTimer = null;
  if (!on) return;
  try {
    S.audio = S.audio || new (window.AudioContext || window.webkitAudioContext)();
    const beep = () => { const o = S.audio.createOscillator(), g = S.audio.createGain(); o.frequency.value = 880; g.gain.value = 0.04; o.connect(g); g.connect(S.audio.destination); o.start(); o.stop(S.audio.currentTime + 0.18); };
    beep(); S.buzzTimer = setInterval(beep, 500);
  } catch { /* audio unavailable */ }
}
$('#btnMute').onclick = () => {
  S.muted = !S.muted; $('#btnMute').textContent = S.muted ? 'Unmute buzzer' : 'Mute buzzer';
  if (S.mode === 'serial') send(S.muted ? 'M' : 'U');
  buzz(S.alarm && S.mode === 'demo' && !S.muted); refreshHardware();
};

/* ---------- console & downloads ---------- */
$('#btnPause').onclick = () => { S.paused = !S.paused; $('#btnPause').textContent = S.paused ? 'Resume' : 'Pause'; };
$('#btnClear').onclick = () => { $('#console').innerHTML = ''; };
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
function needRows() { if (!S.rows.length) { toast('No readings recorded yet'); return false; } return true; }
$('#dlCsv').onclick = () => {
  if (!needRows()) return;
  const cols = Object.keys(S.rows[0]);
  download(`slopeguard-${stamp()}.csv`, [cols.join(','), ...S.rows.map(r => cols.map(c => r[c]).join(','))].join('\n'), 'text/csv');
};
$('#dlJson').onclick = () => { if (needRows()) download(`slopeguard-${stamp()}.json`, JSON.stringify({ limits: cfg, readings: S.rows }, null, 2), 'application/json'); };
$('#dlLog').onclick = () => {
  if (!S.logLines.length) { toast('The log is empty'); return; }
  download(`slopeguard-log-${stamp()}.txt`, S.logLines.join('\n'), 'text/plain');
};

/* ---------- boot ---------- */
setConn(); goStep(0);
