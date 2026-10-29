// =====================================================================
//  Study with Ahmad — study planner for Matric & Intermediate (Punjab Board and Federal Board)
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

// ---------- Urdu interface: navigation, headings and the main buttons ----------
// Applied before the animations split the headings into words; switching language reloads the page.
const LANG = (() => { try { return localStorage.getItem("swa-lang") === "ur" ? "ur" : "en"; } catch (e) { return "en"; } })();
const UR = {
  heads: {
    syllabus: ["01 · نصاب", "آپ کی پی ٹی بی کتابیں، <em>باب بہ باب۔</em>"],
    focus: ["02 · توجہ", "گہری پڑھائی، <em>پچیس منٹ</em> ایک وقت میں۔"],
    tasks: ["03 · کام", "چھوٹے قدم، <em>ایک ایک کر کے مکمل۔</em>"],
    timetable: ["04 · ٹائم ٹیبل", "آپ کا ہفتہ، <em>ایک نظر میں۔</em>"],
    exams: ["05 · امتحانات", "الٹی گنتی، <em>پورے سکون سے۔</em>"],
    entry: ["MDCAT · ECAT", "انٹری ٹیسٹ، <em>پورا نقشہ۔</em>"],
    flashcards: ["06 · فلیش کارڈز", "خود کو آزمائیں، <em>کارڈ بہ کارڈ۔</em>"],
    "progress-sec": ["07 · پیش رفت", "دیکھیں <em>گھنٹے کیسے بڑھتے ہیں۔</em>"],
    buddy: ["08 · اے آئی ساتھی", "کہیں اٹک گئے؟ <em>بس پوچھیں۔</em>"],
    "get-app": ["09 · ایپ", "ایپ، <em>ہر جگہ ساتھ۔</em>"],
  },
  links: { "#syllabus": "نصاب", "#focus": "توجہ", "#tasks": "کام", "#timetable": "ٹائم ٹیبل", "#exams": "امتحانات", "#entry": "انٹری ٹیسٹ", "#flashcards": "فلیش کارڈز", "#progress-sec": "پیش رفت", "#buddy": "اے آئی ساتھی", "#get-app": "ایپ حاصل کریں", "#top": "آج" },
  tabs: { hero: "آج", syllabus: "نصاب", focus: "توجہ", tasks: "کام", buddy: "اے آئی", more: "مزید" },
};
const ur = (el, html) => { if (!el) return; el.innerHTML = html; el.classList.add("ur"); el.lang = "ur"; };
function applyUrdu() {
  Object.entries(UR.heads).forEach(([id, [kicker, head]]) => {
    ur(document.querySelector(`#${CSS.escape(id)} .section-head .kicker`), kicker);
    ur(document.querySelector(`#${CSS.escape(id)} .section-head h2`), head);
  });
  // text-only links (nav, More sheet); icon links keep their icon
  document.querySelectorAll(".nav a, .tab-sheet a").forEach((a) => {
    const t = UR.links[a.getAttribute("href")];
    if (!t) return;
    const label = [...a.childNodes].reverse().find((n) => n.nodeType === 3 && n.textContent.trim());
    if (label) { const s = document.createElement("span"); s.className = "ur"; s.lang = "ur"; s.textContent = t; label.replaceWith(s); }
  });
  document.querySelectorAll("#tabbar [data-tab]").forEach((b) => ur(b.querySelector("span"), UR.tabs[b.dataset.tab]));
  // the hover roll clips Nastaliq's tall letters, so Urdu buttons get plain text
  const plain = (a, t) => { if (a) a.innerHTML = `<span class="ur" lang="ur">${t}</span>`; };
  plain(document.querySelector('.hero-cta a[href="#syllabus"]'), "میرا نصاب کھولیں");
  plain(document.querySelector('.hero-cta a[href="#focus"]'), "پڑھائی شروع کریں");
  const keys = document.querySelectorAll(".today-k");
  ur(keys[0], "آج کے کام"); ur(keys[2], "اگلا امتحان");
  ur(document.querySelector("#buddySend span"), "پوچھیں");
}
if (LANG === "ur") applyUrdu();

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
// "dirty" = this device has changes the cloud hasn't got yet (e.g. made offline)
const markDirty = (on) => { try { on ? localStorage.setItem("swa-dirty", "1") : localStorage.removeItem("swa-dirty"); } catch (e) {} };
const isDirty = () => { try { return !!localStorage.getItem("swa-dirty"); } catch (e) { return false; } };
function save() { saveLocal(); if (token) { markDirty(true); scheduleSync(); } else maybeNudge(); }

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
    if (res.status === 503 && /^Database not connected/.test(body.detail || "")) throw new Error("Sign-in is down for a moment (the database isn't connected). You can keep using the planner on this device.");
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
  try { await api("/api/state", { method: "PUT", body: JSON.stringify({ data: state }) }); markDirty(false); setSync("ok"); }
  catch (e) { setSync("error"); syncTimer = setTimeout(pushState, 15000); }
}
// Cloud copy wins if it exists; otherwise this device's planner is uploaded.
async function pullState() {
  if (isDirty()) { await pushState(); return true; } // offline edits on this device are newer
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
// Punjab (PTB) or Federal (FBISE) books; planners made before boards existed are Punjab
function boardOf(p = state.profile) { return BOARDS[p?.board] || BOARDS.ptb; }
function useBoard() {
  const b = boardOf();
  SYLLABUS = b.syllabus;
  COMPULSORY = b.compulsory;
  const link = $("#bookLink");
  if (link) {
    link.href = b.books;
    $("#bookLinkTitle").textContent = `Read the ${b.short} books free →`;
    $("#bookLinkNote").textContent = `${b.short === "PTB" ? "Punjab Curriculum & Textbook Board" : "Federal Board (National Book Foundation books)"} website. Chapter names here follow the 2026–27 editions — always check against your own textbook.`;
  }
  return b;
}
const levelText = () => `Class ${state.profile.cls}, ${boardOf().name} (${groupOf().name})`;
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
let setupStep = 0;
function goStep(n) {
  setupStep = n;
  $$(".setup-card .step").forEach((el) => el.classList.toggle("active", +el.dataset.step === n));
  $$("#stepDots i").forEach((d, i) => d.classList.toggle("on", i <= n));
  if (n === 3) {
    const g = groupOf(pick);
    const bd = boardOf(pick);
    $("#stepSummary").innerHTML = g ? `<p><b>Class ${pick.cls}</b> · ${g.name} · ${bd.name}</p><div class="chips">${[...g.subjects, ...bd.compulsory[pick.cls]].map((id) => `<span class="tag"><i class="dot" style="background:${SUBJECT_INFO[id].color}"></i>${SUBJECT_INFO[id].name}</span>`).join("")}</div><p class="muted small">Every ${bd.short} chapter for these books, plus starter flashcards, is ready to go.</p>` : "";
  }
  if (A) gsap.fromTo($$(`.step[data-step="${n}"] > *`), { y: 20, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.06, duration: 0.6, ease: "expo.out" });
}
function openSetup() {
  pick = state.profile ? { ...state.profile } : { board: "ptb" };
  renderSetup();
  setup.classList.add("open");
  setup.setAttribute("aria-hidden", "false");
  if (lenis) lenis.stop();
  goStep(state.profile ? 1 : 0);
}
setup.addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (b && !b.disabled) goStep(+b.dataset.go); });
function closeSetup(force) {
  if (!state.profile && force !== true) return; // a class must be chosen first
  setup.classList.remove("open");
  setup.setAttribute("aria-hidden", "true");
  if (lenis) lenis.start();
}
function renderSetup() {
  $$("#classChoices button").forEach((b) => b.classList.toggle("active", +b.dataset.cls === pick.cls));
  $$("#boardChoices button").forEach((b) => b.classList.toggle("active", b.dataset.board === (pick.board || "ptb")));
  const groups = pick.cls ? GROUPS[levelOf(pick.cls)] : [];
  if (pick.cls && !groups.some((g) => g.id === pick.group)) pick.group = null;
  $("#groupChoices").innerHTML = groups.map((g) => `
    <button data-group="${g.id}" class="${g.id === pick.group ? "active" : ""}"><b>${g.name}</b><small>${g.subjects.map((s) => SUBJECT_INFO[s].name).join(" · ")}</small></button>`).join("");
  if (A && groups.length) gsap.from($$("#groupChoices button"), { y: 16, opacity: 0, stagger: 0.06, duration: 0.6, ease: "expo.out" });
  $("#setupDone").disabled = !(pick.cls && pick.group);
  $("#stepClassNext").disabled = !pick.cls;
  $("#stepGroupNext").disabled = !(pick.cls && pick.group);
}
$("#classChoices").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { pick.cls = +b.dataset.cls; renderSetup(); setTimeout(() => goStep(2), 280); } });
$("#boardChoices").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { pick.board = b.dataset.board; renderSetup(); } });
$("#groupChoices").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { pick.group = b.dataset.group; renderSetup(); setTimeout(() => goStep(3), 280); } });
$("#setupBg").onclick = closeSetup;
$("#classBtn").onclick = openSetup;
$("#setupDone").onclick = () => {
  const first = !state.profile;
  state.profile = { cls: pick.cls, group: pick.group, board: pick.board || "ptb" };
  useBoard();
  seedFor(first);
  save();
  sylSubject = null;
  renderAll(true);
  closeSetup();
  toast(`Planner ready for Class ${pick.cls} · ${groupOf().name} · ${boardOf().short}`);
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
  $("#authReset").hidden = true;
  $("#authCodeBox").hidden = true;
  $("#authSigned").hidden = !signed;
  $("#authOffline").hidden = CLOUD;
  if (signed) { $("#authName").textContent = username; setSync($("#syncDot").classList.contains("error") ? "error" : "ok"); loadAccount(); }
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
  $("#authWarn").hidden = $("#authEmail").hidden = t === "login";
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
  if (!state.profile && !pulling) openSetup();
}
// After a few real actions (ticking chapters, adding tasks…), suggest saving to the cloud — once a day at most
let actions = 0;
function maybeNudge() {
  if (token || !CLOUD || ++actions !== 5) return;
  try { if (localStorage.getItem("swa-nudged") === dayKey()) return; localStorage.setItem("swa-nudged", dayKey()); } catch (e) {}
  setTimeout(() => {
    if (token || auth.classList.contains("open") || setup.classList.contains("open")) return;
    authTab = "signup";
    openAuth();
  }, 900);
}
$("#authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submit = $("#authSubmit");
  submit.disabled = true;
  $("#authError").textContent = "";
  try {
    const res = await api(authTab === "login" ? "/api/login" : "/api/signup", {
      method: "POST",
      body: JSON.stringify({ username: $("#authUser").value, password: $("#authPass").value, ...(authTab === "signup" ? { email: $("#authEmail").value } : {}) }),
    });
    rememberLogin(res.token, res.username);
    pulling = true;
    const hadCloud = await pullState();
    pulling = false;
    $("#authPass").value = "";
    renderAll(true);
    if (res.recovery_code) showCode(res.recovery_code, "Account ready"); else closeAuth();
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
// ---------- Recovery codes ----------
function authPane(id) { ["authForms", "authReset", "authCodeBox", "authSigned"].forEach((x) => ($("#" + x).hidden = x !== id)); }
function showCode(code, kicker) {
  $("#codeKicker").textContent = kicker;
  $("#codeValue").textContent = code;
  $("#codeCopy").textContent = "Copy";
  authPane("authCodeBox");
}
$("#codeCopy").onclick = async () => {
  try { await navigator.clipboard.writeText($("#codeValue").textContent); $("#codeCopy").textContent = "Copied ✓"; } catch (e) { toast("Select the code and copy it by hand"); }
};
$("#codeDone").onclick = () => closeAuth();
$("#forgotBtn").onclick = () => { $("#resetUser").value = $("#authUser").value; $("#resetError").textContent = ""; $("#resetSent").hidden = true; authPane("authReset"); };
$("#resetMail").onclick = async () => {
  const btn = $("#resetMail");
  $("#resetError").textContent = "";
  if (!$("#resetUser").value.trim()) { $("#resetError").textContent = "Type your username first"; return $("#resetUser").focus(); }
  btn.disabled = true;
  btn.textContent = "Sending…";
  try {
    const res = await api("/api/forgot", { method: "POST", body: JSON.stringify({ username: $("#resetUser").value }) });
    $("#resetSent").textContent = `Code sent to ${res.sent_to}. It works for ${res.minutes} minutes — check Spam too.`;
    $("#resetSent").hidden = false;
    $("#resetCode").focus();
  } catch (err) {
    $("#resetError").textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Email me a code";
  }
};
$("#resetBack").onclick = () => authPane("authForms");
$("#resetForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#resetSubmit").disabled = true;
  $("#resetError").textContent = "";
  try {
    const res = await api("/api/reset", { method: "POST", body: JSON.stringify({ username: $("#resetUser").value, code: $("#resetCode").value, password: $("#resetPass").value }) });
    rememberLogin(res.token, res.username);
    pulling = true;
    await pullState();
    pulling = false;
    $("#resetPass").value = $("#resetCode").value = "";
    renderAll(true);
    showCode(res.recovery_code, "Password changed");
    toast(`Welcome back, ${res.username}. Your old code is used up, so save the new one`);
  } catch (err) {
    pulling = false;
    $("#resetError").textContent = err.message;
  } finally {
    $("#resetSubmit").disabled = false;
  }
});
$("#newCode").onclick = async () => {
  try { const res = await api("/api/recovery-code", { method: "POST" }); showCode(res.recovery_code, "New recovery code"); }
  catch (err) { toast(err.message); }
};
// ---------- Account: reset email and password change ----------
async function loadAccount() {
  try {
    const me = await api("/api/me");
    $("#acctEmailNow").textContent = me.email ? `· ${me.email}` : "· not added";
    $("#acctEmail").open = !me.email && me.email_reset; // nudge students without an email to add one
  } catch (e) {}
}
$("#emailForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#emailError").textContent = "";
  try {
    const res = await api("/api/account/email", { method: "POST", body: JSON.stringify({ email: $("#emailNew").value, password: $("#emailPass").value }) });
    $("#emailPass").value = $("#emailNew").value = "";
    $("#acctEmailNow").textContent = res.email ? `· ${res.email}` : "· not added";
    $("#acctEmail").open = false;
    toast(res.email ? "Email saved: you can now reset your password by email" : "Email removed");
  } catch (err) { $("#emailError").textContent = err.message; }
});
$("#passForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#passError").textContent = "";
  try {
    await api("/api/account/password", { method: "POST", body: JSON.stringify({ old: $("#passOld").value, new: $("#passNew").value }) });
    $("#passOld").value = $("#passNew").value = "";
    $("#passForm").closest("details").open = false;
    toast("Password changed. Other devices have been signed out");
  } catch (err) { $("#passError").textContent = err.message; }
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
  $("#tagline").innerHTML = taglineText();
}
function taglineText() {
  const h = new Date().getHours();
  const line = h < 5 ? "Burning the midnight oil? Don't forget to sleep. 😴"
    : h < 12 ? "Good morning! Let's smash today's goals. ☀️"
    : h < 17 ? "Afternoon push: one chapter at a time. 📚"
    : h < 21 ? "Evening revision time. You've got this. ✨"
    : "Ready for some night study? 🌙";
  return username ? `<b>${esc(username)}</b>, ${line.charAt(0).toLowerCase()}${line.slice(1)}` : line;
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
    tasksLeft: state.tasks.filter((t) => !t.done && t.due && t.due <= dayKey()).length,
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
  // Rings: today's focus vs the daily goal, tasks vs what's due, streak towards a full week, exam getting closer
  const goal = state.settings.goal || 120, taskAll = v.statTasks + v.tasksLeft;
  setRing("ringFocus", v.statFocus / goal);
  setRing("ringTasks", taskAll ? v.statTasks / taskAll : 0);
  setRing("ringStreak", v.statStreak ? (v.statStreak % 7 || 7) / 7 : 0);
  setRing("ringExam", v.statExam === null ? 0 : 1 - Math.min(v.statExam, 90) / 90);
  $("#goalFocus").textContent = v.statFocus >= goal ? "Daily goal reached! 🎯" : `of ${goal} min daily goal`;
  $("#goalTasks").textContent = taskAll ? `${v.tasksLeft} still due today` : "nothing due today";
  $("#goalStreak").textContent = v.statStreak ? `week ${Math.ceil(v.statStreak / 7)} · keep the flame alive` : "study today to light it";
  $("#goalExam").textContent = v.statExam === null ? "" : v.statExam <= 7 ? "final week, revise daily" : "";
  const badge = $("#streakBadge");
  badge.textContent = v.statStreak ? `🔥 ${v.statStreak}` : "";
  badge.closest(".stat-card").classList.toggle("hot", v.statStreak > 0);
  renderReviewDue();
  renderToday();
}
function renderToday() {
  const box = $("#todayPanel");
  if (!state.profile) { box.hidden = true; return; }
  box.hidden = false;
  const today = dayKey(), due = state.tasks.filter((t) => !t.done && t.due && t.due <= today).sort((a, b) => b.priority - a.priority);
  $("#todayTasks").innerHTML = due.length
    ? due.slice(0, 3).map((t) => `<li style="--c:${subj(t.subject).color}"><span class="dot"></span>${esc(t.text)}${t.due < today ? ' <em>overdue</em>' : ""}</li>`).join("") + (due.length > 3 ? `<li class="muted">+${due.length - 3} more</li>` : "")
    : '<li class="muted">Nothing due today. Add one in Tasks.</li>';
  const now = new Date(), hm = now.toTimeString().slice(0, 5), d = jsDayToIdx(now.getDay());
  const todays = state.blocks.filter((b) => b.day === d).sort((a, b) => a.start.localeCompare(b.start));
  const live = todays.find((b) => b.start <= hm && hm < b.end), next = todays.find((b) => b.start > hm);
  const blk = live || next;
  $("#todayBlockK").textContent = LANG === "ur" ? (live ? "ابھی" : "اگلی کلاس") : live ? "Now" : "Next";
  if (LANG === "ur") $("#todayBlockK").classList.add("ur");
  $("#todayBlock").innerHTML = blk ? `<b>${esc(blk.title)}</b> · ${live ? `until ${blk.end}` : `at ${blk.start}`}` : '<span class="muted">No more classes today</span>';
  const ne = nextExam();
  $("#todayExam").innerHTML = ne ? `<b>${esc(ne.title)}</b> · ${Math.max(0, Math.ceil((new Date(ne.date) - now) / 864e5))} days` : '<span class="muted">No exams added</span>';
}
const RING_C = 2 * Math.PI * 19;
function setRing(id, f) {
  const el = $("#" + id);
  el.style.strokeDasharray = RING_C;
  el.style.strokeDashoffset = RING_C * (1 - Math.max(0, Math.min(1, f || 0)));
}

