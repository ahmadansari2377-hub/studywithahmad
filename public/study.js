// =====================================================================
//  Study with Ahmad — study planner for Matric & Intermediate (Punjab Board)
//  All data lives in this browser (localStorage).
// =====================================================================
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const jsDayToIdx = (d) => (d + 6) % 7; // Monday = 0

// ---------- Storage ----------
const KEY = "studynest-v2";
const defaults = () => ({
  profile: null, extras: [], tasks: [], blocks: [], exams: [], cards: [], seeded: [],
  sessions: [], syl: {}, settings: { focus: 25, short: 5, long: 15 },
});
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...defaults(), ...JSON.parse(raw) }; } catch (e) {}
  return defaults();
}
let state = load();
function saveLocal() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
function save() { saveLocal(); if (token) scheduleSync(); }

// ---------- Cloud database (needs the Study with Ahmad server: `uv run website`) ----------
const CLOUD = location.protocol.startsWith("http");
let token = null, username = null, pulling = false, syncTimer;
try { token = localStorage.getItem("studynest-token"); username = localStorage.getItem("studynest-user"); } catch (e) {}
if (!CLOUD) token = null;

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) forgetLogin();
    // 503 = the server is up but its database isn't connected; the details are for the site owner, not students
    if (res.status === 503) throw new Error("Sign-in is down for a moment (the database isn't connected). You can keep using the planner on this device.");
    throw new Error(body.detail || "The server didn't respond — is it running?");
  }
  return body;
}
function setSync(status, msg) {
  const dot = $("#syncDot");
  dot.className = "sync-dot " + (token ? status : "");
  $("#accountText").textContent = username || "Sign in";
  $("#accountBtn").title = token ? msg || { ok: "Saved to the cloud", saving: "Saving…", error: "Couldn't save — will retry" }[status] || "" : "Sign in to save to the cloud";
  const st = $("#authStatus");
  if (st) st.textContent = token ? (msg || { ok: "Everything is saved to the cloud database.", saving: "Saving your latest changes…", error: "Couldn't reach the server — your changes are kept on this device and will sync later." }[status]) : "";
}
function scheduleSync() {
  clearTimeout(syncTimer);
  setSync("saving");
  syncTimer = setTimeout(pushState, 900);
}
async function pushState() {
  try { await api("/api/state", { method: "PUT", body: JSON.stringify({ data: state }) }); setSync("ok"); }
  catch (e) { setSync("error"); syncTimer = setTimeout(pushState, 15000); }
}
// Cloud copy wins if it exists; otherwise this device's planner is uploaded.
async function pullState() {
  const res = await api("/api/state");
  if (res.data) { state = { ...defaults(), ...res.data }; saveLocal(); }
  else await pushState();
  setSync("ok");
  return !!res.data;
}
function rememberLogin(t, u) {
  token = t; username = u;
  try { localStorage.setItem("studynest-token", t); localStorage.setItem("studynest-user", u); } catch (e) {}
}
function forgetLogin() {
  token = null; username = null;
  try { localStorage.removeItem("studynest-token"); localStorage.removeItem("studynest-user"); } catch (e) {}
  setSync("idle");
}

// ---------- Motion setup ----------
const root = document.documentElement;
if (!window.gsap || !window.ScrollTrigger) root.classList.remove("anim");
const A = root.classList.contains("anim");
setTimeout(() => { $("#loader").style.display = "none"; if (lenis) lenis.start(); }, 6000); // never get stuck behind the loader
let lenis = null;
if (A) {
  gsap.registerPlugin(ScrollTrigger);
  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.1 });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
}
let refreshTimer;
const refreshTriggers = () => { if (!A) return; clearTimeout(refreshTimer); refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 200); };

function splitWords(el) {
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.append(" ");
          const o = document.createElement("span"), i = document.createElement("span");
          o.className = "w"; i.className = "wi"; i.textContent = part;
          o.append(i); frag.append(o);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== "BR") walk(n);
    });
  };
  walk(el);
  return $$(".wi", el);
}

// ---------- Subjects ----------
const levelOf = (cls) => (cls <= 10 ? "matric" : "inter");
function groupOf(p = state.profile) { return p && GROUPS[levelOf(p.cls)].find((g) => g.id === p.group); }
function subjects() {
  const g = groupOf();
  const core = g ? g.subjects : [];
  return [
    ...core.map((id) => ({ id, ...SUBJECT_INFO[id], core: true })),
    ...(state.profile ? COMPULSORY[state.profile.cls] : []).map((id) => ({ id, ...SUBJECT_INFO[id] })),
    ...state.extras.map((x) => ({ ...x, extra: true })),
  ];
}
function subj(id) { return subjects().find((s) => s.id === id) || { id, name: SUBJECT_INFO[id]?.name || "General", color: SUBJECT_INFO[id]?.color || "#8a8a9a" }; }
const subjOptions = (sel) => subjects().map((s) => `<option value="${s.id}" ${s.id === sel ? "selected" : ""}>${esc(s.name)}</option>`).join("");

// ---------- Toast, confetti, sound ----------
const toastEl = $("#toast");
let toastT;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove("show"), 2400);
}
const cv = $("#confetti"), cx = cv.getContext("2d");
let bits = [], confettiOn = false;
function confetti(x = innerWidth / 2, y = innerHeight / 2, n = 90) {
  if (!A) return;
  cv.width = innerWidth; cv.height = innerHeight;
  const cols = ["#5b4bf5", "#ff6b57", "#f2b02f", "#1fae86", "#2f8cf0"];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 9;
    bits.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6, r: 3 + Math.random() * 5, c: cols[i % 5], rot: Math.random() * 6, life: 1 });
  }
  if (!confettiOn) { confettiOn = true; requestAnimationFrame(drawConfetti); }
}
function drawConfetti() {
  cx.clearRect(0, 0, cv.width, cv.height);
  bits = bits.filter((b) => b.life > 0);
  bits.forEach((b) => {
    b.vy += 0.3; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.rot += 0.15; b.life -= 0.011;
    cx.save(); cx.translate(b.x, b.y); cx.rotate(b.rot); cx.globalAlpha = Math.max(b.life, 0);
    cx.fillStyle = b.c; cx.fillRect(-b.r, -b.r / 2, b.r * 2, b.r); cx.restore();
  });
  if (bits.length) requestAnimationFrame(drawConfetti);
  else { confettiOn = false; cx.clearRect(0, 0, cv.width, cv.height); }
}
function chime() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [660, 880, 1046].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0.0001, ac.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.18 + 0.5);
      o.connect(g).connect(ac.destination);
      o.start(ac.currentTime + i * 0.18); o.stop(ac.currentTime + i * 0.18 + 0.55);
    });
  } catch (e) {}
}
const centerOf = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

// =====================================================================
//  Setup: class & group
// =====================================================================
const setup = $("#setup");
let pick = {};
function openSetup() {
  pick = state.profile ? { ...state.profile } : {};
  renderSetup();
  setup.classList.add("open");
  setup.setAttribute("aria-hidden", "false");
  if (lenis) lenis.stop();
  if (A) gsap.fromTo($$(".setup-card > *"), { y: 24, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.07, duration: 0.8, delay: 0.15, ease: "expo.out" });
}
function closeSetup(force) {
  if (!state.profile && force !== true) return; // a class must be chosen first
  setup.classList.remove("open");
  setup.setAttribute("aria-hidden", "true");
  if (lenis) lenis.start();
}
function renderSetup() {
  $$("#classChoices button").forEach((b) => b.classList.toggle("active", +b.dataset.cls === pick.cls));
  const groups = pick.cls ? GROUPS[levelOf(pick.cls)] : [];
  if (pick.cls && !groups.some((g) => g.id === pick.group)) pick.group = null;
  $("#groupChoices").innerHTML = groups.map((g) => `
    <button data-group="${g.id}" class="${g.id === pick.group ? "active" : ""}"><b>${g.name}</b><small>${g.subjects.map((s) => SUBJECT_INFO[s].name).join(" · ")}</small></button>`).join("");
  if (A && groups.length) gsap.from($$("#groupChoices button"), { y: 16, opacity: 0, stagger: 0.06, duration: 0.6, ease: "expo.out" });
  $("#setupDone").disabled = !(pick.cls && pick.group);
}
$("#classChoices").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { pick.cls = +b.dataset.cls; renderSetup(); } });
$("#groupChoices").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { pick.group = b.dataset.group; renderSetup(); } });
$("#setupBg").onclick = closeSetup;
$("#classBtn").onclick = openSetup;
$("#setupDone").onclick = () => {
  const first = !state.profile;
  state.profile = { cls: pick.cls, group: pick.group };
  seedFor(first);
  save();
  sylSubject = null;
  renderAll(true);
  closeSetup();
  toast(`Planner ready for Class ${pick.cls} · ${groupOf().name}`);
  confetti(innerWidth / 2, innerHeight / 3, 120);
};

