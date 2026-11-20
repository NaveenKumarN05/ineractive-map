// Test mode: a 10-question quiz on the map. Loaded after app.js and uses its globals.

const QUIZ_LEN = 10;
const MAX_WRONG = 2;            // wrong clicks before the answer is shown (find questions)
const SR_PER_KM2 = (4 * Math.PI) / 510e6;
const INDIA = countries.find(c => c.id === '356');

const quizEl = document.getElementById('quiz');
const q$ = sel => quizEl.querySelector(sel);
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const areaKm2 = f => { let a = d3.geoArea(f); if (a > 2 * Math.PI) a = 4 * Math.PI - a; return a / SR_PER_KM2; };
const firstCapital = cap => cap[0].replace(/\s*\(.*\)$/, '');

// ---- Question pools ----
// Each item: { feature, isRegion, name, capital, flag, where }
function buildPool(scope, type) {
  if (scope === 'india') {
    const cfg = DRILL['356'];
    return cfg.features
      .map(f => ({ feature: f, isRegion: true, name: cfg.nameOf(f), capital: cfg.info[cfg.nameOf(f)]?.capital || [], flag: '🇮🇳', where: 'India' }))
      .filter(it => it.capital.length && (type === 'capital' || areaKm2(it.feature) > 3000));
  }
  return countries
    .map(f => { const i = infoFor(f); return { feature: f, isRegion: false, name: i.name, capital: i.capital, flag: i.flag, where: i.region }; })
    .filter(it => COUNTRY_INFO[it.feature.id] && it.capital.length && areaKm2(it.feature) > 20000);
}

let quiz = null; // { scope, type, pool, items, i, score, wrong, done }
let settings = { scope: 'world', type: 'find' };

// ---- Mode switch ----
function setMode(m) {
  if (mode === m) return;
  if (m === 'test') deselect(); // close the learn card / drill-down
  mode = m;
  document.body.classList.toggle('test', m === 'test');
  document.querySelectorAll('.modes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
  hideTooltip();
  if (canSpeak) speechSynthesis.cancel();
  if (m === 'test') {
    showSetup();
  } else {
    quiz = null;
    clearMarks();
    exitDrill();
    quizEl.classList.remove('show');
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
  }
  renderSeen();
}
document.querySelectorAll('.modes button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

// ---- Map helpers ----
const allPaths = () => [paths, regionPaths];
function clearMarks() {
  allPaths().forEach(p => p.classed('quiz-correct quiz-wrong quiz-target', false));
}
function mark(feature, isRegion, cls, on = true) {
  (isRegion ? regionPaths : paths).filter(d => d === feature).classed(cls, on);
}
function quizHomeView() {
  if (quiz?.scope === 'india' || (!quiz && settings.scope === 'india')) zoomTo(INDIA);
  else svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
}
const say = text => { if (optVoice.checked) speakText(text); };

// ---- Panel states ----
function show(state) {
  quizEl.dataset.state = state;
  quizEl.classList.add('show');
}

function showSetup() {
  quiz = null;
  clearMarks();
  quizEl.querySelectorAll('[data-scope]').forEach(b => b.setAttribute('aria-pressed', b.dataset.scope === settings.scope));
  quizEl.querySelectorAll('[data-type]').forEach(b => b.setAttribute('aria-pressed', b.dataset.type === settings.type));
  if (settings.scope === 'india' && !drilled) enterDrill(INDIA);
  if (settings.scope === 'world' && drilled) exitDrill();
  quizHomeView();
  show('setup');
}

quizEl.querySelectorAll('[data-scope]').forEach(b => b.addEventListener('click', () => { settings.scope = b.dataset.scope; showSetup(); }));
quizEl.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => { settings.type = b.dataset.type; showSetup(); }));
q$('.start').addEventListener('click', startQuiz);
q$('.again').addEventListener('click', startQuiz);
q$('.change').addEventListener('click', showSetup);
q$('.quit').addEventListener('click', showSetup);
q$('.next').addEventListener('click', nextQuestion);
q$('.repeat').addEventListener('click', () => quiz && speakText(promptSpeech()));

function startQuiz() {
  const pool = buildPool(settings.scope, settings.type);
  quiz = { ...settings, pool, items: shuffle(pool).slice(0, QUIZ_LEN), i: -1, score: 0 };
  nextQuestion();
}

function current() { return quiz.items[quiz.i]; }

function promptSpeech() {
  const it = current();
  return quiz.type === 'find' ? `Can you find ${it.name}?` : `What is the capital of ${it.name}?`;
}