// ---------- Nazar-e-Saani: spaced repetition reminders ----------
// After a chapter is read, revise it after 1, 3, 7, 14, 30 and 60 days; each revision pushes the next one further out.
const REVIEW_GAPS = [1, 3, 7, 14, 30, 60];
function reviewsDue() {
  if (!state.profile) return [];
  const today = dayKey(), out = [];
  bookSubjects().forEach((s) => {
    const b = bookOf(s);
    if (!b) return;
    b.chapters.forEach((name, i) => {
      const n = b.start + i, pr = state.syl[sylKey(s, n)];
      const last = pr && pr.r && (pr.vAt || pr.rAt);
      if (!last) return;
      const due = dayKey(addDays(new Date(last + "T00:00"), REVIEW_GAPS[Math.min(pr.n || 0, REVIEW_GAPS.length - 1)]));
      if (due <= today) out.push({ s, n, name, last, ago: Math.round((new Date(today) - new Date(last)) / 864e5) });
    });
  });
  return out.sort((a, b) => b.ago - a.ago);
}
function markRevised(pr) { pr.r = true; pr.v = true; pr.vAt = dayKey(); pr.n = (pr.n || 0) + 1; }
function renderReviewDue() {
  const box = $("#reviewDue");
  if (!box) return;
  const due = reviewsDue();
  if (!due.length) { box.innerHTML = ""; box.hidden = true; return; }
  box.hidden = false;
  const top = due[0], info = SUBJECT_INFO[top.s];
  box.innerHTML = `<div class="rd-head"><span class="rd-kicker">Nazar-e-Saani · ${due.length} revision${due.length === 1 ? "" : "s"} due</span></div>
    <p>${username ? `<b>${esc(username)}</b>, you` : "You"} read <b style="color:${info.color}">${info.name} Ch ${top.n}</b> ${top.ago} day${top.ago === 1 ? "" : "s"} ago. A quick revision today locks it in.</p>
    <ul>${due.slice(0, 3).map((d) => `<li style="--c:${SUBJECT_INFO[d.s].color}"><span class="dot"></span><span class="rd-name">${esc(SUBJECT_INFO[d.s].name)} · Ch ${d.n}: ${esc(d.name)}</span><button class="toggle rev" data-rev="${d.s}|${d.n}"><svg><use href="#i-check"/></svg>Revised</button></li>`).join("")}</ul>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-rev]");
  if (!b) return;
  const [s, n] = b.dataset.rev.split("|"), k = sylKey(s, +n);
  const pr = state.syl[k] || {};
  markRevised(pr);
  state.syl[k] = pr;
  save();
  confetti(...centerOf(b), 30);
  toast(`Revised! Next reminder in ${REVIEW_GAPS[Math.min(pr.n, REVIEW_GAPS.length - 1)]} days`);
  renderReviewDue();
  if (s === sylSubject) renderChapters();
  updateSubjectProgress(s);
});

// =====================================================================
//  Syllabus
// =====================================================================
let sylSubject = null;
const boardKey = () => (state.profile?.board === "fbise" ? "fb-" : ""); // FBISE ticks get their own keys
const sylKey = (s, n) => `${boardKey()}${state.profile.cls}-${s}-${n}`;
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
  $("#sylMeta").textContent = `${b.chapters.length} chapters · ${p.read} read · ${p.rev} revised · ${boardOf().short} 2026–27 edition`;
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
  $("#sylMeta").textContent = `${p.total} chapters · ${p.read} read · ${p.rev} revised · ${boardOf().short} 2026–27 edition`;
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
  if (btn.dataset.act === "r" && pr.r && !pr.rAt) pr.rAt = dayKey();
  if (btn.dataset.act === "v" && pr.v) { markRevised(pr); if (!pr.rAt) pr.rAt = dayKey(); } // revised implies read
  state.syl[k] = pr;
  save();
  $(".toggle.read", li).classList.toggle("on", !!pr.r);
  $(".toggle.rev", li).classList.toggle("on", !!pr.v);
  li.classList.toggle("revised", !!pr.v);
  if (A) gsap.fromTo(btn, { scale: 0.85 }, { scale: 1, duration: 0.6, ease: "elastic.out(1,0.4)" });
  updateSubjectProgress(sylSubject);
  renderReviewDue();
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
state.settings.exam = state.settings.exam || 180;
state.settings.goal = state.settings.goal || 120;
const timerCard = $("#timerCard");
let mode = "focus", remaining = state.settings.focus * 60, running = false, endAt = 0, tickId = null, inRoom = false;
const total = () => state.settings[mode] * 60;
const fmt = (s) => s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
function drawTimer() {
  $("#timeText").textContent = fmt(remaining);
  $("#ringFg").style.strokeDashoffset = C * (1 - remaining / total());
  $("#timeLabel").textContent = running
    ? (mode === "exam" ? `Mock exam · ${subj($("#focusSubject").value).name}` : mode === "focus" ? `Focusing on ${subj($("#focusSubject").value).name}` : "Break — stretch, drink water")
    : remaining === total() ? (mode === "exam" ? `${+(state.settings.exam / 60).toFixed(1)}-hour mock paper` : mode === "focus" ? "Ready to focus" : "Ready for a break") : "Paused";
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
  timerCard.classList.remove("mode-focus", "mode-short", "mode-long", "mode-exam");
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
  joinRoom();
  namazHeadsUp();
}
function stopTimer() {
  running = false;
  clearInterval(tickId);
  timerCard.classList.remove("running");
  leaveRoom();
}
function tick() {
  const r = Math.max(0, Math.round((endAt - Date.now()) / 1000));
  if (r !== remaining) { remaining = r; drawTimer(); }
  if (r === 0) finish();
}
function finish() {
  stopTimer();
  chime();
  if (mode === "exam") {
    state.sessions.push({ date: dayKey(), min: state.settings.exam, subject: $("#focusSubject").value, at: new Date().toTimeString().slice(0, 5) });
    save();
    renderSessionLog(true); renderStats(); renderProgress();
    toast("Time's up! Pens down. ✍️ Check your answers against the book.");
    confetti(innerWidth / 2, innerHeight / 3, 160);
    setMode("focus");
  } else if (mode === "focus") {
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
let pdfUrl = null;
const wide = () => matchMedia("(min-width: 821px)").matches;
function setReader(open) {
  $("#reader").hidden = !open;
  $(".focus-grid").classList.toggle("reading", open);
  if (open && A) gsap.fromTo("#reader", { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.7, ease: "expo.out" });
  refreshTriggers();
}
$("#readerOpen").onclick = () => (wide() ? setReader(true) : $("#pdfFile").click());
$("#readerClose").onclick = () => setReader(false);
$("#pdfFile").addEventListener("change", (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  pdfUrl = URL.createObjectURL(f);
  if (!wide()) { window.open(pdfUrl, "_blank"); return; } // phones can't show a PDF inside the page
  $("#pdfFrame").src = pdfUrl;
  $("#pdfFrame").hidden = false;
  $("#readerEmpty").hidden = true;
  $("#readerTitle").textContent = f.name.replace(/\.pdf$/i, "");
  setReader(true);
});
$("#durGoal").value = state.settings.goal;
$("#durGoal").addEventListener("change", () => {
  state.settings.goal = Math.min(720, Math.max(10, +$("#durGoal").value || 120));
  $("#durGoal").value = state.settings.goal;
  save(); renderStats();
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
    .sort((a, b) => a.done - b.done || (a.order ?? 1e9) - (b.order ?? 1e9) || (a.due || "9999").localeCompare(b.due || "9999"));
}
const PRIOS = [[2, "High priority"], [1, "Medium priority"], [0, "Low priority"]];
let sortables = [];
function renderTasks(animate) {
  const list = visibleTasks();
  $("#taskList").innerHTML = list.length || state.tasks.length
    ? PRIOS.map(([p, label]) => {
        const items = list.filter((t) => t.priority === p);
        return `<li class="prio-group p${p}"><div class="pg-head"><i class="prio p${p}"></i>${label}<span>${items.length}</span></div>
          <ul class="task-drop" data-prio="${p}">${items.map(taskHTML).join("")}</ul></li>`;
      }).join("")
    : '<li class="list-empty">Nothing here yet — add a task above, or press “Plan” on a chapter.</li>';
  sortables.forEach((x) => x.destroy());
  sortables = window.Sortable ? $$("#taskList .task-drop").map((ul) => new Sortable(ul, {
    group: "tasks", draggable: ".task", animation: 220, easing: "cubic-bezier(.16,1,.3,1)",
    filter: ".check, .del", preventOnFilter: false, delay: 180, delayOnTouchOnly: true,
    ghostClass: "task-ghost", chosenClass: "task-chosen", dragClass: "task-drag",
    onEnd: (ev) => {
      const moved = state.tasks.find((t) => t.id === ev.item.dataset.id), to = +ev.to.dataset.prio;
      const changed = moved && moved.priority !== to;
      if (moved) moved.priority = to;
      [ev.from, ev.to].forEach((ul) => $$(".task", ul).forEach((li, i) => { const t = state.tasks.find((x) => x.id === li.dataset.id); if (t) t.order = i; }));
      save();
      renderTasks();
      if (changed) toast(`Moved to ${PRIOS.find(([p]) => p === to)[1]}`);
    },
  })) : [];
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
  const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5), nowMin = toMin(hm);
  let lineDone = !isToday;
  const nowLine = () => { lineDone = true; return `<li class="now-line"><span>Now · ${hm}</span></li>`; };
  $("#blocks").innerHTML = list.length ? list.map((b) => {
    const s = subj(b.subject), live = isToday && b.start <= hm && hm < b.end;
    const before = !lineDone && !live && b.start > hm ? nowLine() : "";
    if (live) lineDone = true;
    const prog = live ? (nowMin - toMin(b.start)) / (toMin(b.end) - toMin(b.start)) : 0;
    return `${before}<li class="block ${live ? "now" : ""}" data-id="${b.id}" style="--c:${s.color};--p:${prog.toFixed(3)}">
      <div class="block-time">${b.start}<small>to ${b.end}</small></div>
      <div><h4>${esc(b.title)}<span class="live">Now</span></h4><p>${esc(s.name)}</p></div>
      <button class="icon-btn del" aria-label="Delete block"><svg><use href="#i-trash"/></svg></button>
    </li>`;
  }).join("") + (lineDone ? "" : nowLine()) : `<li class="list-empty">Nothing planned for ${DAYS[ttDay]} — add a block on the right.</li>`;
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
  renderPlanExams();
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
  c.known = false;
  addMistake({ kind: "card", ref: c.id, subject: c.subject, text: c.front, answer: c.back });
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
  // GitHub-style grid: 52 full weeks, Monday-first columns, ending this week. A finished task counts as 15 minutes.
  const start = addDays(today, -jsDayToIdx(today.getDay()) - 51 * 7);
  const tasksOn = {};
  state.tasks.forEach((t) => { if (t.doneAt) tasksOn[t.doneAt] = (tasksOn[t.doneAt] || 0) + 1; });
  const cells = [];
  let activeDays = 0;
  for (let i = 0; i < 52 * 7; i++) {
    const d = addDays(start, i), k = dayKey(d), m = minutesOn(k), t = tasksOn[k] || 0, score = m + t * 15, future = d > today;
    if (score && !future) activeDays++;
    const lvl = score === 0 ? 0 : score <= 30 ? 1 : score <= 60 ? 2 : score <= 120 ? 3 : 4;
    cells.push(`<i class="l${lvl} ${k === dayKey() ? "today" : ""}" ${future ? 'style="opacity:.25"' : ""} title="${d.toDateString()} · ${m} min${t ? ` · ${t} task${t > 1 ? "s" : ""}` : ""}"></i>`);
  }
  $("#heatmap").innerHTML = cells.join("");
  $("#heatTotal").textContent = `· ${activeDays} active day${activeDays === 1 ? "" : "s"}`;
  const hm = $("#heatmap");
  requestAnimationFrame(() => (hm.scrollLeft = hm.scrollWidth)); // show the latest weeks first on phones
  $("#sylBars").innerHTML = state.profile ? bookSubjects().map((s) => {
    const p = bookProgress(s), info = SUBJECT_INFO[s], r = p.total ? p.read / p.total : 0, v = p.total ? p.rev / p.total : 0;
    return `<li><div class="sb-top"><span>${esc(info.name)}</span><b>${Math.round(r * 100)}%</b></div>
      <div class="sb-track stacked" title="${p.read} read · ${p.rev} revised of ${p.total}"><i class="rd" data-w="${r}" style="--c:${info.color};transform:scaleX(${r})"></i><i class="rv" data-w="${v}" style="--c:${info.color};transform:scaleX(${v})"></i></div></li>`;
  }).join("") : "";
  if (animate && A) animateCharts();
}
function animateCharts() {
  gsap.fromTo("#barChart .bar-col", { scaleY: 0 }, { scaleY: 1, stagger: 0.06, duration: 1.1, ease: "expo.out" });
  gsap.fromTo("#subjectBars i, #sylBars i", { scaleX: 0 }, { scaleX: (i, el) => +el.dataset.w || 0, stagger: 0.05, duration: 1.2, ease: "expo.out" });
  gsap.fromTo("#heatmap i", { scale: 0 }, { scale: 1, stagger: { each: 0.0015, from: "end" }, duration: 0.45, ease: "back.out(2)" });
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
  const bs = $("#buddySubject"), bcur = bs.value;
  bs.innerHTML = `<option value="">Any subject</option>${subjOptions(bcur)}`;
  bs.value = bcur;
}
function renderAll(animate) {
  useBoard();
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
  renderEntry();
  loadBoard();
  renderRoomPick();
  renderMistakes();
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
  // Tick the first chapters of each book as read (some revised), spread over the last few weeks
  bookSubjects().forEach((s, si) => {
    const b = bookOf(s);
    const read = Math.max(1, Math.round(b.chapters.length * (si < core.length ? 0.45 : 0.25)));
    for (let i = 0; i < read; i++) {
      const k = sylKey(s, b.start + i), when = dayKey(addDays(new Date(), -(3 + i * 4 + si)));
      const pr = state.syl[k] || {};
      if (!pr.r) Object.assign(pr, { r: true, rAt: when });
      if (i < read / 2 && !pr.v) Object.assign(pr, { v: true, vAt: dayKey(addDays(new Date(), -(1 + i * 2))), n: 2 });
      state.syl[k] = pr;
    }
  });
  state.exams.forEach((x) => (x.title = x.title.replace(" (update date)", "")));
  save(); renderAll(); if (A) animateCharts();
  toast("Sample study history added — charts are filled in");
};
$("#exportBtn").onclick = () => {
  const blob = new Blob([JSON.stringify({ app: "study-with-ahmad", version: 1, exportedAt: new Date().toISOString(), data: state }, null, 1)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `study-with-ahmad-backup-${dayKey()}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Backup downloaded. Keep it somewhere safe");
};
$("#importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text()), data = parsed.data || parsed;
    if (typeof data !== "object" || !("tasks" in data || "syl" in data || "profile" in data)) throw new Error();
    if (!confirm("Replace your current planner with this backup?")) return;
    state = { ...defaults(), ...data };
    save(); renderAll(true);
    toast("Backup restored ✓");
  } catch (err) { toast("That file isn't a Study with Ahmad backup"); }
});
$("#clearBtn").onclick = async () => {
  if (!confirm(token ? "Delete all your Study with Ahmad data, in this browser AND in your cloud account? This can't be undone." : "Delete all your Study with Ahmad data in this browser? This can't be undone.")) return;
  state = defaults();
  saveLocal();
  if (token) { clearTimeout(syncTimer); try { await api("/api/state", { method: "PUT", body: JSON.stringify({ data: state }) }); } catch (e) {} }
  location.reload();
};