// =====================================================================
//  Account: sign in / create account / sign out
// =====================================================================
const auth = $("#auth");
let authTab = "login";
function openAuth() {
  const signed = !!token;
  $("#authForms").hidden = signed || !CLOUD;
  $("#authSigned").hidden = !signed;
  $("#authOffline").hidden = CLOUD;
  if (signed) { $("#authName").textContent = username; setSync($("#syncDot").classList.contains("error") ? "error" : "ok"); }
  $("#authError").textContent = "";
  auth.classList.add("open");
  auth.setAttribute("aria-hidden", "false");
  if (lenis) lenis.stop();
  requestAnimationFrame(() => setAuthTab(authTab));
  if (A) gsap.fromTo($$(".auth-card > div:not([hidden]) > *, .auth-card > p:not([hidden])"), { y: 24, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.06, duration: 0.8, delay: 0.15, ease: "expo.out" });
  if (!signed && CLOUD) setTimeout(() => $("#authUser").focus(), 300);
}
function closeAuth() {
  auth.classList.remove("open");
  auth.setAttribute("aria-hidden", "true");
  if (!state.profile && !pulling) return openSetup();
  if (lenis && !setup.classList.contains("open")) lenis.start();
}
function setAuthTab(t) {
  authTab = t;
  const btn = $(`#authTabs button[data-tab="${t}"]`);
  $$("#authTabs button").forEach((b) => b.classList.toggle("active", b === btn));
  movePill($("#authTabs"), $("#authPill"), btn);
  $("#authSubmit").textContent = t === "login" ? "Sign in" : "Create my account";
  $("#authPass").autocomplete = t === "login" ? "current-password" : "new-password";
  $("#authError").textContent = "";
}
$("#accountBtn").onclick = openAuth;
$("#authBg").onclick = closeAuth;
$("#authClose").onclick = closeAuth;
$("#authTabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (b) setAuthTab(b.dataset.tab); });
$("#setupSignIn").onclick = () => { closeSetup(true); authTab = "login"; openAuth(); };
$("#authSkip").onclick = () => { try { sessionStorage.setItem("swa-guest", "1"); } catch (e) {} closeAuth(); };
// On arrival: sign in first (once per visit), then pick a class if this device has none yet
function openStart() {
  let guest = false;
  try { guest = !!sessionStorage.getItem("swa-guest"); } catch (e) {}
  if (CLOUD && !token && !guest) { authTab = "login"; openAuth(); }
  else if (!state.profile && !pulling) openSetup();
}
$("#authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submit = $("#authSubmit");
  submit.disabled = true;
  $("#authError").textContent = "";
  try {
    const res = await api(authTab === "login" ? "/api/login" : "/api/signup", {
      method: "POST",
      body: JSON.stringify({ username: $("#authUser").value, password: $("#authPass").value }),
    });
    rememberLogin(res.token, res.username);
    pulling = true;
    const hadCloud = await pullState();
    pulling = false;
    $("#authPass").value = "";
    renderAll(true);
    closeAuth();
    toast(hadCloud ? `Welcome back, ${res.username} — your planner is loaded` : `Signed in as ${res.username} — your planner is now saved to the cloud`);
    confetti(innerWidth / 2, innerHeight / 3, 100);
  } catch (err) {
    pulling = false;
    $("#authError").textContent = err.message;
    if (A) gsap.fromTo(".auth-card", { x: -10 }, { x: 0, duration: 0.5, ease: "elastic.out(1,0.3)" });
  } finally {
    submit.disabled = false;
  }
});
$("#syncNow").onclick = async () => { clearTimeout(syncTimer); setSync("saving"); await pushState(); toast("Synced with the cloud"); };
$("#signOut").onclick = async () => {
  try { await api("/api/logout", { method: "POST" }); } catch (e) {}
  forgetLogin();
  state = defaults();
  saveLocal(); // don't leave this student's planner on a shared computer
  location.reload();
};

// Starter content for a class: flashcards always, plus a sample plan on first setup
function seedFor(first) {
  const { cls } = state.profile;
  const tag = `cards-${cls}`;
  if (!state.seeded.includes(tag)) {
    Object.entries(STARTER_CARDS[cls]).forEach(([s, list]) => list.forEach(([f, b]) => state.cards.push({ id: uid(), subject: s, front: f, back: b, cls })));
    state.seeded.push(tag);
  }
  if (!first) return;
  const core = groupOf().subjects;
  const today = new Date();
  const ch = (s, i) => { const b = SYLLABUS[cls][s]; return `Ch ${b.start + i}: ${b.chapters[i]}`; };
  state.tasks.push(
    { id: uid(), text: `Read ${ch(core[0], 0)}`, subject: core[0], due: dayKey(today), priority: 2, done: false },
    { id: uid(), text: `Solve exercise questions — ${ch(core[1], 0)}`, subject: core[1], due: dayKey(addDays(today, 1)), priority: 1, done: false },
    { id: uid(), text: "Learn 10 English vocabulary words", subject: "english", due: dayKey(today), priority: 0, done: false },
    { id: uid(), text: `Make short notes — ${ch(core[2], 0)}`, subject: core[2], due: dayKey(addDays(today, 2)), priority: 1, done: false },
  );
  const college = cls >= 11 ? "College" : "School";
  for (let d = 0; d < 5; d++) state.blocks.push({ id: uid(), day: d, start: "08:00", end: "13:30", subject: "english", title: college });
  [[0, core[0]], [2, core[1]], [4, core[2]]].forEach(([d, s]) => state.blocks.push({ id: uid(), day: d, start: "16:00", end: "17:30", subject: s, title: `${SUBJECT_INFO[s].name} tuition` }));
  [1, 3].forEach((d) => state.blocks.push({ id: uid(), day: d, start: "20:00", end: "21:30", subject: core[d === 1 ? 0 : 1], title: "Self-study" }));
  state.blocks.push({ id: uid(), day: 5, start: "10:00", end: "12:00", subject: core[0], title: "Weekly revision" });
  const at = (d, h) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  state.exams.push(
    { id: uid(), title: `${SUBJECT_INFO[core[0]].name} monthly test`, subject: core[0], date: at(addDays(today, 9), 9) },
    { id: uid(), title: "Send-up exams (update date)", subject: core[1], date: at(addDays(today, 75), 9) },
    { id: uid(), title: "Annual board exams (update date)", subject: "english", date: at(addDays(today, cls >= 11 ? 170 : 130), 9) },
  );
}

// =====================================================================
//  Header, hero & stats
// =====================================================================
const QUOTES = [
  "<b>One chapter a day</b> finishes a whole book in a few weeks.",
  "Don't study until you get it right — study until you <b>can't get it wrong</b>.",
  "Small sessions, done daily, <b>beat long nights</b> before the exam.",
  "Revise today what you learned <b>yesterday</b>, and you'll keep it.",
  "The best time to start was last week. <b>The next best time is now.</b>",
];
function renderHeader() {
  const p = state.profile;
  $("#classBtnText").innerHTML = p ? `Class ${p.cls}<span class="cb-group"> · ${groupOf().name}</span>` : "Choose class";
  const now = new Date();
  $("#todayChip").textContent = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) + (p ? ` · Class ${p.cls}` : "");
}
function greetingText() {
  const h = new Date().getHours();
  const part = h < 5 ? "Up late?" : h < 12 ? "Good morning," : h < 17 ? "Good afternoon," : "Good evening,";
  return `${part} <em>let's get</em>`;
}
let qi = 0;
function rotateQuote() {
  const q = $("#quote");
  q.style.opacity = 0;
  setTimeout(() => { q.innerHTML = QUOTES[qi++ % QUOTES.length]; q.style.opacity = 1; }, 450);
}
const todaysSessions = () => state.sessions.filter((s) => s.date === dayKey());
function streak() {
  const active = new Set([...state.sessions.map((s) => s.date), ...state.tasks.filter((t) => t.doneAt).map((t) => t.doneAt)]);
  let n = 0, d = new Date();
  if (!active.has(dayKey(d))) d = addDays(d, -1);
  while (active.has(dayKey(d))) { n++; d = addDays(d, -1); }
  return n;
}
function nextExam() {
  const now = Date.now();
  return state.exams.filter((e) => new Date(e.date) > now).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
}
const statVals = () => {
  const ne = nextExam();
  return {
    statFocus: todaysSessions().reduce((s, x) => s + x.min, 0),
    statTasks: state.tasks.filter((t) => t.doneAt === dayKey()).length,
    statStreak: streak(),
    statExam: ne ? Math.floor((new Date(ne.date) - Date.now()) / 864e5) : null,
    examName: ne ? ne.title : null,
  };
};
function renderStats(animate) {
  const v = statVals();
  ["statFocus", "statTasks", "statStreak", "statExam"].forEach((k) => {
    const el = $("#" + k);
    if (v[k] === null) { el.textContent = "–"; return; }
    if (animate && A) {
      const o = { n: 0 };
      gsap.to(o, { n: v[k], duration: 1.6, ease: "power2.out", onUpdate: () => (el.textContent = Math.round(o.n)) });
    } else el.textContent = v[k];
  });
  $("#statExamLabel").textContent = v.examName ? `days to ${v.examName}` : "no upcoming exams";
}