function nextQuestion() {
  quiz.i++;
  if (quiz.i >= quiz.items.length) return finish();
  quiz.wrong = 0;
  quiz.done = false;
  clearMarks();
  const it = current();

  q$('.progress').textContent = `Question ${quiz.i + 1} of ${quiz.items.length}`;
  q$('.score').textContent = `⭐ ${quiz.score}`;
  q$('.flag').textContent = it.flag || '';
  q$('.feedback').textContent = '';
  q$('.feedback').className = 'feedback';
  q$('.next').hidden = true;
  q$('.next').textContent = quiz.i === quiz.items.length - 1 ? 'See results' : 'Next →';

  const choicesEl = q$('.choices');
  choicesEl.replaceChildren();
  if (quiz.type === 'find') {
    q$('.prompt').innerHTML = '';
    q$('.prompt').append('Find ', Object.assign(document.createElement('strong'), { textContent: it.name }));
    q$('.hint').textContent = `Click it on the map${quiz.scope === 'india' ? '' : ' — drag and zoom to look around'}.`;
    quizHomeView();
  } else {
    q$('.prompt').innerHTML = '';
    q$('.prompt').append('What is the capital of ', Object.assign(document.createElement('strong'), { textContent: it.name }), '?');
    q$('.hint').textContent = 'It’s highlighted on the map.';
    mark(it.feature, it.isRegion, 'quiz-target');
    quiz.scope === 'india' ? quizHomeView() : zoomTo(it.feature, 5);
    const answer = firstCapital(it.capital);
    const others = shuffle([...new Set(quiz.pool.filter(o => o !== it).map(o => firstCapital(o.capital)))].filter(c => c !== answer)).slice(0, 3);
    for (const c of shuffle([answer, ...others])) {
      const b = document.createElement('button');
      b.textContent = c;
      b.addEventListener('click', () => answerCapital(b, c === answer));
      choicesEl.append(b);
    }
  }
  show('question');
  say(promptSpeech());
}

function feedback(text, kind) {
  const el = q$('.feedback');
  el.textContent = text;
  el.className = `feedback ${kind}`;
}

function endQuestion() {
  quiz.done = true;
  q$('.score').textContent = `⭐ ${quiz.score}`;
  q$('.next').hidden = false;
  q$('.next').focus({ preventScroll: true });
}

const CHEERS = ['Great job!', 'Awesome!', 'You got it!', 'Super!', 'Well done!', 'Brilliant!'];
const cheer = () => CHEERS[Math.floor(Math.random() * CHEERS.length)];

// Map click while in test mode (from app.js).
function quizClick(feature, isRegion) {
  if (!quiz || quiz.done || quiz.type !== 'find') return;
  const it = current();
  if (feature === it.feature) {
    quiz.score++;
    mark(feature, isRegion, 'quiz-correct');
    const msg = `${cheer()} That’s ${it.name}.`;
    feedback(`🎉 ${msg}`, 'good');
    say(msg);
    return endQuestion();
  }
  const name = isRegion ? DRILL['356'].nameOf(feature) : infoFor(feature).name;
  quiz.wrong++;
  mark(feature, isRegion, 'quiz-wrong');
  setTimeout(() => mark(feature, isRegion, 'quiz-wrong', false), 1200);
  if (quiz.wrong < MAX_WRONG) {
    const msg = `Oops, that’s ${name}. Try again!`;
    feedback(msg, 'bad');
    say(msg);
  } else {
    mark(it.feature, it.isRegion, 'quiz-target');
    quiz.scope === 'india' ? quizHomeView() : zoomTo(it.feature, 5);
    const msg = `That’s ${name}. Here is ${it.name}!`;
    feedback(`👉 ${msg}`, 'bad');
    say(msg);
    endQuestion();
  }
}

function answerCapital(btn, correct) {
  if (quiz.done) return;
  const it = current();
  const answer = firstCapital(it.capital);
  q$('.choices').querySelectorAll('button').forEach(b => {
    b.disabled = true;
    if (b.textContent === answer) b.classList.add('right');
  });
  let msg;
  if (correct) {
    quiz.score++;
    mark(it.feature, it.isRegion, 'quiz-target', false);
    mark(it.feature, it.isRegion, 'quiz-correct');
    msg = `${cheer()} ${answer} is the capital of ${it.name}.`;
    feedback(`🎉 ${msg}`, 'good');
  } else {
    btn.classList.add('wrong');
    msg = `Not quite. The capital of ${it.name} is ${answer}.`;
    feedback(msg, 'bad');
  }
  say(msg);
  endQuestion();
}

function finish() {
  clearMarks();
  quizHomeView();
  const { score } = quiz, total = quiz.items.length;
  const pct = score / total;
  const stars = pct === 1 ? 3 : pct >= 0.7 ? 2 : pct >= 0.4 ? 1 : 0;
  q$('.stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  q$('.result').textContent = `You scored ${score} out of ${total}`;
  const msg = pct === 1 ? 'Perfect score! You’re a geography star!'
    : pct >= 0.7 ? 'Great work! Keep exploring!'
    : pct >= 0.4 ? 'Good try! Practise in Learn mode and try again.'
    : 'Keep practising in Learn mode — you’ll get there!';
  q$('.result-msg').textContent = msg;
  show('done');
  say(`You scored ${score} out of ${total}. ${msg}`);
}