// Theme toggle — the new theme grows out of the button as a circle
function isDark() { return root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; }
const themeNow = () => (root.dataset.amoled ? "amoled" : isDark() ? "dark" : "light");
function applyTheme(t) {
  root.dataset.theme = t === "light" ? "light" : "dark";
  if (t === "amoled") root.dataset.amoled = "1"; else delete root.dataset.amoled;
  try { localStorage.setItem("studynest-theme", t); } catch (e) {}
  $$("#themeSeg button").forEach((b) => b.classList.toggle("active", b.dataset.themeSet === t));
  $('meta[name="theme-color"]').content = t === "amoled" ? "#000000" : t === "dark" ? "#111019" : "#5b4bf5";
}
function applyAccent(a) {
  if (a) root.dataset.accent = a; else delete root.dataset.accent;
  try { a ? localStorage.setItem("swa-accent", a) : localStorage.removeItem("swa-accent"); } catch (e) {}
  $$("#accentSwatches button").forEach((b) => b.classList.toggle("active", b.dataset.accentSet === (a || "")));
}
$$("#themeSeg button").forEach((b) => b.classList.toggle("active", b.dataset.themeSet === themeNow()));
$$("#accentSwatches button").forEach((b) => b.classList.toggle("active", b.dataset.accentSet === (root.dataset.accent || "")));
$$("#langSeg button").forEach((b) => b.classList.toggle("active", b.dataset.langSet === LANG));
$("#langSeg").addEventListener("click", (e) => {
  const b = e.target.closest("[data-lang-set]");
  if (!b || b.dataset.langSet === LANG) return;
  try { localStorage.setItem("swa-lang", b.dataset.langSet); } catch (err) {}
  location.reload();
});
$("#themeSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-theme-set]"); if (b) applyTheme(b.dataset.themeSet); });
$("#accentSwatches").addEventListener("click", (e) => { const b = e.target.closest("[data-accent-set]"); if (b) { applyAccent(b.dataset.accentSet); toast(`${b.title} theme on`); } });
// Header button cycles light → dark → AMOLED
$("#themeBtn").onclick = () => {
  const next = { light: "dark", dark: "amoled", amoled: "light" }[themeNow()];
  const apply = () => applyTheme(next);
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
const phone = matchMedia("(max-width: 820px)");
const TAB_OF = { hero: "hero", syllabus: "syllabus", focus: "focus", tasks: "tasks", buddy: "buddy" };
function showTab(id) {
  const sec = id === "top" ? $("#hero") : $("#" + id);
  if (!sec) return;
  $$("main > section").forEach((s) => s.classList.toggle("tab-on", s === sec));
  $$("#tabbar [data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === (TAB_OF[sec.id] || "more")));
  $("#tabSheet").hidden = true;
  try { sessionStorage.setItem("swa-tab", sec.id); } catch (e) {}
  if (lenis) lenis.scrollTo(0, { immediate: true }); else scrollTo(0, 0);
  refreshTriggers();
}
function applyTabbed() {
  root.classList.toggle("tabbed", phone.matches);
  if (!phone.matches) return;
  let last = "hero";
  try { last = sessionStorage.getItem("swa-tab") || "hero"; } catch (e) {}
  showTab(last);
}
phone.addEventListener("change", applyTabbed);
applyTabbed();
$("#tabMore").onclick = () => { $("#tabSheet").hidden = !$("#tabSheet").hidden; };
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  e.preventDefault();
  nav.classList.remove("open");
  const href = a.getAttribute("href");
  if (root.classList.contains("tabbed") && (href === "#top" || $(href)?.closest("main"))) {
    const sec = href === "#top" ? $("#hero") : $(href).closest("main > section");
    showTab(sec.id);
    if (sec.id !== href.slice(1) && href !== "#top") setTimeout(() => scrollToEl($(href)), 50);
    return;
  }
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
// ---------- Study sounds: rain, brown noise and white noise, generated with Web Audio ----------
let audio = null, soundNode = null, soundOn = "";
function noiseBuffer(ctx, kind) {
  const len = ctx.sampleRate * 4, buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
  }
  return buf;
}
function startSound(kind) {
  audio = audio || new (window.AudioContext || window.webkitAudioContext)();
  stopSound();
  const src = audio.createBufferSource();
  src.buffer = noiseBuffer(audio, kind === "brown" ? "brown" : "white");
  src.loop = true;
  const gain = audio.createGain();
  gain.gain.value = 0;
  let chain = src;
  if (kind === "rain") {
    // rain = bright noise through a band-pass, with a slow wobble in loudness
    const bp = audio.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1400; bp.Q.value = 0.6;
    const lp = audio.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5000;
    src.connect(bp); bp.connect(lp); chain = lp;
    const lfo = audio.createOscillator(), lfoGain = audio.createGain();
    lfo.frequency.value = 0.15; lfoGain.gain.value = 0.08; lfo.connect(lfoGain); lfoGain.connect(gain.gain); lfo.start();
    src.onended = () => lfo.stop();
  }
  chain.connect(gain); gain.connect(audio.destination);
  src.start();
  gain.gain.linearRampToValueAtTime(+$("#soundVol").value * (kind === "white" ? 0.35 : 1), audio.currentTime + 1.2);
  soundNode = { src, gain, kind };
  soundOn = kind;
}
function stopSound() {
  if (!soundNode) return;
  const { src, gain } = soundNode;
  gain.gain.cancelScheduledValues(audio.currentTime);
  gain.gain.setValueAtTime(gain.gain.value, audio.currentTime);
  gain.gain.linearRampToValueAtTime(0, audio.currentTime + 0.6);
  src.stop(audio.currentTime + 0.65);
  soundNode = null; soundOn = "";
}
$("#sounds").addEventListener("click", (e) => {
  const b = e.target.closest("[data-sound]");
  if (!b) return;
  if (soundOn === b.dataset.sound) stopSound(); else startSound(b.dataset.sound);
  $$("#sounds [data-sound]").forEach((x) => x.classList.toggle("active", x.dataset.sound === soundOn));
});
$("#soundVol").addEventListener("input", () => {
  if (soundNode) soundNode.gain.gain.setTargetAtTime(+$("#soundVol").value * (soundNode.kind === "white" ? 0.35 : 1), audio.currentTime, 0.1);
});

// ---------- AI Study Buddy ----------
let buddyLang = "en", buddyBusy = false;
const buddyHistory = []; // this visit only: [{ role: "user" | "model", text }]
// Small, safe Markdown: **bold**, *italic*, `code`, headings, bullet and numbered lists, paragraphs
function mdLite(text) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|\W)\*(?!\s)(.+?)\*(?=\W|$)/g, "$1<i>$2</i>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  text.split(/\r?\n/).forEach((line) => {
    const bullet = line.match(/^\s*[-*•]\s+(.*)/), num = line.match(/^\s*\d+[.)]\s+(.*)/), head = line.match(/^\s*#{1,6}\s+(.*)/);
    if (bullet || num) {
      const want = bullet ? "ul" : "ol";
      if (list !== want) { close(); out.push(`<${want}>`); list = want; }
      out.push(`<li>${inline((bullet || num)[1])}</li>`);
    } else if (head) { close(); out.push(`<h4>${inline(head[1])}</h4>`); }
    else if (line.trim()) { close(); out.push(`<p>${inline(line)}</p>`); }
    else close();
  });
  close();
  return out.join("");
}
function addMsg(who, html) {
  const el = document.createElement("div");
  el.className = `msg ${who}`;
  el.innerHTML = (who === "bot" ? '<span class="msg-ico"><svg><use href="#i-spark"/></svg></span>' : "") + `<div class="msg-body">${html}</div>`;
  $("#buddyChat").append(el);
  if (A) gsap.from(el, { y: 16, opacity: 0, duration: 0.5, ease: "expo.out" });
  $("#buddyChat").scrollTop = $("#buddyChat").scrollHeight;
  return el;
}
const answerOf = new WeakMap(); // bot message element -> { question, answer }
async function askBuddy(question, image = "") {
  if (buddyBusy) return;
  if (!CLOUD || !token) { toast("Sign in first to ask Study Buddy (it's free)"); authTab = "login"; openAuth(); return; }
  buddyBusy = true;
  $("#buddySend").disabled = true;
  addMsg("me", `${image ? `<img class="msg-photo" src="${image}" alt="Question photo" />` : ""}${question ? `<p>${esc(question).replace(/\n/g, "<br>")}</p>` : ""}`);
  const typing = addMsg("bot typing", "<span class=\"dots\"><i></i><i></i><i></i></span>");
  const s = $("#buddySubject").value;
  try {
    const res = await api("/api/ask", {
      method: "POST",
      body: JSON.stringify({
        question, image, language: buddyLang, history: buddyHistory.slice(-6),
        level: state.profile ? levelText() : "",
        subject: s ? subj(s).name : "",
      }),
    });
    typing.classList.remove("typing");
    $(".msg-body", typing).innerHTML = mdLite(res.answer);
    if (buddyLang === "ur") $(".msg-body", typing).setAttribute("dir", "rtl");
    buddyHistory.push({ role: "user", text: question || "(sent a photo of a question)" }, { role: "model", text: res.answer });
    answerOf.set(typing, { question: question || "Photo question", answer: res.answer, subject: s });
    typing.querySelector(".msg-body").insertAdjacentHTML("beforeend", '<button class="msg-save" data-save type="button">📒 Save to mistake notebook</button>');
    $("#buddyLeft").textContent = `${res.left} question${res.left === 1 ? "" : "s"} left today`;
  } catch (err) {
    typing.classList.remove("typing");
    typing.classList.add("error");
    $(".msg-body", typing).innerHTML = `<p>${esc(err.message)}</p>`;
  } finally {
    buddyBusy = false;
    $("#buddySend").disabled = false;
    $("#buddyChat").scrollTop = $("#buddyChat").scrollHeight;
  }
}
$("#buddyForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#buddyInput").value.trim(), img = pendingPhoto;
  if (!q && !img) return;
  $("#buddyInput").value = "";
  $("#buddyInput").style.height = "";
  clearPhoto();
  askBuddy(q, img);
});
$("#buddyInput").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#buddyForm").requestSubmit(); } });
$("#buddyInput").addEventListener("input", (e) => { e.target.style.height = ""; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; });
$("#buddyQuick").addEventListener("click", (e) => {
  const b = e.target.closest("[data-q]");
  if (!b) return;
  const inp = $("#buddyInput");
  inp.value = b.dataset.q;
  inp.focus();
  inp.setSelectionRange(inp.value.length, inp.value.length);
});
$("#buddyExamples").addEventListener("click", (e) => { const b = e.target.closest("[data-ask]"); if (b) askBuddy(b.dataset.ask); });
$("#buddyLang").addEventListener("click", (e) => {
  const b = e.target.closest("[data-lang]");
  if (!b) return;
  buddyLang = b.dataset.lang;
  $$("#buddyLang button").forEach((x) => x.classList.toggle("active", x === b));
});