// =====================================================================
//  Syllabus
// =====================================================================
let sylSubject = null;
const sylKey = (s, n) => `${state.profile.cls}-${s}-${n}`;
function bookOf(s) { return state.profile && SYLLABUS[state.profile.cls][s]; }
function bookProgress(s) {
  const b = bookOf(s);
  if (!b) return { read: 0, rev: 0, total: 0 };
  let read = 0, rev = 0;
  b.chapters.forEach((_, i) => { const p = state.syl[sylKey(s, b.start + i)] || {}; if (p.r) read++; if (p.v) rev++; });
  return { read, rev, total: b.chapters.length };
}
// Group subjects first, then the compulsory ones for this class
const bookSubjects = () => (state.profile ? [...groupOf().subjects, ...COMPULSORY[state.profile.cls]] : []);
function renderSyllabus(animate) {
  if (!state.profile) return;
  const all = bookSubjects(), core = groupOf().subjects;
  if (!all.includes(sylSubject)) sylSubject = all[0];
  $("#sylSubjects").innerHTML = all.map((s, i) => {
    const p = bookProgress(s), info = SUBJECT_INFO[s];
    return `<button class="syl-tab ${s === sylSubject ? "active" : ""} ${i === core.length ? "first-comp" : ""}" data-subj="${s}" style="--c:${info.color}">
      <b><span class="dot" style="background:${info.color}"></span>${info.name}</b>
      <small data-prog="${s}">${p.read}/${p.total} chapters read</small>
      <div class="sb-track"><i data-bar="${s}" style="--c:${info.color};transform:scaleX(${p.total ? p.read / p.total : 0})"></i></div>
    </button>`;
  }).join("");
  renderChapters(animate);
  renderOverall();
}
function renderChapters(animate) {
  const b = bookOf(sylSubject), info = SUBJECT_INFO[sylSubject];
  const p = bookProgress(sylSubject);
  $("#sylTitle").textContent = `${info.name} — Class ${state.profile.cls}`;
  $("#sylMeta").textContent = `${b.chapters.length} chapters · ${p.read} read · ${p.rev} revised · PTB 2026–27 edition`;
  $("#chapters").innerHTML = b.chapters.map((name, i) => {
    const n = b.start + i, pr = state.syl[sylKey(sylSubject, n)] || {};
    return `<li class="chapter ${pr.v ? "revised" : ""}" style="--c:${info.color}" data-n="${n}">
      <span class="ch-num">${n}</span>
      <div><h4 ${info.rtl ? 'class="ur" dir="rtl" lang="ur"' : ""}>${esc(name)}</h4><p>Chapter ${n} · ${info.name}</p></div>
      <div class="ch-actions">
        <button class="toggle read ${pr.r ? "on" : ""}" data-act="r"><svg><use href="#i-check"/></svg>Read</button>
        <button class="toggle rev ${pr.v ? "on" : ""}" data-act="v"><svg><use href="#i-check"/></svg>Revised</button>
        <button class="toggle plan" data-act="plan"><svg><use href="#i-plus"/></svg>Plan</button>
      </div>
    </li>`;
  }).join("");
  if (animate && A) gsap.fromTo($$("#chapters .chapter"), { x: -40, opacity: 0 }, { x: 0, opacity: 1, stagger: 0.04, duration: 0.8, ease: "expo.out" });
  refreshTriggers();
}
function renderOverall() {
  if (!state.profile) return;
  let read = 0, total = 0;
  bookSubjects().forEach((s) => { const p = bookProgress(s); read += p.read; total += p.total; });
  const pct = total ? Math.round((read / total) * 100) : 0;
  $("#overallPct").textContent = pct + "%";
  $("#overallText").textContent = `of your syllabus read · ${read}/${total} chapters`;
  $("#overallRing").style.strokeDashoffset = 326.7 * (1 - pct / 100);
}
function updateSubjectProgress(s) {
  const p = bookProgress(s);
  const small = $(`[data-prog="${s}"]`), bar = $(`[data-bar="${s}"]`);
  if (small) small.textContent = `${p.read}/${p.total} chapters read`;
  if (bar) { if (A) gsap.to(bar, { scaleX: p.total ? p.read / p.total : 0, duration: 0.9, ease: "expo.out" }); else bar.style.transform = `scaleX(${p.read / p.total})`; }
  $("#sylMeta").textContent = `${p.total} chapters · ${p.read} read · ${p.rev} revised · PTB 2026–27 edition`;
  renderOverall();
}
$("#sylSubjects").addEventListener("click", (e) => {
  const t = e.target.closest(".syl-tab");
  if (!t || t.dataset.subj === sylSubject) return;
  sylSubject = t.dataset.subj;
  $$(".syl-tab").forEach((x) => x.classList.toggle("active", x === t));
  if (A) gsap.to("#chapters .chapter", { x: 40, opacity: 0, stagger: 0.015, duration: 0.25, ease: "power2.in", onComplete: () => renderChapters(true) });
  else renderChapters();
});
$("#chapters").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const li = btn.closest(".chapter"), n = +li.dataset.n, k = sylKey(sylSubject, n);
  const b = bookOf(sylSubject), name = b.chapters[n - b.start];
  if (btn.dataset.act === "plan") {
    state.tasks.push({ id: uid(), text: `Study Ch ${n}: ${name}`, subject: sylSubject, due: dayKey(addDays(new Date(), 1)), priority: 1, done: false });
    save(); renderTasks(); renderStats();
    toast(`Added “Ch ${n}: ${name}” to your tasks`);
    if (A) gsap.fromTo(btn, { scale: 0.85 }, { scale: 1, duration: 0.6, ease: "elastic.out(1,0.4)" });
    return;
  }
  const pr = state.syl[k] || {};
  pr[btn.dataset.act] = !pr[btn.dataset.act];
  if (btn.dataset.act === "v" && pr.v) pr.r = true; // revised implies read
  state.syl[k] = pr;
  save();
  $(".toggle.read", li).classList.toggle("on", !!pr.r);
  $(".toggle.rev", li).classList.toggle("on", !!pr.v);
  li.classList.toggle("revised", !!pr.v);
  if (A) gsap.fromTo(btn, { scale: 0.85 }, { scale: 1, duration: 0.6, ease: "elastic.out(1,0.4)" });
  updateSubjectProgress(sylSubject);
  const p = bookProgress(sylSubject);
  if (pr[btn.dataset.act]) {
    if (p.read === p.total && btn.dataset.act === "r") { toast(`Whole ${SUBJECT_INFO[sylSubject].name} book read! 🎉`); confetti(...centerOf(li), 140); }
    else confetti(...centerOf(btn), 24);
  }
});

