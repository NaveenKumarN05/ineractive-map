// Interactive world map: drag to pan, scroll/pinch to zoom, click a country for info.
// Countries listed in DRILL can be drilled into to explore their states.

const svg = d3.select('#map');
const g = svg.append('g');
const countryLayer = g.append('g');
const regionLayer = g.append('g');
const infoEl = document.getElementById('info');
const tooltip = document.getElementById('tooltip');
const crumbsEl = document.getElementById('crumbs');

// Map shapes without an ISO numeric code -> lookup key in COUNTRY_INFO.
const NAME_FALLBACK = { 'Kosovo': 'X-XK' };

const countries = topojson.feature(WORLD_TOPO, WORLD_TOPO.objects.countries).features
  .filter(f => f.properties.name !== 'Antarctica');

// Countries with state-level drill-down.
const DRILL = {
  '356': {
    unitPlural: 'states & UTs',
    features: topojson.feature(INDIA_TOPO, INDIA_TOPO.objects.states).features,
    nameOf: f => f.properties.st_nm,
    info: INDIA_STATES,
  },
};

function infoFor(feature) {
  const key = feature.id ?? NAME_FALLBACK[feature.properties.name];
  return COUNTRY_INFO[key] || { name: feature.properties.name, official: '', capital: [], region: '', flag: '' };
}

const projection = d3.geoNaturalEarth1();
const path = d3.geoPath(projection);

// 'learn' = explore freely; 'test' = quiz (see quiz.js).
let mode = 'learn';

function showTooltip(event, text) {
  if (mode === 'test') return; // names would give away the answers
  tooltip.textContent = text;
  tooltip.style.left = event.clientX + 12 + 'px';
  tooltip.style.top = event.clientY + 12 + 'px';
  tooltip.style.opacity = 1;
}
const hideTooltip = () => { tooltip.style.opacity = 0; };

const paths = countryLayer.selectAll('path')
  .data(countries)
  .join('path')
  .attr('class', 'country')
  .on('mousemove', (event, d) => showTooltip(event, infoFor(d).name))
  .on('mouseleave', hideTooltip)
  .on('click', (event, d) => { event.stopPropagation(); mode === 'test' ? quizClick(d, false) : selectCountry(d); });

let regionPaths = regionLayer.selectAll('path');

// ---- Zoom & pan ----
const zoom = d3.zoom()
  .scaleExtent([1, 60])
  .on('zoom', (event) => g.attr('transform', event.transform));
svg.call(zoom).on('dblclick.zoom', null);

function layout() {
  const w = window.innerWidth, h = window.innerHeight;
  svg.attr('viewBox', [0, 0, w, h]);
  projection.fitExtent([[10, 10], [w - 10, h - 10]], { type: 'FeatureCollection', features: countries });
  paths.attr('d', path);
  regionPaths.attr('d', path);
  zoom.translateExtent([[-w, -h], [2 * w, 2 * h]]);
}
layout();
window.addEventListener('resize', layout);

function zoomTo(feature, maxK = 60) {
  const w = window.innerWidth, h = window.innerHeight;
  // Keep the shape clear of the header/breadcrumb at the top and the info card at the bottom.
  const top = 110, bottom = Math.min(260, h * 0.38);
  const availH = Math.max(100, h - top - bottom);
  const [[x0, y0], [x1, y1]] = path.bounds(feature);
  const k = Math.min(maxK, 0.92 / Math.max((x1 - x0) / w, (y1 - y0) / availH));
  const t = d3.zoomIdentity.translate(w / 2, top + availH / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
  svg.transition().duration(750).call(zoom.transform, t);
}

d3.select('#zoom-in').on('click', () => svg.transition().duration(300).call(zoom.scaleBy, 1.6));
d3.select('#zoom-out').on('click', () => svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.6));
d3.select('#zoom-reset').on('click', () => {
  if (mode === 'test') return quizHomeView();
  deselect();
  svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
});

// ---- Seen tracking (remembered in this browser) ----
const keyOf = f => f.id ?? f.properties.name;
const regionKey = (countryId, name) => `${countryId}:${name}`;
const SEEN_KEY = 'worldmap.seen';
let seen;
try { seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY)) || []); } catch { seen = new Set(); }
const optionsEl = document.getElementById('options');
const optSeen = document.getElementById('opt-seen');
const optVoice = document.getElementById('opt-voice');