// ---------- AI study plan ----------
let lastPlan = null;
function renderPlanExams() {
  const sel = $("#planExam"), cur = sel.value, now = Date.now();
  const list = state.exams.filter((x) => new Date(x.date) > now).sort((a, b) => new Date(a.date) - new Date(b.date));
  sel.innerHTML = list.length ? list.map((x) => `<option value="${x.id}">${esc(x.title)} · ${new Date(x.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</option>`).join("") : '<option value="">Add an exam above first</option>';
  if (list.some((x) => x.id === cur)) sel.value = cur;
}
$("#planForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!CLOUD || !token) { toast("Sign in first to make an AI study plan (it's free)"); authTab = "login"; openAuth(); return; }
  const ex = state.exams.find((x) => x.id === $("#planExam").value);
  if (!ex) return toast("Add an exam with its date first");
  const only = $("#planScope").value === "subject", chapters = [];
  bookSubjects().filter((s) => !only || s === ex.subject).forEach((s) => {
    const b = bookOf(s);
    b.chapters.forEach((name, i) => {
      const n = b.start + i, pr = state.syl[sylKey(s, n)] || {};
      if (!pr.v) chapters.push({ subject: s, n, name, status: pr.r ? "read" : "unread" });
    });
  });
  const btn = $("#planBtn");
  btn.disabled = true;
  $("#planOut").innerHTML = '<p class="muted plan-wait"><span class="dots"><i></i><i></i><i></i></span> Making your plan. This can take up to a minute…</p>';
  try {
    lastPlan = await api("/api/plan", {
      method: "POST",
      body: JSON.stringify({
        exam: ex.title, exam_date: dayKey(new Date(ex.date)), hours: +$("#planHours").value || 3, target: $("#planTarget").value,
        level: levelText(), language: typeof buddyLang === "string" ? buddyLang : "en", chapters,
      }),
    });
    renderPlan();
  } catch (err) {
    $("#planOut").innerHTML = `<p class="auth-error">${esc(err.message)}</p>`;
  } finally {
    btn.disabled = false;
  }
});
function renderPlan() {
  const p = lastPlan, count = p.days.reduce((a, d) => a + d.items.length, 0);
  const label = (iso) => new Date(iso + "T00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  $("#planOut").innerHTML = `
    ${p.tips.length ? `<ul class="plan-tips">${p.tips.map((t) => `<li>💡 ${esc(t)}</li>`).join("")}</ul>` : ""}
    <div class="plan-days">${p.days.map((d) => `<div class="plan-day"><b>${label(d.date)}</b><ul>${d.items.map((it) => {
      const s = subj(it.subject);
      return `<li style="--c:${s.color}"><span class="dot"></span><span>${esc(s.name)}${it.chapter ? ` · Ch ${it.chapter}` : ""}: ${esc(it.task)}</span><small>${it.minutes} min</small></li>`;
    }).join("")}</ul></div>`).join("")}</div>
    <button class="btn btn-primary" id="planAdd" type="button"><svg><use href="#i-plus"/></svg>Add ${count} tasks to my planner</button>`;
  if (A) gsap.from("#planOut .plan-day", { y: 20, opacity: 0, stagger: 0.04, duration: 0.6, ease: "expo.out" });
}
$("#planOut").addEventListener("click", (e) => {
  if (!e.target.closest("#planAdd") || !lastPlan) return;
  lastPlan.days.forEach((d) => d.items.forEach((it) => state.tasks.push({
    id: uid(), text: `${it.chapter ? `Ch ${it.chapter}: ` : ""}${it.task} (${it.minutes} min)`, subject: it.subject, due: d.date, priority: 1, done: false,
  })));
  save(); renderTasks(); renderStats();
  e.target.closest("#planAdd").disabled = true;
  e.target.closest("#planAdd").lastChild.textContent = "Added to Tasks ✓";
  toast("Your plan is in Tasks, each on its day");
  confetti(...centerOf(e.target.closest("#planAdd")), 60);
});

// ---------- Leaderboard ----------
function fmtMins(m) { return (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`); }
async function loadBoard() {
  const box = $("#boardList");
  $("#boardJoin").checked = !!state.settings.board;
  $("#boardCity").value = state.settings.city || "";
  if (!CLOUD) { box.innerHTML = '<li class="muted">The leaderboard needs the Study with Ahmad server.</li>'; return; }
  const scope = $("#boardScope").value, q = new URLSearchParams();
  if (scope === "class" && state.profile) q.set("cls", state.profile.cls);
  if (scope === "city") { if (!state.settings.city) { box.innerHTML = '<li class="muted">Type your city above to see students near you.</li>'; return; } q.set("city", state.settings.city); }
  try {
    const res = await api("/api/leaderboard?" + q);
    const row = (b) => `<li class="${b.me ? "me" : ""}"><span class="rank">${["🥇", "🥈", "🥉"][b.rank - 1] || b.rank}</span><span class="who"><b>${esc(b.username)}</b><small>${b.cls ? `Class ${esc(b.cls)}` : ""}${b.city ? ` · ${esc(b.city)}` : ""}</small></span><span class="mins">${fmtMins(b.minutes)}</span></li>`;
    box.innerHTML = res.top.length ? res.top.map(row).join("") + (res.me && res.me.rank > res.top.length ? `<li class="gap">…</li>${row(res.me)}` : "") : '<li class="muted">Nobody here yet this week. Switch it on and be the first!</li>';
  } catch (err) { box.innerHTML = `<li class="muted">${esc(err.message)}</li>`; }
}
async function saveBoardSettings() {
  save();
  clearTimeout(syncTimer);
  await pushState();
  loadBoard();
}
$("#boardJoin").addEventListener("change", (e) => {
  if (!CLOUD || !token) { e.target.checked = false; toast("Sign in first to join the leaderboard"); authTab = "login"; openAuth(); return; }
  state.settings.board = e.target.checked;
  saveBoardSettings();
  toast(e.target.checked ? "You're on the leaderboard. Focus sessions now count!" : "You're off the leaderboard");
});
$("#boardCity").addEventListener("change", (e) => {
  state.settings.city = e.target.value.trim().slice(0, 30);
  if (token) saveBoardSettings(); else save();
});
$("#boardScope").addEventListener("change", loadBoard);
window.ScrollTrigger && A ? ScrollTrigger.create({ trigger: ".board-panel", start: "top 95%", onEnter: loadBoard }) : loadBoard();