// =====================================================================
//  Focus timer
// =====================================================================
const C = 2 * Math.PI * 96;
const timerCard = $("#timerCard");
let mode = "focus", remaining = state.settings.focus * 60, running = false, endAt = 0, tickId = null;
const total = () => state.settings[mode] * 60;
const fmt = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
function drawTimer() {
  $("#timeText").textContent = fmt(remaining);
  $("#ringFg").style.strokeDashoffset = C * (1 - remaining / total());
  $("#timeLabel").textContent = running
    ? (mode === "focus" ? `Focusing on ${subj($("#focusSubject").value).name}` : "Break — stretch, drink water")
    : remaining === total() ? (mode === "focus" ? "Ready to focus" : "Ready for a break") : "Paused";
  document.title = running ? `${fmt(remaining)} · ${mode === "focus" ? "Focus" : "Break"} — Study with Ahmad` : "Study with Ahmad — Study Planner";
  const done = todaysSessions().length;
  $("#sessionDots").innerHTML = Array.from({ length: 4 }, (_, i) => `<i class="${i < done % 4 || (done && done % 4 === 0) ? "on" : ""}"></i>`).join("");
}
function movePill(container, pillEl, active) {
  pillEl.style.width = active.offsetWidth + "px";
  pillEl.style.transform = `translateX(${active.offsetLeft - 5}px)`;
  pillEl.style.left = "5px";
}
function setMode(m) {
  mode = m;
  stopTimer();
  remaining = total();
  timerCard.classList.remove("mode-focus", "mode-short", "mode-long");
  timerCard.classList.add("mode-" + m);
  $$("#modeTabs button").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
  movePill($("#modeTabs"), $("#modePill"), $(`#modeTabs button[data-mode="${m}"]`));
  if (A) gsap.fromTo("#timeText", { yPercent: 40, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.7, ease: "expo.out" });
  drawTimer();
}
function startTimer() {
  running = true;
  endAt = Date.now() + remaining * 1000;
  timerCard.classList.add("running");
  tickId = setInterval(tick, 250);
  drawTimer();
}
function stopTimer() {
  running = false;
  clearInterval(tickId);
  timerCard.classList.remove("running");
}
function tick() {
  const r = Math.max(0, Math.round((endAt - Date.now()) / 1000));
  if (r !== remaining) { remaining = r; drawTimer(); }
  if (r === 0) finish();
}
function finish() {
  stopTimer();
  chime();
  if (mode === "focus") {
    state.sessions.push({ date: dayKey(), min: state.settings.focus, subject: $("#focusSubject").value, at: new Date().toTimeString().slice(0, 5) });
    save();
    renderSessionLog(true); renderStats(); renderProgress();
    toast(`Session done — ${state.settings.focus} min of ${subj($("#focusSubject").value).name}. Take a break!`);
    confetti(...centerOf($("#playBtn")), 110);
    setMode(todaysSessions().length % 4 === 0 ? "long" : "short");
  } else {
    toast("Break over — ready for the next session?");
    setMode("focus");
  }
}
$("#playBtn").onclick = () => (running ? (stopTimer(), drawTimer()) : startTimer());
$("#resetBtn").onclick = () => { stopTimer(); remaining = total(); drawTimer(); };
$("#skipBtn").onclick = () => { if (mode === "focus") setMode("short"); else setMode("focus"); };
$("#modeTabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-mode]"); if (b && b.dataset.mode !== mode) setMode(b.dataset.mode); });
[["durFocus", "focus"], ["durShort", "short"], ["durLong", "long"]].forEach(([id, k]) => {
  const el = $("#" + id);
  el.value = state.settings[k];
  el.addEventListener("change", () => {
    state.settings[k] = Math.min(120, Math.max(1, +el.value || 1));
    el.value = state.settings[k];
    save();
    if (mode === k && !running) { remaining = total(); drawTimer(); }
  });
});
$("#focusSubject").addEventListener("change", drawTimer);
function renderSessionLog(animate) {
  const list = todaysSessions();
  $("#sessionCount").textContent = `${list.length} session${list.length === 1 ? "" : "s"} · ${list.reduce((s, x) => s + x.min, 0)} min`;
  $("#sessionLog").innerHTML = list.length
    ? list.slice().reverse().map((s) => { const sb = subj(s.subject); return `<li><span class="dot" style="background:${sb.color}"></span>${esc(sb.name)}<span class="muted small">${s.at || ""}</span><b>${s.min} min</b></li>`; }).join("")
    : '<li class="empty">No sessions yet today — press play to start one.</li>';
  if (animate && A && list.length) gsap.from("#sessionLog li:first-child", { x: -30, opacity: 0, duration: 0.8, ease: "expo.out" });
}

// =====================================================================
//  Tasks
// =====================================================================
let taskFilter = "all";
function dueLabel(t) {
  if (!t.due) return "";
  const today = dayKey(), tmr = dayKey(addDays(new Date(), 1));
  if (!t.done && t.due < today) return '<span class="tag overdue">Overdue</span>';
  if (t.due === today) return '<span class="tag">Today</span>';
  if (t.due === tmr) return '<span class="tag">Tomorrow</span>';
  return `<span class="tag">${new Date(t.due + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>`;
}
function taskHTML(t) {
  const s = subj(t.subject);
  return `<li class="task ${t.done ? "done" : ""}" data-id="${t.id}" style="--c:${s.color}">
    <button class="check" aria-label="Mark done"><svg><use href="#i-check"/></svg></button>
    <div class="task-body">
      <span class="task-text">${esc(t.text)}</span>
      <div class="task-meta"><span class="tag"><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</span>${dueLabel(t)}<span class="tag"><i class="prio p${t.priority}"></i>${["Low", "Medium", "High"][t.priority]}</span></div>
    </div>
    <button class="icon-btn del" aria-label="Delete task"><svg><use href="#i-trash"/></svg></button>
  </li>`;
}
function visibleTasks() {
  const today = dayKey();
  return state.tasks
    .filter((t) => taskFilter === "all" || (taskFilter === "today" && t.due === today) || (taskFilter === "open" && !t.done) || (taskFilter === "done" && t.done))
    .sort((a, b) => a.done - b.done || (a.due || "9999").localeCompare(b.due || "9999") || b.priority - a.priority);
}
function renderTasks(animate) {
  const list = visibleTasks();
  $("#taskList").innerHTML = list.length ? list.map(taskHTML).join("") : '<li class="list-empty">Nothing here yet — add a task above, or press “Plan” on a chapter.</li>';
  if (animate && A) gsap.fromTo("#taskList > li", { y: 20, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.04, duration: 0.6, ease: "expo.out" });
  const done = state.tasks.filter((t) => t.done).length, all = state.tasks.length;
  $("#tpFill").style.transform = `scaleX(${all ? done / all : 0})`;
  $("#tpText").textContent = `${done} of ${all} tasks done`;
  refreshTriggers();
}
$("#taskForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const t = { id: uid(), text: $("#taskText").value.trim(), subject: $("#taskSubject").value, due: $("#taskDue").value, priority: +$("#taskPriority").value, done: false };
  if (!t.text) return;
  state.tasks.push(t);
  save();
  $("#taskText").value = "";
  if (taskFilter === "done") setFilter("all");
  renderTasks();
  const li = $(`.task[data-id="${t.id}"]`);
  if (li && A) gsap.fromTo(li, { x: -60, opacity: 0, scale: 0.95 }, { x: 0, opacity: 1, scale: 1, duration: 0.9, ease: "expo.out" });
  toast("Task added");
});
$("#taskList").addEventListener("click", (e) => {
  const li = e.target.closest(".task");
  if (!li) return;
  const t = state.tasks.find((x) => x.id === li.dataset.id);
  if (e.target.closest(".check")) {
    t.done = !t.done;
    t.doneAt = t.done ? dayKey() : null;
    save();
    li.classList.toggle("done", t.done);
    if (t.done) {
      confetti(...centerOf($(".check", li)), 30);
      const dueToday = state.tasks.filter((x) => x.due === dayKey());
      if (dueToday.length && dueToday.every((x) => x.done)) { toast("Everything due today is done! 🎉"); confetti(innerWidth / 2, innerHeight / 3, 160); }
    }
    renderStats();
    setTimeout(() => renderTasks(), A ? 700 : 0);
  }
  if (e.target.closest(".del")) {
    state.tasks = state.tasks.filter((x) => x.id !== t.id);
    save();
    const after = () => { renderTasks(); renderStats(); };
    if (A) gsap.timeline({ onComplete: after }).to(li, { x: 80, opacity: 0, duration: 0.35, ease: "power2.in" }).to(li, { height: 0, paddingTop: 0, paddingBottom: 0, marginTop: -10, duration: 0.3, ease: "power2.inOut" });
    else after();
  }
});
function setFilter(f) {
  taskFilter = f;
  $$("#taskFilters button").forEach((b) => b.classList.toggle("active", b.dataset.filter === f));
}
$("#taskFilters").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { setFilter(b.dataset.filter); renderTasks(true); } });