function saveSeen() { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch {} }
function renderSeen() {
  const on = optSeen.checked && mode === 'learn';
  paths.classed('seen', d => on && seen.has(keyOf(d)));
  if (drilled) regionPaths.classed('seen', d => on && seen.has(regionKey(drilled.id, drilled.cfg.nameOf(d))));
  optionsEl.classList.toggle('no-seen', !on);
  const nCountries = countries.filter(c => seen.has(keyOf(c))).length;
  let text = `Seen ${nCountries} / ${countries.length} countries`;
  if (drilled) {
    const n = drilled.cfg.features.filter(f => seen.has(regionKey(drilled.id, drilled.cfg.nameOf(f)))).length;
    text += ` · ${n} / ${drilled.cfg.features.length} ${drilled.cfg.unitPlural}`;
  }
  document.getElementById('seen-count').textContent = text;
}
optSeen.addEventListener('change', renderSeen);
document.getElementById('seen-reset').addEventListener('click', () => { seen.clear(); saveSeen(); renderSeen(); });

// ---- Voice ----
let currentInfo = null;
const speakBtn = infoEl.querySelector('.speak');
const canSpeak = 'speechSynthesis' in window;
if (!canSpeak) { speakBtn.hidden = true; optVoice.parentElement.hidden = true; }

// Voice picker: the list comes from the device, so group what we recognise.
const KID_VOICES = ['Junior', 'Flo', 'Sandy', 'Shelley', 'Grandma', 'Grandpa', 'Samantha', 'Rishi'];
const FUN_VOICES = ['Bubbles', 'Boing', 'Superstar', 'Good News', 'Jester', 'Wobble', 'Trinoids', 'Zarvox', 'Whisper', 'Albert', 'Bahh'];
const VOICE_PREFS_KEY = 'worldmap.voice';
const voiceSelect = document.getElementById('opt-voice-name');
const pitchInput = document.getElementById('opt-pitch');
const rateInput = document.getElementById('opt-rate');
const sayCapitalInput = document.getElementById('opt-say-capital');
let voices = [];

let voicePrefs = {};
try { voicePrefs = JSON.parse(localStorage.getItem(VOICE_PREFS_KEY)) || {}; } catch {}
if (voicePrefs.pitch) pitchInput.value = voicePrefs.pitch;
if (voicePrefs.rate) rateInput.value = voicePrefs.rate;
if (voicePrefs.enabled === false) optVoice.checked = false;
if (voicePrefs.sayCapital === false) sayCapitalInput.checked = false;

function saveVoicePrefs() {
  voicePrefs = { voice: voiceSelect.value, pitch: pitchInput.value, rate: rateInput.value, enabled: optVoice.checked, sayCapital: sayCapitalInput.checked };
  try { localStorage.setItem(VOICE_PREFS_KEY, JSON.stringify(voicePrefs)); } catch {}
  optionsEl.classList.toggle('voice-off', !optVoice.checked);
}

const baseName = v => v.name.replace(/\s*\(.*\)$/, '');
function populateVoices() {
  voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
  if (!voices.length) return;
  const groups = { 'Kid-friendly': [], 'Fun & silly': [], 'Other voices': [] };
  for (const v of voices) {
    const b = baseName(v);
    (KID_VOICES.includes(b) ? groups['Kid-friendly'] : FUN_VOICES.includes(b) ? groups['Fun & silly'] : groups['Other voices']).push(v);
  }
  groups['Kid-friendly'].sort((a, b) => KID_VOICES.indexOf(baseName(a)) - KID_VOICES.indexOf(baseName(b)));
  const label = v => `${v.name.replace(/\(English \((.*)\)\)/, '($1)')}${/\(/.test(v.name) ? '' : ` (${v.lang})`}`;
  voiceSelect.replaceChildren(new Option('Device default', ''));
  for (const [name, list] of Object.entries(groups)) {
    if (!list.length) continue;
    const og = document.createElement('optgroup');
    og.label = name;
    list.forEach(v => og.append(new Option(label(v), v.voiceURI)));
    voiceSelect.append(og);
  }
  const fallback = voices.find(v => baseName(v) === 'Junior');
  const wanted = voicePrefs.voice ?? fallback?.voiceURI ?? '';
  voiceSelect.value = voices.some(v => v.voiceURI === wanted) ? wanted : '';
}

function speak(info) {
  if (!sayCapitalInput.checked) return speakText(`${info.name}.`);
  speakText(`${info.name}. ${info.capital.length ? `The capital is ${info.capital.join(' and ')}.` : 'It has no listed capital.'}`);
}

function speakText(text) {
  if (!canSpeak) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = voices.find(v => v.voiceURI === voiceSelect.value);
  if (v) { u.voice = v; u.lang = v.lang; }
  u.pitch = +pitchInput.value;
  u.rate = +rateInput.value;
  u.onstart = () => speakBtn.classList.add('speaking');
  u.onend = u.onerror = () => speakBtn.classList.remove('speaking');
  speechSynthesis.speak(u);
}
speakBtn.addEventListener('click', () => currentInfo && speak(currentInfo));