// ---------- Entry tests (MDCAT / ECAT) ----------
// function declarations: renderAll() runs near the top of the file, before this section
function ent() { return (state.entry ||= { test: "mdcat", dates: {} }); } // older and cloud planners have no entry-test data yet
function etParts() { return ENTRY_TESTS[ent().test].parts; }
function etInfo(p) { return p.subject ? { name: SUBJECT_INFO[p.subject].name, color: SUBJECT_INFO[p.subject].color } : { name: p.label, color: p.color }; }
function etChapters(s) {
  return [11, 12].flatMap((cls) => {
    const b = SYLLABUS[cls][s];
    return b ? b.chapters.map((name, i) => ({ cls, n: b.start + i, name, key: `${boardKey()}${cls}-${s}-${b.start + i}` })) : [];
  });
}
function renderEntry() {
  const t = ENTRY_TESTS[ent().test];
  $("#etTabs").innerHTML = Object.entries(ENTRY_TESTS).map(([k, x]) => `<button data-et="${k}" class="${k === ent().test ? "active" : ""}">${x.name}</button>`).join("");
  $("#etName").textContent = `${t.name} · ${t.by}`;
  $("#etMeta").textContent = `${t.for} · ${t.mcqs} MCQs in ${t.minutes} minutes · ${t.marking} · ${t.note}`;
  $("#etMock").lastChild.textContent = `${t.minutes}-minute mock timer`;
  const date = ent().dates[ent().test] || "";
  $("#etDate").value = date;
  const days = date ? Math.ceil((new Date(date + "T09:00") - Date.now()) / 864e5) : null;
  $("#etCount").innerHTML = days === null ? '<span class="muted small">Add your test date</span>' : days >= 0 ? `<b>${days}</b><span>days left</span>` : '<span class="muted small">Test date has passed</span>';
  const total = t.parts.reduce((a, p) => a + p.mcqs, 0), amount = (p) => (t.unit === "%" ? `${p.mcqs}%` : `${p.mcqs} MCQs`);
  $("#etBlueprint").innerHTML = t.parts.map((p) => { const i = etInfo(p); return `<i style="flex:${p.mcqs};background:${i.color}" title="${esc(i.name)}: ${amount(p)}"><span>${esc(i.name)} ${t.unit === "%" ? amount(p) : p.mcqs}</span></i>`; }).join("");
  $("#etGrid").innerHTML = t.parts.map((p, pi) => {
    const i = etInfo(p), chs = p.subject ? etChapters(p.subject) : [];
    const read = chs.filter((c) => state.syl[c.key]?.r).length;
    return `<article class="panel et-card" style="--c:${i.color}" data-part="${pi}">
      <div class="et-head"><h4>${esc(i.name)}</h4><span class="tag">${t.unit === "%" ? `${p.mcqs}% of the paper` : `${p.mcqs} MCQs · ${Math.round((p.mcqs / total) * 100)}%`}</span></div>
      ${chs.length ? `<div class="sb-track"><i style="--c:${i.color};transform:scaleX(${read / chs.length})"></i></div><p class="muted small">${read} of ${chs.length} FSc chapters read (Part 1 + Part 2)</p>` : `<p class="muted small">No textbook chapters: practise ${esc(p.topic)}.</p>`}
      <div class="et-actions">${chs.length ? '<button class="btn btn-soft" data-et-open>Chapters</button>' : ""}<button class="btn btn-primary" data-et-practice><svg><use href="#i-spark"/></svg>Practice 10 MCQs</button></div>
      ${chs.length ? `<ul class="et-chapters" hidden>${chs.map((c) => `<li data-key="${c.key}" class="${state.syl[c.key]?.r ? "on" : ""}"><button class="toggle read ${state.syl[c.key]?.r ? "on" : ""}" data-et-read><svg><use href="#i-check"/></svg></button><span>${c.cls === 11 ? "Part 1" : "Part 2"} · Ch ${c.n}: ${esc(c.name)}</span><button class="link-btn" data-et-ch="${esc(c.name)}">MCQs</button></li>`).join("")}</ul>` : ""}
    </article>`;
  }).join("");
  $("#etSource").innerHTML = `Pattern from the <a href="${t.source.url}" target="_blank" rel="noopener">${esc(t.source.label)}</a>. Boards change it from year to year, so check the latest notice before your test.`;
  refreshTriggers();
}
$("#etTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-et]"); if (b) { ent().test = b.dataset.et; save(); renderEntry(); } });
$("#etDate").addEventListener("change", (e) => { ent().dates[ent().test] = e.target.value; save(); renderEntry(); });
$("#etMock").onclick = () => {
  state.settings.exam = ENTRY_TESTS[ent().test].minutes;
  save();
  setMode("exam");
  $('a[href="#focus"]').click();
  toast(`${ENTRY_TESTS[ent().test].minutes}-minute mock timer ready. Press start when you begin`);
};
function practice(topic) {
  const t = ENTRY_TESTS[ent().test];
  $('a[href="#buddy"]').click();
  askBuddy(`Make 10 ${t.name}-style MCQs (4 options each) on ${topic}, at entry-test level. Put the answers with a one-line reason at the end.`);
}
$("#etGrid").addEventListener("click", (e) => {
  const card = e.target.closest(".et-card");
  if (!card) return;
  const p = etParts()[+card.dataset.part], info = etInfo(p);
  if (e.target.closest("[data-et-open]")) { const ul = $(".et-chapters", card); ul.hidden = !ul.hidden; refreshTriggers(); return; }
  if (e.target.closest("[data-et-practice]")) return practice(p.subject ? `FSc ${info.name} (Part 1 and Part 2)` : p.topic);
  const ch = e.target.closest("[data-et-ch]");
  if (ch) return practice(`${info.name}: ${ch.dataset.etCh}`);
  const tog = e.target.closest("[data-et-read]");
  if (tog) {
    const li = tog.closest("li"), pr = state.syl[li.dataset.key] || {};
    pr.r = !pr.r;
    if (pr.r && !pr.rAt) pr.rAt = dayKey();
    state.syl[li.dataset.key] = pr;
    save();
    li.classList.toggle("on", pr.r); tog.classList.toggle("on", pr.r);
    const chs = etChapters(p.subject), read = chs.filter((c) => state.syl[c.key]?.r).length;
    $(".sb-track i", card).style.transform = `scaleX(${read / chs.length})`;
    $("p.muted", card).textContent = `${read} of ${chs.length} FSc chapters read (Part 1 + Part 2)`;
    if (pr.r) confetti(...centerOf(tog), 18);
    if (state.profile && sylSubject) renderChapters();
  }
});
renderEntry();