// =====================================================================
//  Timetable
// =====================================================================
let ttDay = jsDayToIdx(new Date().getDay());
function renderDayTabs() {
  const today = jsDayToIdx(new Date().getDay());
  const tabs = $("#dayTabs");
  $$("button", tabs).forEach((b) => b.remove());
  tabs.insertAdjacentHTML("beforeend", DAYS.map((d, i) => `<button data-day="${i}" class="${i === ttDay ? "active" : ""} ${i === today ? "today" : ""}">${d}</button>`).join(""));
  requestAnimationFrame(() => movePill(tabs, $("#dayPill"), $(`#dayTabs button[data-day="${ttDay}"]`)));
  $("#blockDay").innerHTML = DAYS.map((d, i) => `<option value="${i}" ${i === ttDay ? "selected" : ""}>${d}</option>`).join("");
}
function renderBlocks(animate) {
  const now = new Date(), isToday = ttDay === jsDayToIdx(now.getDay()), hm = now.toTimeString().slice(0, 5);
  const list = state.blocks.filter((b) => b.day === ttDay).sort((a, b) => a.start.localeCompare(b.start));
  $("#blocks").innerHTML = list.length ? list.map((b) => {
    const s = subj(b.subject), live = isToday && b.start <= hm && hm < b.end;
    return `<li class="block ${live ? "now" : ""}" data-id="${b.id}" style="--c:${s.color}">
      <div class="block-time">${b.start}<small>to ${b.end}</small></div>
      <div><h4>${esc(b.title)}<span class="live">Now</span></h4><p>${esc(s.name)}</p></div>
      <button class="icon-btn del" aria-label="Delete block"><svg><use href="#i-trash"/></svg></button>
    </li>`;
  }).join("") : `<li class="list-empty">Nothing planned for ${DAYS[ttDay]} — add a block on the right.</li>`;
  if (animate && A) gsap.fromTo("#blocks > li", { y: 30, opacity: 0, rotate: 1 }, { y: 0, opacity: 1, rotate: 0, stagger: 0.06, duration: 0.8, ease: "expo.out" });
  refreshTriggers();
}
$("#dayTabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-day]");
  if (!b) return;
  ttDay = +b.dataset.day;
  $$("#dayTabs button").forEach((x) => x.classList.toggle("active", x === b));
  movePill($("#dayTabs"), $("#dayPill"), b);
  $("#blockDay").value = ttDay;
  renderBlocks(true);
});
$("#blockForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const b = { id: uid(), title: $("#blockTitle").value.trim(), subject: $("#blockSubject").value, day: +$("#blockDay").value, start: $("#blockStart").value, end: $("#blockEnd").value };
  if (b.end <= b.start) return toast("The end time must be after the start time");
  state.blocks.push(b);
  save();
  $("#blockTitle").value = "";
  if (b.day !== ttDay) { ttDay = b.day; renderDayTabs(); }
  renderBlocks();
  const li = $(`.block[data-id="${b.id}"]`);
  if (li && A) gsap.fromTo(li, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.8, ease: "elastic.out(1,0.6)" });
  toast(`Added to ${DAYS[b.day]}`);
});
$("#blocks").addEventListener("click", (e) => {
  const del = e.target.closest(".del");
  if (!del) return;
  const li = del.closest(".block");
  state.blocks = state.blocks.filter((b) => b.id !== li.dataset.id);
  save();
  if (A) gsap.to(li, { x: 80, opacity: 0, duration: 0.4, ease: "power2.in", onComplete: () => renderBlocks() });
  else renderBlocks();
});

// =====================================================================
//  Exams
// =====================================================================
function renderExams(animate) {
  const list = state.exams.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  $("#examGrid").innerHTML = list.length ? list.map((x) => {
    const s = subj(x.subject), d = new Date(x.date);
    return `<article class="exam" data-id="${x.id}" style="--c:${s.color}">
      <button class="icon-btn del" aria-label="Delete exam"><svg><use href="#i-trash"/></svg></button>
      <span class="tag"><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</span>
      <h4>${esc(x.title)}</h4>
      <p class="when">${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" })} · ${d.toTimeString().slice(0, 5)}</p>
      <div class="countdown">${["Days", "Hours", "Mins", "Secs"].map((u) => `<div><b data-u="${u}"><span>0</span></b><small>${u}</small></div>`).join("")}</div>
    </article>`;
  }).join("") : '<div class="list-empty exam-empty">No exams yet — add your date sheet above.</div>';
  tickExams(true);
  if (animate && A) gsap.fromTo("#examGrid .exam", { y: 50, opacity: 0, rotate: -2 }, { y: 0, opacity: 1, rotate: 0, stagger: 0.08, duration: 1, ease: "expo.out" });
  refreshTriggers();
}
function tickExams(first) {
  $$("#examGrid .exam").forEach((card) => {
    const x = state.exams.find((e) => e.id === card.dataset.id);
    if (!x) return;
    let diff = Math.max(0, new Date(x.date) - Date.now());
    card.classList.toggle("past", diff === 0);
    const vals = { Days: Math.floor(diff / 864e5), Hours: Math.floor(diff / 36e5) % 24, Mins: Math.floor(diff / 6e4) % 60, Secs: Math.floor(diff / 1e3) % 60 };
    Object.entries(vals).forEach(([u, v]) => {
      const b = $(`b[data-u="${u}"]`, card), span = $("span", b), txt = u === "Days" ? String(v) : pad(v);
      if (span.textContent === txt) return;
      span.textContent = txt;
      if (!first && A) gsap.fromTo(span, { yPercent: -100 }, { yPercent: 0, duration: 0.45, ease: "expo.out" });
    });
  });
}
setInterval(() => tickExams(false), 1000);
$("#examForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const x = { id: uid(), title: $("#examTitle").value.trim(), subject: $("#examSubject").value, date: new Date($("#examDate").value).toISOString() };
  state.exams.push(x);
  save();
  $("#examTitle").value = "";
  renderExams();
  const card = $(`.exam[data-id="${x.id}"]`);
  if (card && A) gsap.fromTo(card, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.9, ease: "elastic.out(1,0.6)" });
  renderStats();
  toast("Exam added — you've got this");
});
$("#examGrid").addEventListener("click", (e) => {
  const del = e.target.closest(".del");
  if (!del) return;
  const card = del.closest(".exam");
  state.exams = state.exams.filter((x) => x.id !== card.dataset.id);
  save();
  const after = () => { renderExams(); renderStats(); };
  if (A) gsap.to(card, { scale: 0.85, opacity: 0, duration: 0.35, ease: "power2.in", onComplete: after });
  else after();
});