if (canSpeak) {
  populateVoices();
  speechSynthesis.addEventListener('voiceschanged', populateVoices);
}
[voiceSelect, pitchInput, rateInput, optVoice, sayCapitalInput].forEach(el => el.addEventListener('change', saveVoicePrefs));
voiceSelect.addEventListener('change', () => speakText('Hello! Let’s explore the world.'));
document.getElementById('voice-test').addEventListener('click', () =>
  currentInfo ? speak(currentInfo) : speakText('Hello! Let’s explore the world.'));
optionsEl.classList.toggle('voice-off', !optVoice.checked);

// ---- Info card ----
function showCard(info) {
  currentInfo = info;
  infoEl.querySelector('.flag').textContent = info.flag || '';
  infoEl.querySelector('.name').textContent = info.name;
  infoEl.querySelector('.official').textContent = info.official && info.official !== info.name ? info.official : '';
  infoEl.querySelector('.capital').textContent = info.capital.length ? info.capital.join(', ') : '—';
  infoEl.querySelector('.region-label').textContent = info.regionLabel || 'Region';
  infoEl.querySelector('.region').textContent = info.region || '—';
  infoEl.querySelector('.hint').textContent = info.hint || '';
  infoEl.classList.add('show');
  if (optVoice.checked) speak(info);
}

// ---- Breadcrumbs ----
function renderCrumbs(country, regionName) {
  crumbsEl.replaceChildren();
  if (!country) { crumbsEl.classList.remove('show'); return; }
  const add = (label, onClick) => {
    if (crumbsEl.childElementCount) crumbsEl.append(Object.assign(document.createElement('span'), { textContent: '›', className: 'sep' }));
    const el = document.createElement(onClick ? 'button' : 'span');
    el.textContent = label;
    if (onClick) el.addEventListener('click', onClick);
    crumbsEl.append(el);
  };
  add('World', () => { deselect(); svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity); });
  add(infoFor(country).name, regionName ? () => selectCountry(country) : null);
  if (regionName) add(regionName, null);
  crumbsEl.classList.add('show');
}

// ---- Drill-down ----
let drilled = null; // { id, feature, cfg }

function enterDrill(country) {
  const cfg = DRILL[country.id];
  drilled = { id: country.id, feature: country, cfg };
  svg.classed('drilled', true);
  paths.classed('drill-parent', d => d === country);
  regionPaths = regionLayer.selectAll('path')
    .data(cfg.features)
    .join('path')
    .attr('class', 'subregion')
    .attr('d', path)
    .on('mousemove', (event, d) => showTooltip(event, cfg.nameOf(d)))
    .on('mouseleave', hideTooltip)
    .on('click', (event, d) => { event.stopPropagation(); mode === 'test' ? quizClick(d, true) : selectRegion(d); });
}

function exitDrill() {
  drilled = null;
  svg.classed('drilled', false);
  paths.classed('drill-parent', false);
  regionPaths = regionLayer.selectAll('path').data([]).join('path');
}

function selectRegion(feature) {
  const { cfg, id, feature: country } = drilled;
  const name = cfg.nameOf(feature);
  const extra = cfg.info[name] || { capital: [], type: '' };
  regionPaths.classed('selected', d => d === feature);
  seen.add(regionKey(id, name)); saveSeen(); renderSeen();
  renderCrumbs(country, name);
  const parent = infoFor(country);
  showCard({
    name,
    official: `${extra.type || 'Region'} of ${parent.name}`,
    capital: extra.capital,
    region: parent.name,
    regionLabel: 'Country',
    flag: parent.flag,
  });
}

// ---- Selection ----
function selectCountry(feature) {
  if (drilled && drilled.feature !== feature) exitDrill();
  paths.classed('selected', d => d === feature && !DRILL[d.id]);
  seen.add(keyOf(feature)); saveSeen();

  const info = infoFor(feature);
  const cfg = DRILL[feature.id];
  if (cfg) {
    if (!drilled) enterDrill(feature);
    regionPaths.classed('selected', false);
    zoomTo(feature);
    showCard({ ...info, hint: `Click a state to see its capital · ${cfg.features.length} ${cfg.unitPlural}` });
  } else {
    showCard(info);
  }
  renderCrumbs(feature, null);
  renderSeen();
}

function deselect() {
  currentInfo = null;
  if (canSpeak) speechSynthesis.cancel();
  exitDrill();
  paths.classed('selected', false);
  infoEl.classList.remove('show');
  renderCrumbs(null);
  renderSeen();
}

infoEl.querySelector('.close').addEventListener('click', deselect);
svg.on('click', () => { if (mode === 'learn') deselect(); }); // click the ocean to clear
document.addEventListener('keydown', e => { if (e.key === 'Escape' && mode === 'learn') deselect(); });
renderSeen();