// ---------- Study rooms: see who else is focusing right now ----------
function roomOptions() {
  return [...(state.profile ? [[`class-${state.profile.cls}`, `Class ${state.profile.cls}`]] : []), ["mdcat", "MDCAT prep"], ["ecat", "ECAT prep"], ["all", "Everyone"]];
}
function renderRoomPick() {
  const opts = roomOptions(), cur = state.settings.room && opts.some(([k]) => k === state.settings.room) ? state.settings.room : opts[0][0];
  $("#roomPick").innerHTML = opts.map(([k, n]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${n}</option>`).join("");
  $("#roomOn").checked = !!state.settings.roomOn;
}
async function loadRoom(data) {
  if (!CLOUD) { $("#roomList").innerHTML = '<li class="muted">Study rooms need the Study with Ahmad server.</li>'; return; }
  try {
    const res = data || (await api(`/api/room?room=${$("#roomPick").value}`));
    $("#roomCount").textContent = `${res.people.length} focusing now`;
    $("#roomList").innerHTML = res.people.length
      ? res.people.map((p) => `<li class="${p.me ? "me" : ""}"><span class="live-dot"></span><b>${esc(p.username)}</b><span>${esc(p.subject || "studying")}</span><small>${p.left} min left</small></li>`).join("")
      : '<li class="muted">Nobody is focusing in this room right now. Start a session and be the first!</li>';
  } catch (err) { $("#roomList").innerHTML = `<li class="muted">${esc(err.message)}</li>`; }
}
async function joinRoom() {
  if (!CLOUD || !token || !state.settings.roomOn || !["focus", "exam"].includes(mode)) return;
  try {
    const res = await api("/api/room/join", { method: "POST", body: JSON.stringify({ room: $("#roomPick").value, subject: subj($("#focusSubject").value).name, minutes: Math.ceil(remaining / 60) }) });
    inRoom = true;
    loadRoom(res);
  } catch (err) {}
}
function leaveRoom() {
  if (!inRoom || !token) return;
  inRoom = false;
  fetch("/api/room/leave", { method: "POST", keepalive: true, headers: { Authorization: "Bearer " + token } }).then(() => loadRoom()).catch(() => {});
}
addEventListener("pagehide", leaveRoom);
$("#roomPick").addEventListener("change", () => { state.settings.room = $("#roomPick").value; save(); if (running) joinRoom(); else loadRoom(); });
$("#roomOn").addEventListener("change", (e) => {
  if (!CLOUD || !token) { e.target.checked = false; toast("Sign in first to join a study room"); authTab = "login"; openAuth(); return; }
  state.settings.roomOn = e.target.checked;
  save();
  if (e.target.checked) { if (running) joinRoom(); toast("When your timer runs, others in the room will see you studying"); } else leaveRoom();
});
renderRoomPick();
loadRoom();
setInterval(() => { if (document.visibilityState === "visible") loadRoom(); }, 30000);

// ---------- Formula solver ----------
// if solver.js failed to load (e.g. not cached yet offline), hide the solver instead of breaking the rest of the page
const SOLVER_OK = typeof SOLVER !== "undefined";
let solverId = SOLVER_OK ? SOLVER[0].id : null;
function renderSolver() {
  const f = SOLVER.find((x) => x.id === solverId);
  $("#solverPick").innerHTML = ["Physics", "Maths"].map((g) => `<optgroup label="${g}">${SOLVER.filter((x) => x.group === g).map((x) => `<option value="${x.id}" ${x.id === solverId ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</optgroup>`).join("");
  $("#solverFormula").textContent = f.formula;
  $("#solverHint").textContent = f.solve ? "Fill in all boxes except the one you want to find." : "Fill in every box.";
  $("#solverFields").innerHTML = Object.entries(f.vars).map(([k, [label, unit]]) => `<label>${esc(label)}${unit ? ` <small>(${esc(unit)})</small>` : ""}<input class="input" type="number" step="any" data-var="${k}" value="${f.defaults?.[k] ?? ""}" /></label>`).join("");
  $("#solverOut").innerHTML = "";
}
$("#solverPick").addEventListener("change", (e) => { solverId = e.target.value; renderSolver(); });
$("#solverForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = SOLVER.find((x) => x.id === solverId), v = {}, empty = [];
  $$("#solverFields input").forEach((i) => (i.value.trim() === "" ? empty.push(i.dataset.var) : (v[i.dataset.var] = +i.value)));
  const unit = (k) => f.vars[k][1], show = (n, u) => `${fmtNum(n)}${u ? " " + u : ""}`;
  const given = Object.entries(v).map(([k, n]) => `${f.vars[k][0]} = ${show(n, unit(k))}`).join(", ");
  let html;
  if (f.solve) {
    if (empty.length !== 1) { $("#solverOut").innerHTML = '<p class="auth-error">Leave exactly one box empty: the one you want to find.</p>'; return; }
    const k = empty[0];
    if (!f.solve[k]) { $("#solverOut").innerHTML = `<p class="auth-error">This solver can't find ${esc(f.vars[k][0])} from this formula. Try another box.</p>`; return; }
    const [val, work] = f.solve[k](v);
    if (typeof val === "number" && !isFinite(val)) { $("#solverOut").innerHTML = '<p class="auth-error">No real answer for these values. Check for a 0 or a negative under a square root.</p>'; return; }
    html = `<ol class="steps"><li><b>Given:</b> ${esc(given)}</li><li><b>Formula:</b> ${esc(f.formula)}</li><li><b>Put in the values:</b> ${esc(work)}</li></ol>
      <p class="solver-answer">${esc(f.vars[k][0])} = <b>${esc(show(val, unit(k)))}</b></p>`;
  } else {
    if (empty.length) { $("#solverOut").innerHTML = '<p class="auth-error">Fill in every box.</p>'; return; }
    html = `<ol class="steps"><li><b>Given:</b> ${esc(given)}</li><li><b>Formula:</b> ${esc(f.formula)}</li>${f.results(v).map(([name, val, u, work]) => `<li>${esc(work)} → <b>${esc(name)} = ${esc(show(val, u))}</b></li>`).join("")}</ol>`;
  }
  $("#solverOut").innerHTML = html + '<button class="btn btn-soft" id="solverExplain" type="button"><svg><use href="#i-spark"/></svg>Explain with Study Buddy</button>';
  if (A) gsap.from("#solverOut .steps li, #solverOut .solver-answer", { x: -20, opacity: 0, stagger: 0.08, duration: 0.5, ease: "expo.out" });
});
$("#solverOut").addEventListener("click", (e) => {
  if (!e.target.closest("#solverExplain")) return;
  const f = SOLVER.find((x) => x.id === solverId);
  askBuddy(`Explain this ${f.name} numerical step by step, like a teacher: ${$("#solverOut .steps").innerText.replace(/\n+/g, "; ")}`);
  $("#buddyChat").scrollIntoView({ behavior: "smooth", block: "center" });
});
if (SOLVER_OK) renderSolver(); else $("#solver").hidden = true;

// Back online: send anything saved while offline
addEventListener("online", () => { if (token && isDirty()) { setSync("saving"); pushState(); } });

// ---------- Offline banner (load shedding / no internet) ----------
function showNet() { $("#netBanner").hidden = navigator.onLine; }
addEventListener("offline", () => { showNet(); toast("Offline: your planner keeps working and saving on this device"); });
addEventListener("online", () => { showNet(); toast("Back online" + (token ? ", syncing your planner" : "")); });
showNet();

// ---------- Speak your question (Web Speech API) ----------
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null;
if (!SpeechRec) $("#buddyMic").hidden = true;
$("#buddyMic").onclick = () => {
  if (recog) { recog.stop(); return; }
  recog = new SpeechRec();
  recog.lang = buddyLang === "en" ? "en-PK" : "ur-PK";
  recog.interimResults = true;
  recog.onresult = (e) => { $("#buddyInput").value = [...e.results].map((r) => r[0].transcript).join(""); };
  recog.onerror = (e) => toast(e.error === "not-allowed" ? "Allow the microphone to speak your question" : "Couldn't hear that, please try again");
  recog.onend = () => { recog = null; $("#buddyMic").classList.remove("on"); if ($("#buddyInput").value.trim()) { $("#buddyInput").focus(); toast("Check the words, then press Ask"); } };
  recog.start();
  $("#buddyMic").classList.add("on");
  toast(buddyLang === "en" ? "Listening… speak your question" : "Sun raha hoon… apna sawal bolein");
};

// ---------- Photo of a question (shrunk on the phone before sending) ----------
let pendingPhoto = "";
async function shrinkPhoto(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * scale), height: Math.round(img.height * scale) });
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}
function clearPhoto() { pendingPhoto = ""; $("#photoChip").hidden = true; }
$("#photoFile").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    pendingPhoto = await shrinkPhoto(f);
    $("#photoThumb").src = pendingPhoto;
    $("#photoChip").hidden = false;
    $("#buddyInput").focus();
  } catch (err) { toast("That photo couldn't be opened. Try another one"); }
});
$("#photoClear").onclick = clearPhoto;