// =====================================================================
//  Flashcards
// =====================================================================
let deck = "all", queue = [], qi2 = 0;
const flash = $("#flashcard");
function deckCards() {
  const cls = state.profile?.cls;
  return state.cards.filter((c) => (!c.cls || c.cls === cls) && (deck === "all" || c.subject === deck));
}
function renderDecks() {
  const cls = state.profile?.cls;
  const ids = [...new Set(state.cards.filter((c) => !c.cls || c.cls === cls).map((c) => c.subject))];
  if (deck !== "all" && !ids.includes(deck)) deck = "all";
  $("#deckTabs").innerHTML = [`<button data-deck="all" class="${deck === "all" ? "active" : ""}">All decks</button>`]
    .concat(ids.map((id) => `<button data-deck="${id}" class="${deck === id ? "active" : ""}">${esc(subj(id).name)}</button>`)).join("");
  const n = deckCards().length, known = deckCards().filter((c) => c.known).length;
  $("#deckInfo").textContent = `${n} card${n === 1 ? "" : "s"} in this deck · ${known} marked as known`;
}
function buildQueue() {
  const cards = deckCards();
  queue = [...cards.filter((c) => !c.known), ...cards.filter((c) => c.known)].map((c) => c.id);
  qi2 = 0;
}
function showCard(dir = 0) {
  const c = state.cards.find((x) => x.id === queue[qi2]);
  const fill = () => {
    flash.classList.remove("flipped");
    if (!c) {
      $("#fcFront").textContent = "No cards in this deck yet — add one on the right.";
      $("#fcBack").textContent = "";
      $("#fcTagFront").textContent = $("#fcTagBack").textContent = "Empty deck";
      $("#fcCount").textContent = "0 / 0";
      return;
    }
    const s = subj(c.subject);
    $("#fcFront").textContent = c.front;
    $("#fcBack").textContent = c.back;
    $("#fcTagFront").textContent = $("#fcTagBack").textContent = s.name + (c.known ? " · known ✓" : "");
    $("#fcCount").textContent = `${qi2 + 1} / ${queue.length}`;
  };
  if (!dir || !A) return fill();
  gsap.timeline()
    .to(flash, { x: -dir * 120, rotate: -dir * 6, opacity: 0, duration: 0.25, ease: "power2.in", onComplete: fill })
    .fromTo(flash, { x: dir * 120, rotate: dir * 6, opacity: 0 }, { x: 0, rotate: 0, opacity: 1, duration: 0.6, ease: "expo.out" });
}
function step(d) { if (!queue.length) return; qi2 = (qi2 + d + queue.length) % queue.length; showCard(d || 1); }
flash.addEventListener("click", () => queue.length && flash.classList.toggle("flipped"));
flash.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); flash.click(); } });
$("#fcNext").onclick = () => step(1);
$("#fcPrev").onclick = () => step(-1);
$("#fcGot").onclick = () => {
  const c = state.cards.find((x) => x.id === queue[qi2]);
  if (!c) return;
  c.known = true; save(); renderDecks();
  confetti(...centerOf($("#fcGot")), 26);
  step(1);
};
$("#fcAgain").onclick = () => {
  const c = state.cards.find((x) => x.id === queue[qi2]);
  if (!c) return;
  c.known = false; save();
  queue.push(queue.splice(qi2, 1)[0]); // send to the back of the queue
  if (qi2 >= queue.length) qi2 = 0;
  renderDecks(); showCard(1);
};
$("#deckTabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-deck]");
  if (!b) return;
  deck = b.dataset.deck; renderDecks(); buildQueue(); showCard(1);
});
$("#cardForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const c = { id: uid(), subject: $("#cardSubject").value, front: $("#cardFront").value.trim(), back: $("#cardBack").value.trim(), cls: state.profile?.cls };
  state.cards.push(c); save();
  $("#cardFront").value = $("#cardBack").value = "";
  deck = c.subject; renderDecks(); buildQueue();
  qi2 = queue.indexOf(c.id); showCard(1);
  toast("Flashcard added");
});
function renderCards() { renderDecks(); buildQueue(); showCard(); }

// =====================================================================
//  Progress
// =====================================================================
function minutesOn(key) { return state.sessions.filter((s) => s.date === key).reduce((a, s) => a + s.min, 0); }
function renderProgress(animate) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const mins = days.map((d) => minutesOn(dayKey(d)));
  const max = Math.max(60, ...mins);
  $("#barChart").innerHTML = days.map((d, i) => `
    <div class="bar ${i === 6 ? "today" : ""}">
      <div class="bar-col" style="height:${(mins[i] / max) * 100}%"><span>${mins[i] ? mins[i] + "m" : ""}</span></div>
      <small>${i === 6 ? "Today" : DAYS[jsDayToIdx(d.getDay())]}</small>
    </div>`).join("");
  const week = new Set(days.map(dayKey));
  const weekS = state.sessions.filter((s) => week.has(s.date));
  $("#totHours").textContent = (weekS.reduce((a, s) => a + s.min, 0) / 60).toFixed(1);
  $("#totSessions").textContent = weekS.length;
  const bySubj = {};
  weekS.forEach((s) => (bySubj[s.subject] = (bySubj[s.subject] || 0) + s.min));
  const top = Object.entries(bySubj).sort((a, b) => b[1] - a[1]);
  const topMax = top.length ? top[0][1] : 1;
  $("#subjectBars").innerHTML = top.length ? top.map(([id, m]) => {
    const s = subj(id);
    return `<li><div class="sb-top"><span>${esc(s.name)}</span><b>${m} min</b></div><div class="sb-track"><i data-w="${m / topMax}" style="--c:${s.color};transform:scaleX(${m / topMax})"></i></div></li>`;
  }).join("") : '<li class="muted">Finish a focus session to see your subjects here.</li>';
  // heatmap: 15 full weeks, Monday-first columns, ending this week
  const start = addDays(today, -jsDayToIdx(today.getDay()) - 14 * 7);
  const cells = [];
  for (let i = 0; i < 15 * 7; i++) {
    const d = addDays(start, i), k = dayKey(d), m = minutesOn(k), future = d > today;
    const lvl = m === 0 ? 0 : m <= 30 ? 1 : m <= 60 ? 2 : m <= 120 ? 3 : 4;
    cells.push(`<i class="l${lvl} ${k === dayKey() ? "today" : ""}" ${future ? 'style="opacity:.25"' : ""} title="${d.toDateString()} · ${m} min"></i>`);
  }
  $("#heatmap").innerHTML = cells.join("");
  if (animate && A) animateCharts();
}
function animateCharts() {
  gsap.fromTo("#barChart .bar-col", { scaleY: 0 }, { scaleY: 1, stagger: 0.06, duration: 1.1, ease: "expo.out" });
  gsap.fromTo("#subjectBars i", { scaleX: 0 }, { scaleX: (i, el) => +el.dataset.w || 0, stagger: 0.08, duration: 1.2, ease: "expo.out" });
  gsap.fromTo("#heatmap i", { scale: 0 }, { scale: 1, stagger: { each: 0.004, from: "start" }, duration: 0.5, ease: "back.out(2)" });
}
function renderExtras() {
  $("#subjectList").innerHTML = state.extras.length
    ? state.extras.map((x) => `<li data-id="${x.id}"><span class="dot" style="background:${x.color}"></span>${esc(x.name)}<button class="icon-btn del" aria-label="Remove subject"><svg><use href="#i-trash"/></svg></button></li>`).join("")
    : '<li class="muted" style="background:none">Add tuition tests, extra courses, entry-test prep…</li>';
}
$("#subjectForm").addEventListener("submit", (e) => {
  e.preventDefault();
  state.extras.push({ id: "x" + uid(), name: $("#subjectName").value.trim(), color: $("#subjectColor").value });
  save();
  $("#subjectName").value = "";
  renderExtras(); renderSelects();
  if (A) gsap.from("#subjectList li:last-child", { x: -30, opacity: 0, duration: 0.7, ease: "expo.out" });
  toast("Subject added to every menu");
});
$("#subjectList").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-id]");
  if (!li || !e.target.closest(".del")) return;
  state.extras = state.extras.filter((x) => x.id !== li.dataset.id);
  save(); renderExtras(); renderSelects();
});

// =====================================================================
//  Everything together
// =====================================================================
function renderSelects() {
  ["focusSubject", "taskSubject", "blockSubject", "examSubject", "cardSubject"].forEach((id) => {
    const el = $("#" + id), cur = el.value;
    el.innerHTML = subjOptions(cur);
  });
}
function renderAll(animate) {
  renderHeader();
  renderStats(animate);
  if (!state.profile) return;
  renderSelects();
  renderSyllabus(animate);
  renderSessionLog();
  drawTimer();
  renderTasks(animate);
  renderDayTabs();
  renderBlocks(animate);
  renderExams(animate);
  renderCards();
  renderProgress(animate);
  renderExtras();
  refreshTriggers();
}

// Footer actions
$("#sampleBtn").onclick = () => {
  if (!state.profile) return openSetup();
  const core = groupOf().subjects;
  for (let i = 1; i <= 40; i++) {
    if (Math.random() < 0.3) continue;
    const n = 1 + Math.floor(Math.random() * 4);
    for (let j = 0; j < n; j++) state.sessions.push({ date: dayKey(addDays(new Date(), -i)), min: 25, subject: core[Math.floor(Math.random() * core.length)], at: `${16 + j}:00`, sample: true });
  }
  save(); renderAll(); if (A) animateCharts();
  toast("Sample study history added — charts are filled in");
};
$("#clearBtn").onclick = async () => {
  if (!confirm(token ? "Delete all your Study with Ahmad data, in this browser AND in your cloud account? This can't be undone." : "Delete all your Study with Ahmad data in this browser? This can't be undone.")) return;
  state = defaults();
  saveLocal();
  if (token) { clearTimeout(syncTimer); try { await api("/api/state", { method: "PUT", body: JSON.stringify({ data: state }) }); } catch (e) {} }
  location.reload();
};

// Theme toggle — the new theme grows out of the button as a circle
function isDark() { return root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; }
$("#themeBtn").onclick = () => {
  const next = isDark() ? "light" : "dark";
  const apply = () => { root.dataset.theme = next; try { localStorage.setItem("studynest-theme", next); } catch (e) {} };
  if (!A || !document.startViewTransition) return apply();
  const [x, y] = centerOf($("#themeBtn"));
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.startViewTransition(apply).ready.then(() => {
    root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 750, easing: "cubic-bezier(.16,1,.3,1)", pseudoElement: "::view-transition-new(root)" });
  });
};