// ---------- Namaz times (AlAdhan, Karachi method, Hanafi Asr) ----------
const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const addMins = (hm, m) => { const t = +hm.slice(0, 2) * 60 + +hm.slice(3, 5) + m; return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`; };
if (state.settings.namazCity) $("#namazCity").value = state.settings.namazCity;
$("#namazBtn").onclick = async () => {
  const city = $("#namazCity").value, btn = $("#namazBtn");
  btn.disabled = true;
  try {
    const res = await fetch(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=Pakistan&method=1&school=1`);
    const t = (await res.json()).data.timings;
    state.blocks = state.blocks.filter((b) => !b.namaz);
    for (let d = 0; d < 7; d++) PRAYERS.forEach((p) => {
      const start = String(t[p]).slice(0, 5), jummah = d === 4 && p === "Dhuhr";
      state.blocks.push({ id: uid(), day: d, start, end: addMins(start, jummah ? 45 : 15), subject: "tarjama", title: jummah ? "Jummah namaz" : `${p} namaz`, namaz: true });
    });
    state.settings.namazCity = city;
    save(); renderBlocks(true);
    toast(`Namaz times for ${city} added to every day. Refresh them once a month`);
  } catch (err) { toast("Couldn't get namaz times. Check the internet and try again"); }
  finally { btn.disabled = false; }
};
function todaysNamaz() { const d = jsDayToIdx(new Date().getDay()); return state.blocks.filter((b) => b.namaz && b.day === d); }
function namazHeadsUp() {
  if (mode !== "focus" && mode !== "exam") return;
  const now = new Date(), hm = now.toTimeString().slice(0, 5), until = addMins(hm, Math.ceil(remaining / 60));
  const p = todaysNamaz().find((b) => b.start > hm && b.start <= until);
  if (p) toast(`🕌 ${p.title.replace(" namaz", "")} is at ${p.start}, during this session. Take a break then`);
}
let namazToldAt = "";
setInterval(() => {
  const hm = new Date().toTimeString().slice(0, 5), p = todaysNamaz().find((b) => b.start === hm);
  if (!p || namazToldAt === hm) return;
  namazToldAt = hm;
  toast(`🕌 ${p.title.replace(" namaz", "")} ka waqt. ${running ? "Pause the timer and take a break" : "Time for namaz"}`);
  chime();
}, 20000);