// Navigation
const header = $("#header"), nav = $("#nav");
$("#menuBtn").onclick = () => nav.classList.toggle("open");
function scrollToEl(el) {
  if (lenis) lenis.scrollTo(el, { duration: 1.4, offset: -10 });
  else if (el === 0) scrollTo({ top: 0, behavior: "smooth" });
  else el.scrollIntoView({ behavior: "smooth" });
}
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  e.preventDefault();
  nav.classList.remove("open");
  const href = a.getAttribute("href");
  if (href === "#top") scrollToEl(0); else if ($(href)) scrollToEl($(href));
});
let lastY = 0;
function onScroll(y) {
  header.classList.toggle("scrolled", y > 10);
  header.classList.toggle("hidden", y > lastY && y > 500 && !nav.classList.contains("open"));
  lastY = y;
}
if (lenis) lenis.on("scroll", ({ scroll }) => onScroll(scroll));
else addEventListener("scroll", () => onScroll(scrollY), { passive: true });
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (auth.classList.contains("open")) closeAuth(); else closeSetup();
});
addEventListener("resize", () => {
  movePill($("#modeTabs"), $("#modePill"), $("#modeTabs button.active"));
  const d = $("#dayTabs button.active");
  if (d) movePill($("#dayTabs"), $("#dayPill"), d);
});

// Ticker + footer word
const tickerItems = ["Read one chapter a day", "Revise within 24 hours", "25 minutes of focus beats 2 hours of distraction", "Past papers are your best friend", "Sleep is part of studying", "Ask your teacher — every doubt counts"];
$("#ticker").innerHTML = tickerItems.concat(tickerItems).map((t) => `<span>${t}</span>`).join("");
const giant = $("#footerGiant");
giant.innerHTML = [...giant.textContent].map((c) => `<span class="ch">${c}</span>`).join("");

// =====================================================================
//  Start
// =====================================================================
$("#greeting").innerHTML = greetingText();
const heroWords = splitWords($("#greeting"));
// Flip words (Aceternity-style): the last word of the greeting keeps changing
$("#greeting").insertAdjacentHTML("beforeend", '<span class="flip-line"><span class="flip-wrap"><span id="flipWord">studying.</span></span></span>');
const FLIP = ["studying.", "revising.", "practising.", "acing exams.", "learning."];
let flipI = 0;
setInterval(() => {
  const el = $("#flipWord"), next = FLIP[++flipI % FLIP.length];
  if (!A) { el.textContent = next; return; }
  gsap.timeline()
    .to(el, { yPercent: -110, filter: "blur(6px)", opacity: 0, duration: 0.45, ease: "power3.in" })
    .add(() => { el.textContent = next; })
    .fromTo(el, { yPercent: 110, filter: "blur(6px)", opacity: 0 }, { yPercent: 0, filter: "blur(0px)", opacity: 1, duration: 0.8, ease: "expo.out" });
}, 2800);

// Meteors for the exams section
$("#meteors").innerHTML = Array.from({ length: 16 }, () =>
  `<span class="meteor" style="left:${Math.round(Math.random() * 110)}%;animation-duration:${(3 + Math.random() * 6).toFixed(1)}s;animation-delay:${(Math.random() * 6).toFixed(1)}s"></span>`).join("");

// Card spotlight + hero spotlight follow the mouse (cheap CSS variables, no library needed)
const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
const GLOW = ".panel, .stat-card, .task, .chapter, .block, .syl-tab, .timer-card, .exam";
if (fine) {
  document.addEventListener("pointermove", (e) => {
    const card = e.target.closest(GLOW);
    if (card) {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", e.clientX - r.left + "px");
      card.style.setProperty("--my", e.clientY - r.top + "px");
    }
  }, { passive: true });
  $("#hero").addEventListener("pointermove", (e) => {
    const r = $("#hero").getBoundingClientRect();
    $("#spotlight").style.setProperty("--sx", e.clientX - r.left + "px");
    $("#spotlight").style.setProperty("--sy", e.clientY - r.top + "px");
  }, { passive: true });
}

// Floating dock appears once you scroll past the dashboard
const dock = $("#dock");
if (!A) addEventListener("scroll", () => dock.classList.toggle("show", scrollY > innerHeight * 0.6), { passive: true });

// Scramble text (Skiper-style): letters shuffle, then settle left to right
function scramble(el) {
  const final = el.textContent, chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&";
  let frame = 0;
  const total = 22;
  const id = setInterval(() => {
    frame++;
    el.textContent = [...final].map((c, i) => (c === " " || i < (frame / total) * final.length ? c : chars[Math.floor(Math.random() * chars.length)])).join("");
    if (frame >= total) { clearInterval(id); el.textContent = final; }
  }, 35);
}
rotateQuote();
setInterval(rotateQuote, 8000);
setMode("focus");
renderAll(false);
setSync("idle");

// Signed in on this device? Load the latest planner from the database.
if (token) {
  pulling = true;
  setSync("saving", "Loading your planner…");
  pullState()
    .then(() => { renderAll(true); })
    .catch(() => setSync("error"))
    .finally(() => {
      pulling = false;
      if (!state.profile) openSetup();
      else if (setup.classList.contains("open")) closeSetup();
    });
}