// ---------- Mistake notebook + weak chapters ----------
function mistakes() { return (state.mistakes ||= []); }
function addMistake(m) {
  const list = mistakes(), old = m.ref && list.find((x) => x.ref === m.ref);
  if (old) { old.count++; old.at = dayKey(); } else list.unshift({ id: uid(), count: 1, at: dayKey(), ...m });
  save(); renderMistakes();
}
function weakChapters() {
  const today = new Date(), out = [];
  if (!state.profile) return out;
  bookSubjects().forEach((s) => {
    const b = bookOf(s);
    b.chapters.forEach((name, i) => {
      const n = b.start + i, pr = state.syl[sylKey(s, n)];
      const last = pr && pr.r && (pr.vAt || pr.rAt);
      if (!last) return;
      const days = Math.round((today - new Date(last + "T00:00")) / 864e5);
      if (days >= 14) out.push({ s, n, name, days, why: pr.v ? `last revised ${days} days ago` : `read ${days} days ago, never revised` });
    });
  });
  return out.sort((a, b) => b.days - a.days).slice(0, 3);
}
function renderMistakes() {
  const list = mistakes(), weak = weakChapters();
  const misses = {};
  list.filter((m) => m.kind === "card").forEach((m) => (misses[m.subject] = (misses[m.subject] || 0) + m.count));
  const worst = Object.entries(misses).sort((a, b) => b[1] - a[1])[0];
  $("#weakBox").innerHTML = weak.length || worst
    ? `<b>Weak spots</b><ul>${weak.map((w) => `<li style="--c:${SUBJECT_INFO[w.s].color}"><span class="dot"></span>${esc(SUBJECT_INFO[w.s].name)} Ch ${w.n}: ${esc(w.name)} <small>${w.why}</small></li>`).join("")}${worst && worst[1] >= 3 ? `<li style="--c:${subj(worst[0]).color}"><span class="dot"></span>${esc(subj(worst[0]).name)} flashcards <small>missed ${worst[1]} times</small></li>` : ""}</ul>`
    : "";
  $("#mistakeCount").textContent = `${list.length} saved`;
  $("#mistakeList").innerHTML = list.length
    ? list.slice(0, 50).map((m) => `<li data-id="${m.id}" style="--c:${subj(m.subject).color}"><details><summary><span class="dot"></span><span>${esc(m.text)}</span>${m.count > 1 ? `<em>×${m.count}</em>` : ""}</summary><div class="m-answer">${m.kind === "buddy" ? mdLite(m.answer) : `<p>${esc(m.answer)}</p>`}</div></details><button class="link-btn" data-done>Got it ✓</button></li>`).join("")
    : '<li class="muted">Nothing here yet. Press "Again" on a flashcard you missed, or save a Study Buddy answer.</li>';
  $("#mistakePractice").hidden = !list.length;
}
$("#mistakeList").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-id]");
  if (!li || !e.target.closest("[data-done]")) return;
  state.mistakes = mistakes().filter((m) => m.id !== li.dataset.id);
  save(); renderMistakes();
  toast("Removed from your mistake notebook");
});
$("#buddyChat").addEventListener("click", (e) => {
  const b = e.target.closest("[data-save]");
  if (!b) return;
  const a = answerOf.get(b.closest(".msg"));
  if (!a) return;
  addMistake({ kind: "buddy", subject: a.subject || "", text: a.question.slice(0, 200), answer: a.answer.slice(0, 1500) });
  b.disabled = true; b.textContent = "📒 Saved";
});
$("#mistakePractice").onclick = () => {
  const items = mistakes().slice(0, 8).map((m, i) => `${i + 1}) ${m.text}`).join("\n");
  $('a[href="#buddy"]').click();
  askBuddy(`I keep getting these wrong. Quiz me on them one at a time, wait for my answer, then explain:\n${items}`);
};
renderMistakes();

// ---------- Weekly report (opens by itself on Sundays) ----------
function weekStats(back) {
  const mon = addDays(new Date(), -jsDayToIdx(new Date().getDay()) - 7 * back), keys = new Set(Array.from({ length: 7 }, (_, i) => dayKey(addDays(mon, i))));
  const ses = state.sessions.filter((x) => keys.has(x.date) && !x.sample);
  const syl = Object.values(state.syl);
  return {
    from: mon, mins: ses.reduce((a, x) => a + x.min, 0), sessions: ses.length,
    tasks: state.tasks.filter((t) => t.doneAt && keys.has(t.doneAt)).length,
    read: syl.filter((p) => p.rAt && keys.has(p.rAt)).length, revised: syl.filter((p) => p.vAt && keys.has(p.vAt)).length,
  };
}
function reportText() {
  const w = weekStats(0), last = weekStats(1), left = state.tasks.filter((t) => !t.done).length, ne = nextExam(), weak = weakChapters();
  const range = `${w.from.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${addDays(w.from, 6).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  const lines = [
    `📚 Study with Ahmad · weekly report (${range})${username ? ` · ${username}` : ""}`,
    `⏱ Focused ${fmtMins(w.mins)} in ${w.sessions} sessions (last week ${fmtMins(last.mins)})`,
    `✅ ${w.tasks} tasks done, ${left} still to do`,
    `📖 ${w.read} chapters read, ${w.revised} revised`,
    ne ? `🎯 Next exam: ${ne.title} in ${Math.max(0, Math.ceil((new Date(ne.date) - Date.now()) / 864e5))} days` : "",
    weak.length ? `⚠ Revise next: ${weak.map((x) => `${SUBJECT_INFO[x.s].name} Ch ${x.n}`).join(", ")}` : "",
    `Next week: ${reviewsDue().length} revisions due and ${state.tasks.filter((t) => !t.done && t.due && t.due <= dayKey(addDays(new Date(), 7))).length} tasks to finish.`,
  ].filter(Boolean);
  return { range, lines, w, last };
}
function openReport() {
  const r = reportText(), up = r.w.mins - r.last.mins;
  $("#reportRange").textContent = r.range;
  $("#reportBody").innerHTML = `<div class="report-stats">
      <div><b>${fmtMins(r.w.mins)}</b><span>focused ${up >= 0 ? `<em class="up">▲ ${fmtMins(up)}</em>` : `<em class="down">▼ ${fmtMins(-up)}</em>`}</span></div>
      <div><b>${r.w.tasks}</b><span>tasks done</span></div>
      <div><b>${r.w.read}</b><span>chapters read</span></div>
      <div><b>${r.w.revised}</b><span>revised</span></div>
    </div><ul class="report-lines">${r.lines.slice(4).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
  $("#reportShare").href = `https://wa.me/?text=${encodeURIComponent(r.lines.join("\n"))}`;
  openDlg("#reportDlg");
}
function openDlg(sel) { $(sel).classList.add("open"); $(sel).setAttribute("aria-hidden", "false"); if (lenis) lenis.stop(); }
function closeDlg(el) { el.classList.remove("open"); el.setAttribute("aria-hidden", "true"); if (lenis) lenis.start(); }
$$("#reportDlg, #feedbackDlg").forEach((d) => d.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeDlg(d); }));
$("#reportBtn").onclick = openReport;
$("#reportCopy").onclick = async () => { try { await navigator.clipboard.writeText(reportText().lines.join("\n")); toast("Report copied"); } catch (e) { toast("Couldn't copy, use Send on WhatsApp instead"); } };
setTimeout(() => {
  if (new Date().getDay() !== 0 || !state.profile || !state.sessions.length) return;
  try { if (localStorage.getItem("swa-report") === dayKey()) return; localStorage.setItem("swa-report", dayKey()); } catch (e) { return; }
  if (!document.querySelector(".setup.open")) openReport();
}, 6000);

// ---------- Feedback ----------
$("#feedbackBtn").onclick = () => { $("#fbError").textContent = ""; openDlg("#feedbackDlg"); setTimeout(() => $("#fbText").focus(), 300); };
$("#feedbackForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#fbSend").disabled = true;
  try {
    await api("/api/feedback", { method: "POST", body: JSON.stringify({ message: $("#fbText").value, contact: $("#fbContact").value, page: root.classList.contains("tabbed") ? "phone" : "desktop" }) });
    $("#fbText").value = $("#fbContact").value = "";
    closeDlg($("#feedbackDlg"));
    toast("Shukriya! Your message has been sent");
  } catch (err) { $("#fbError").textContent = err.message; }
  finally { $("#fbSend").disabled = false; }
});

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
$("#resetHelp").onclick = () => {
  closeAuth();
  $("#feedbackBtn").click();
  $("#fbText").value = `I forgot my password and lost my recovery code. Username: ${$("#resetUser").value.trim()}`;
};