if (!A) {
  openStart();
} else {
  // Intro: book pages flip, name rises, curtain lifts, dashboard builds in
  if (lenis) lenis.stop();
  const bar = { v: 0 };
  gsap.timeline({ defaults: { ease: "expo.out" } })
    .from(".loader-mark", { scale: 0, rotate: -140, duration: 1.1, ease: "back.out(1.8)" })
    .from(".loader-mark .lm-star", { scale: 0, rotate: 180, transformOrigin: "50% 50%", duration: 0.8, ease: "back.out(3)" }, 0.5)
    .from(".loader-logo > *", { yPercent: 120, opacity: 0, stagger: 0.1, duration: 1 }, 0.2)
    .to(bar, { v: 1, duration: 1.3, ease: "power2.inOut", onUpdate: () => ($("#loaderBar").style.transform = `scaleX(${bar.v})`) }, 0.1)
    .to(".loader-logo > *, .loader-mark, .loader-bar", { yPercent: -120, opacity: 0, stagger: 0.05, duration: 0.6, ease: "power3.in" })
    .fromTo("#loader", { clipPath: "circle(150% at 50% 50%)" }, { clipPath: "circle(0% at 50% 50%)", duration: 1.1, ease: "expo.inOut" }, "-=0.2")
    .set("#loader", { display: "none" })
    .from(".header-inner > *, .nav a", { y: -30, opacity: 0, stagger: 0.04, duration: 0.9 }, "-=0.6")
    .from(".blob", { scale: 0, duration: 2.2, stagger: 0.15 }, "<")
    .from("#appFlag, #todayChip", { y: 20, opacity: 0, stagger: 0.08, duration: 0.8 }, "<0.1")
    .from(heroWords, { yPercent: 120, rotate: 5, stagger: 0.06, duration: 1.2 }, "<0.1")
    .from("#flipWord", { yPercent: 120, duration: 1.2 }, "<0.25")
    .from(".dot-grid, .spotlight", { opacity: 0, duration: 1.5 }, "<")
    .from("#quote, .hero-cta > *", { y: 30, opacity: 0, stagger: 0.1, duration: 1 }, "<0.3")
    .from(".stat-card", { y: 60, opacity: 0, rotate: (i) => (i % 2 ? 4 : -4), stagger: 0.1, duration: 1.2, onStart: () => renderStats(true) }, "<0.1")
    .from(".ticker", { yPercent: 100, opacity: 0, duration: 1 }, "<0.3")
    .add(() => { if (lenis) lenis.start(); openStart(); });

  // Floating blobs drift forever
  $$(".blob").forEach((b, i) => gsap.to(b, { x: i % 2 ? 60 : -60, y: i ? 40 : -40, duration: 7 + i * 2, repeat: -1, yoyo: true, ease: "sine.inOut" }));

  gsap.to("#progress", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });
  gsap.to(".hero-inner", { y: -80, opacity: 0.2, ease: "none", scrollTrigger: { trigger: ".hero", start: "30% top", end: "bottom top", scrub: true } });

  // Section headings rise word by word; blocks fade up
  $$(".split").forEach((h) => {
    const words = splitWords(h);
    gsap.from(words, { yPercent: 120, rotate: 4, stagger: 0.05, duration: 1.1, ease: "expo.out", scrollTrigger: { trigger: h, start: "top 88%" } });
  });
  $$("main .kicker").forEach((k) => gsap.from(k, { x: -30, opacity: 0, duration: 0.9, ease: "expo.out", scrollTrigger: { trigger: k, start: "top 90%", onEnter: () => scramble(k) } }));
  $$(".reveal").forEach((el) => gsap.from(el, { y: 50, opacity: 0, duration: 1.1, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 90%" } }));

  // Lists and charts animate when you reach them
  ScrollTrigger.create({ trigger: "#chapters", start: "top 85%", once: true, onEnter: () => gsap.fromTo("#chapters .chapter", { x: -40, opacity: 0 }, { x: 0, opacity: 1, stagger: 0.04, duration: 0.8, ease: "expo.out" }) });
  ScrollTrigger.create({ trigger: "#syllabus", start: "top 70%", once: true, onEnter: renderOverall });
  ScrollTrigger.create({ trigger: "#taskList", start: "top 85%", once: true, onEnter: () => gsap.fromTo("#taskList > li", { y: 30, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.05, duration: 0.8, ease: "expo.out" }) });
  ScrollTrigger.create({ trigger: "#blocks", start: "top 85%", once: true, onEnter: () => gsap.fromTo("#blocks > li", { y: 30, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.06, duration: 0.8, ease: "expo.out" }) });
  ScrollTrigger.create({ trigger: "#examGrid", start: "top 85%", once: true, onEnter: () => gsap.fromTo("#examGrid .exam", { y: 60, opacity: 0, rotate: -3 }, { y: 0, opacity: 1, rotate: 0, stagger: 0.1, duration: 1, ease: "expo.out" }) });
  ScrollTrigger.create({ trigger: "#barChart", start: "top 85%", once: true, onEnter: animateCharts });
  gsap.from("#flashcard", { rotateY: -40, rotateX: 10, duration: 1.4, ease: "expo.out", scrollTrigger: { trigger: "#flashcard", start: "top 85%" } });
  gsap.from(".ring-wrap", { scale: 0.6, rotate: -90, opacity: 0, duration: 1.4, ease: "expo.out", scrollTrigger: { trigger: ".ring-wrap", start: "top 85%" } });
  gsap.from(".footer-giant .ch", { yPercent: 110, stagger: 0.05, duration: 1.3, ease: "expo.out", scrollTrigger: { trigger: giant, start: "top 98%" } });

  // Highlight the nav link for the section on screen
  $$("main section[id]").forEach((sec) => {
    const links = $$(`.nav a[href="#${sec.id}"], .dock a[href="#${sec.id}"]`);
    if (links.length) ScrollTrigger.create({ trigger: sec, start: "top 50%", end: "bottom 50%", onToggle: (s) => links.forEach((l) => l.classList.toggle("active", s.isActive)) });
  });
  ScrollTrigger.create({ trigger: "#syllabus", start: "top 85%", end: "max", onToggle: (s) => dock.classList.toggle("show", s.isActive) });

  // Ticker speeds up with scroll velocity and follows scroll direction
  const tickerTrack = $("#ticker");
  tickerTrack.style.animation = "none";
  const tickerTween = gsap.to(tickerTrack, { xPercent: -50, duration: 45, ease: "none", repeat: -1 });
  tickerTween.totalTime(tickerTween.duration() * 100);
  ScrollTrigger.create({
    start: 0, end: "max",
    onUpdate: (s) => {
      gsap.to(tickerTween, { timeScale: s.direction * Math.min(1 + Math.abs(s.getVelocity()) / 200, 7), duration: 0.2, overwrite: true });
      gsap.to(tickerTween, { timeScale: s.direction, duration: 1.2, delay: 0.25 });
    },
  });

  // Meteors fade in, lamp glow breathes in the exams section
  gsap.from(".lamp", { scaleX: 0.3, opacity: 0, duration: 1.8, ease: "expo.out", scrollTrigger: { trigger: "#exams", start: "top 70%" } });
  gsap.to(".lamp", { opacity: 0.35, duration: 3, repeat: -1, yoyo: true, ease: "sine.inOut" });

  // Magnetic buttons (mouse only)
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
    $$(".magnetic").forEach((m) => {
      m.addEventListener("mousemove", (e) => {
        const r = m.getBoundingClientRect();
        gsap.to(m, { x: (e.clientX - r.left - r.width / 2) * 0.3, y: (e.clientY - r.top - r.height / 2) * 0.4, duration: 0.5, ease: "power3.out" });
      });
      m.addEventListener("mouseleave", () => gsap.to(m, { x: 0, y: 0, duration: 0.9, ease: "elastic.out(1,0.35)" }));
    });

    // 3D tilt (Aceternity 3D card): stat cards, exam cards and the flashcard lean toward the mouse
    let tilted = null;
    document.addEventListener("pointermove", (e) => {
      const el = e.target.closest(".stat-card, .exam, .fc-stage");
      if (tilted && tilted !== el) { gsap.to(tilted, { rotateX: 0, rotateY: 0, y: 0, duration: 0.9, ease: "elastic.out(1,0.5)" }); tilted = null; }
      if (!el) return;
      tilted = el;
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      const k = el.classList.contains("fc-stage") ? 8 : 12;
      gsap.to(el, { rotateY: x * k, rotateX: -y * k, y: -6, duration: 0.5, ease: "power3.out", transformPerspective: 900 });
    }, { passive: true });

    // Floating dock: icons magnify near the mouse, like the macOS dock
    const dockItems = $$("a", dock);
    dock.addEventListener("pointermove", (e) => {
      dockItems.forEach((a) => {
        const r = a.getBoundingClientRect(), d = Math.abs(e.clientX - (r.left + r.width / 2));
        const s = 1 + Math.max(0, 1 - d / 130) * 0.55;
        gsap.to(a, { scale: s, y: -(s - 1) * 22, duration: 0.25, ease: "power2.out" });
      });
    });
    dock.addEventListener("pointerleave", () => gsap.to(dockItems, { scale: 1, y: 0, duration: 0.6, ease: "elastic.out(1,0.5)" }));
  }
  addEventListener("load", () => ScrollTrigger.refresh());
  document.fonts.ready.then(() => { ScrollTrigger.refresh(); movePill($("#modeTabs"), $("#modePill"), $("#modeTabs button.active")); });
}
// Keep the "now" timetable block and greeting fresh
setInterval(() => { if (state.profile) renderBlocks(); }, 60000);

// ---------- Get the app (installable PWA + Android / Windows downloads) ----------
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone || /source=(app|desktop)/.test(location.search);
if (standalone) document.documentElement.classList.add("standalone");
if ("serviceWorker" in navigator && CLOUD) addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));

// Point out the card for the visitor's own device
const ua = navigator.userAgent;
const myOs = /android/i.test(ua) ? "android" : /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) ? "ios" : /windows/i.test(ua) ? "windows" : "";
if (myOs) $(`.app-card[data-os="${myOs}"]`)?.classList.add("mine");

// Browsers that can install the site directly (Chrome, Edge, Samsung Internet) get a one-tap button
let installEvent = null;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvent = e; $("#installBtn").hidden = standalone; });
$("#installBtn").onclick = async () => {
  if (!installEvent) return;
  installEvent.prompt();
  const { outcome } = await installEvent.userChoice;
  if (outcome === "accepted") { $("#installBtn").hidden = true; toast("Study with Ahmad is installing — look for it on your home screen"); }
  installEvent = null;
};
addEventListener("appinstalled", () => { $("#installBtn").hidden = true; });

// If the APK has not been published yet, the Android button installs from the browser instead
if (CLOUD) fetch($("#apkLink").getAttribute("href"), { method: "HEAD" }).then((r) => {
  if (r.ok) return;
  const a = $("#apkLink");
  a.removeAttribute("download");
  a.href = "#get-app";
  a.querySelector("span").textContent = "Install from browser";
  a.onclick = (e) => { e.preventDefault(); if (installEvent) $("#installBtn").click(); else toast("Open this site in Chrome on your phone, tap ⋮ and choose “Install app”"); };
}).catch(() => {});

// ---------- No pinch zoom (Safari ignores user-scalable=no, so block its gestures too) ----------
// Double-tap zoom is already off via `touch-action: manipulation` in study.css.
["gesturestart", "gesturechange"].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
document.addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
