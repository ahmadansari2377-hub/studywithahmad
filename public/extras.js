// Study with Ahmad — extras: board exam countdown, live numbers, full-screen focus, voice answers,
// guided tour and presentation mode. Loaded after study.js and uses its globals ($, state, toast, showTab…).
// Everything sits inside this function so no name here can clash with one in study.js.
(() => {
  const PRESENT = /[?&]present\b/.test(location.search);
  const isTabbed = () => root.classList.contains("tabbed");
  const two = (n) => String(n).padStart(2, "0");

  // =====================================================================
  //  Board exam countdown (hero)
  // =====================================================================
  // Board dates move a little every year, so these are only starting guesses; the student sets the real one.
  function estimatedBoardDate() {
    const p = state.profile, fb = p.board === "fbise", matric = p.cls <= 10;
    const [m, d] = matric ? (fb ? [3, 15] : [2, 1]) : fb ? [3, 25] : [3, 20]; // month is 0-based
    const now = new Date();
    let x = new Date(now.getFullYear(), m, d, 8, 30);
    if (x < now) x = new Date(now.getFullYear() + 1, m, d, 8, 30);
    return x;
  }
  function boardDate() {
    const set = state.settings.boardDate;
    return set ? new Date(set + "T08:30") : estimatedBoardDate();
  }
  const dateKey = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
  function syllabusLeft() {
    let read = 0, total = 0;
    bookSubjects().forEach((s) => { const p = bookProgress(s); read += p.read; total += p.total; });
    return { read, total, left: total - read };
  }
  let lastBc = "", counting = false; // while the entrance count-up runs, the clock leaves those numbers alone
  function tickBoard() {
    const box = $("#boardCount");
    if (!state.profile) { box.hidden = true; return; }
    box.hidden = false;
    const when = boardDate(), diff = Math.max(0, when - Date.now());
    const v = { d: Math.floor(diff / 864e5), h: two(Math.floor(diff / 36e5) % 24), m: two(Math.floor(diff / 6e4) % 60), s: two(Math.floor(diff / 1e3) % 60) };
    Object.entries(v).forEach(([u, val]) => {
      const b = $(`#bcClock b[data-u="${u}"]`);
      if (counting && u === "d") return;
      if (b.textContent !== String(val)) {
        b.textContent = val;
        if (A && u !== "d") gsap.fromTo(b, { yPercent: -40, opacity: 0.3 }, { yPercent: 0, opacity: 1, duration: 0.4, ease: "expo.out" });
      }
    });
    const { read, total, left } = syllabusLeft();
    const key = `${read}/${total}/${v.d}/${state.settings.boardDate || ""}/${state.profile.cls}/${state.profile.board}`;
    if (key === lastBc || counting) return; // the slow-changing parts only need redrawing when something changed
    lastBc = key;
    const lvl = state.profile.cls <= 10 ? "Matric" : "Inter";
    $("#bcTitle").textContent = `Class ${state.profile.cls} ${state.profile.board === "fbise" ? "FBISE" : "Punjab Board"} annual exam · ${when.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`;
    $("#bcEst").textContent = state.settings.boardDate ? "Your date (tap to change)" : `Estimated ${lvl} date — set yours from the date sheet`;
    $("#bcDate").value = dateKey(when);
    const studyDays = Math.max(1, v.d - 30); // keep the last month free for revision
    const pace = left ? Math.ceil((left / studyDays) * 10) / 10 : 0;
    $("#bcLeft").textContent = left;
    $("#bcPace").textContent = pace;
    const pct = total ? Math.round((read / total) * 100) : 0;
    $("#bcPct").textContent = pct + "%";
    $("#bcBar").style.transform = `scaleX(${total ? read / total : 0})`;
    $("#bcTip").textContent = diff === 0 ? "Exam day has passed. Set the date of your next board exam above."
      : !left ? "Every chapter is read. Now it's all revision and past papers. 💪"
      : v.d <= 30 ? `Final month: revise ${Math.ceil(left / Math.max(1, v.d))} chapters a day and do one past paper daily.`
      : pace <= 1 ? `Easy pace: about one chapter every ${Math.max(1, Math.round(1 / pace))} day${Math.round(1 / pace) > 1 ? "s" : ""} keeps you a month ahead.`
      : `Read ${pace} chapters a day and you'll finish by ${addDays(new Date(), studyDays).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, a month before the exam.`;
  }
  $("#bcDate").addEventListener("change", (e) => {
    if (!e.target.value) { delete state.settings.boardDate; }
    else if (new Date(e.target.value + "T08:30") < Date.now()) { toast("Pick a date in the future"); lastBc = ""; tickBoard(); return; }
    else state.settings.boardDate = e.target.value;
    save();
    lastBc = "";
    tickBoard();
    toast("Board exam date saved");
  });
  tickBoard();
  setInterval(tickBoard, 1000);
  // Entrance: the card rises, the four boxes flip up one after another, and the numbers count up from 0
  if (A && "IntersectionObserver" in window) {
    const box = $("#boardCount");
    box.classList.add("bc-wait");
    $("#bcBar").style.transform = "scaleX(0)";
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const days = Math.floor(Math.max(0, boardDate() - Date.now()) / 864e5), { read, total, left } = syllabusLeft();
      counting = true;
      box.classList.remove("bc-wait");
      const o = { d: 0, l: 0, p: 0 }, pct = total ? Math.round((read / total) * 100) : 0;
      gsap.to(o, {
        d: days, l: left, p: pct, duration: 1.8, delay: 0.25, ease: "power3.out",
        onUpdate: () => {
          $('#bcClock b[data-u="d"]').textContent = Math.round(o.d);
          $("#bcLeft").textContent = Math.round(o.l);
          $("#bcPct").textContent = Math.round(o.p) + "%";
        },
        onComplete: () => { counting = false; lastBc = ""; tickBoard(); },
      });
    }, { threshold: 0.25 });
    afterIntro(() => io.observe(box)); // not while the intro curtain still covers it
  }

  // =====================================================================
  //  Live numbers from every student (hero)
  // =====================================================================
  async function loadStats() {
    if (!CLOUD || !navigator.onLine) return;
    try {
      const r = await fetch("/api/stats");
      if (!r.ok) return;
      const d = await r.json();
      const box = $("#liveStats");
      if (!d.students) return;
      const first = box.hidden;
      box.hidden = false;
      $$("#liveStats b[data-k]").forEach((b) => {
        const to = Number(d[b.dataset.k]) || 0, from = Number(b.dataset.v || 0);
        b.dataset.v = to;
        if (A && from !== to) {
          const o = { n: from };
          gsap.to(o, { n: to, duration: first ? 2 : 1, ease: "power2.out", onUpdate: () => (b.textContent = Math.round(o.n).toLocaleString("en-US")) });
        } else b.textContent = to.toLocaleString("en-US");
      });
      if (first && A) gsap.from("#liveStats", { y: 20, opacity: 0, duration: 0.8, ease: "expo.out" });
    } catch (e) { /* offline or server asleep: the strip simply stays hidden */ }
  }
  loadStats();
  setInterval(loadStats, 60000);

  // =====================================================================
  //  Full-screen focus mode
  // =====================================================================
  const zen = $("#zen");
  const ZEN_QUOTES = [
    "Phone face down. Just this one page.",
    "Thori si mehnat roz, bara result saal ke end par.",
    "You don't need to feel like it. Just start.",
    "Every minute here is a mark in the board exam.",
    "Concentrate. The book won't read itself.",
    "Small steps every day beat cramming the night before.",
  ];
  let distractions = 0, awayAt = 0;
  function zenDraw() {
    if (!running && remaining === total()) distractions = 0; // a fresh session starts with a clean count
    if (zen.hidden) return;
    $("#zenTime").textContent = $("#timeText").textContent;
    $("#zenLabel").textContent = $("#timeLabel").textContent;
    $("#zenSubj").textContent = mode === "focus" || mode === "exam" ? subj($("#focusSubject").value).name : "Break time";
    $("#zenBar").style.transform = `scaleX(${1 - remaining / total()})`;
    $("#zenDistract").textContent = distractions ? `👀 Left the timer ${distractions} time${distractions > 1 ? "s" : ""} this session` : running && mode === "focus" ? "No distractions so far. Keep it up!" : "";
    zen.classList.toggle("running", running);
    zen.dataset.mode = mode;
  }
  window.zenDraw = zenDraw;
  function zenOpen() {
    zen.hidden = false;
    $("#zenQuote").textContent = ZEN_QUOTES[Math.floor(Math.random() * ZEN_QUOTES.length)];
    if (lenis) lenis.stop();
    document.body.style.overflow = "hidden";
    if (zen.requestFullscreen) zen.requestFullscreen().catch(() => {});
    zenDraw();
    if (A) gsap.fromTo(zen.children, { y: 30, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.06, duration: 0.9, ease: "expo.out" });
    if (!running && mode === "focus") toast("Press play when you're ready. Leaving the screen gets counted!");
  }
  function zenClose() {
    if (zen.hidden) return;
    zen.hidden = true;
    document.body.style.overflow = "";
    if (lenis) lenis.start();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  $("#zenOpen").onclick = zenOpen;
  $("#zenClose").onclick = zenClose;
  $("#zenPlay").onclick = () => $("#playBtn").click();
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) zenClose(); });
  document.addEventListener("keydown", (e) => {
    if (zen.hidden) return;
    if (e.key === "Escape") zenClose();
    if (e.key === " " && e.target === document.body) { e.preventDefault(); $("#playBtn").click(); }
  });
  // Switching tabs or apps during a focus session is counted, and you get a nudge when you come back
  document.addEventListener("visibilitychange", () => {
    if (!running || mode !== "focus") return;
    if (document.hidden) { distractions++; awayAt = Date.now(); return; }
    const secs = Math.round((Date.now() - awayAt) / 1000);
    if (secs >= 3) toast(`👀 Welcome back! You were away ${secs < 60 ? secs + " s" : Math.round(secs / 60) + " min"}. Phone door rakhein, focus karein.`);
    zenDraw();
  });

  // =====================================================================
  //  Voice: hear the AI tutor's answers, hands-free voice chat
  // =====================================================================
  const TTS = "speechSynthesis" in window;
  let voices = [];
  const loadVoices = () => { voices = TTS ? speechSynthesis.getVoices() : []; };
  if (TTS) { loadVoices(); speechSynthesis.addEventListener?.("voiceschanged", loadVoices); }
  function pickVoice(lang) {
    const want = lang === "ur" ? ["ur"] : lang === "roman" ? ["hi-in", "en-in", "en"] : ["en-gb", "en-us", "en"];
    for (const w of want) {
      const v = voices.find((x) => x.lang.replace("_", "-").toLowerCase().startsWith(w));
      if (v) return v;
    }
    return null;
  }
  // Markdown and symbols sound silly read aloud; long answers go in sentence-sized pieces (Chrome stops after ~15 s otherwise)
  function speechChunks(text) {
    const clean = text.replace(/```[\s\S]*?```/g, " ").replace(/[*_`#>|]/g, " ").replace(/^\s*[-•]\s+/gm, "").replace(/\s*\n+\s*/g, ". ").replace(/\.\s*\./g, ".").replace(/\s{2,}/g, " ").trim();
    const parts = clean.match(/[^.!?۔؟]+[.!?۔؟]*/g) || [clean];
    const out = [];
    parts.forEach((p) => {
      p = p.trim();
      if (!p) return;
      if (out.length && (out[out.length - 1] + " " + p).length < 180) out[out.length - 1] += " " + p;
      else out.push(p);
    });
    return out;
  }
  let speakingBtn = null;
  function stopSpeaking() {
    if (TTS) speechSynthesis.cancel();
    if (speakingBtn) { speakingBtn.textContent = "🔊 Listen"; speakingBtn.classList.remove("on"); speakingBtn = null; }
  }
  function speakText(text, lang, btn) {
    if (!TTS) return toast("This browser can't read text aloud");
    if (speakingBtn === btn) return stopSpeaking();
    stopSpeaking();
    if (!voices.length) loadVoices();
    const voice = pickVoice(lang);
    if (lang === "ur" && !voice) return toast("No Urdu voice on this device. Pick Roman Urdu to hear answers, or add Urdu in text-to-speech settings");
    const chunks = speechChunks(text);
    speakingBtn = btn;
    btn.textContent = "⏹ Stop";
    btn.classList.add("on");
    chunks.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = lang === "ur" ? "ur-PK" : "en-US";
      u.rate = lang === "en" ? 1 : 0.95;
      if (i === chunks.length - 1) u.onend = () => { if (speakingBtn === btn) stopSpeaking(); };
      speechSynthesis.speak(u);
    });
  }
  window.onBuddyAnswer = (el, text) => {
    const lang = buddyLang;
    if (TTS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "msg-save msg-listen";
      b.textContent = "🔊 Listen";
      b.onclick = () => speakText(text, lang, b);
      $(".msg-body", el).append(b);
      if (window.voiceAsked || window.voiceChat) speakText(text, lang, b);
    }
    window.voiceAsked = false;
  };
  window.voiceChat = false;
  $("#voiceChat").onclick = () => {
    window.voiceChat = !window.voiceChat;
    const on = window.voiceChat, btn = $("#voiceChat");
    btn.classList.toggle("on", on);
    btn.setAttribute("aria-pressed", on);
    if (!on) { stopSpeaking(); toast("Voice chat off"); return; }
    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) toast("This browser can't hear speech (try Chrome). Answers will still be read aloud");
    else { toast(buddyLang === "en" ? "Voice chat on: ask your question out loud" : "Voice chat on: apna sawal bolein"); $("#buddyMic").click(); }
  };

  // =====================================================================
  //  "Aaj kya parhun?" — three things to do today, worked out on the device (no AI, no internet needed)
  // =====================================================================
  function go(href) { // same path as clicking a nav link, so phone tabs switch too
    const a = document.createElement("a");
    a.href = href;
    document.body.append(a);
    a.click();
    a.remove();
  }
  function openChapterList(s) {
    sylSubject = s;
    renderSyllabus(true);
    go("#syllabus");
  }
  function focusOn(s) {
    const sel = $("#focusSubject");
    if ([...sel.options].some((o) => o.value === s)) { sel.value = s; sel.dispatchEvent(new Event("change")); }
    go("#focus");
    if (mode !== "focus") setMode("focus");
    if (!running) setTimeout(() => { startTimer(); toast(`25 minutes of ${SUBJECT_INFO[s].name}. Phone door, kitab khol lein! 📖`); }, 1200);
  }
  const chName = (s, n) => { const b = bookOf(s); return b.chapters[n - b.start]; };
  function todayPlan() {
    const items = [], today = dayKey();
    // 1. The revision that is most overdue (spaced repetition)
    const due = reviewsDue();
    if (due.length) {
      const r = due[0], name = SUBJECT_INFO[r.s].name;
      items.push({ icon: "🔁", c: SUBJECT_INFO[r.s].color, t: `Revise ${name} Ch ${r.n}: ${r.name}`,
        why: `You read it ${r.ago} day${r.ago === 1 ? "" : "s"} ago. A quick revision now locks it in${due.length > 1 ? ` (${due.length - 1} more revision${due.length > 2 ? "s" : ""} due)` : ""}.`,
        act: "Open chapters", run: () => openChapterList(r.s) });
    }
    // 2. The next chapter of the book you are furthest behind in, at the board-exam pace
    let best = null;
    bookSubjects().forEach((s) => {
      const b = bookOf(s);
      if (!b?.chapters.length) return;
      const p = bookProgress(s);
      if (p.read >= p.total) return;
      const f = p.read / p.total;
      if (!best || f < best.f) best = { s, f };
    });
    if (best) {
      const b = bookOf(best.s), i = b.chapters.findIndex((_, k) => !(state.syl[sylKey(best.s, b.start + k)] || {}).r), n = b.start + i;
      const { left } = syllabusLeft(), days = Math.max(1, Math.floor((boardDate() - Date.now()) / 864e5) - 30);
      const pace = Math.max(1, Math.ceil(left / days));
      items.push({ icon: "📖", c: SUBJECT_INFO[best.s].color, t: `Read ${SUBJECT_INFO[best.s].name} Ch ${n}: ${chName(best.s, n)}`,
        why: `${SUBJECT_INFO[best.s].name} is your least-covered book (${Math.round(best.f * 100)}% read). To finish a month before the board exam you need about ${pace} chapter${pace > 1 ? "s" : ""} a day.`,
        act: "Start 25-min focus", run: () => focusOn(best.s) });
    }
    // 3. The most urgent task; otherwise the mistake notebook or flashcards
    const t = state.tasks.filter((x) => !x.done && x.due && x.due <= today).sort((a, b) => a.due.localeCompare(b.due) || b.priority - a.priority)[0];
    if (t) items.push({ icon: "✅", c: subj(t.subject).color, t: t.text, why: t.due < today ? "Overdue: get it off your list first." : "Due today.", act: "Open tasks", run: () => go("#tasks") });
    else if ((state.mistakes || []).length) items.push({ icon: "📒", c: "#ff6b57", t: `Go over the ${state.mistakes.length} question${state.mistakes.length > 1 ? "s" : ""} in your mistake notebook`, why: "The easiest marks to win are the ones you lost before.", act: "Open notebook", run: () => go("#mistakes") });
    else items.push({ icon: "🃏", c: "#f2b02f", t: "10 flashcards", why: "Five minutes of quick recall keeps definitions and formulas fresh.", act: "Open flashcards", run: () => go("#flashcards") });
    return items;
  }
  let planItems = [];
  function openToday() {
    if (!state.profile) { toast("Choose your class first"); openSetup(); return; }
    planItems = todayPlan();
    const mins = todaysSessions().reduce((a, x) => a + x.min, 0), goal = state.settings.goal || 120, st = streak();
    $("#tdSum").innerHTML = `${mins >= goal ? "🎯 Daily goal done!" : `⏱ <b>${mins}</b> of ${goal} min studied today`}${st ? ` · 🔥 <b>${st}</b> day streak` : ""}`;
    $("#tdList").innerHTML = planItems.map((x, i) => `<li style="--c:${x.c}">
      <span class="td-ico">${x.icon}</span>
      <div><b>${esc(x.t)}</b><p>${esc(x.why)}</p></div>
      <button class="btn ${i === 0 ? "btn-primary" : "btn-soft"}" data-td="${i}" type="button">${esc(x.act)}</button></li>`).join("");
    openDlg("#todayDlg");
    if (A) gsap.fromTo("#tdList li", { x: 40, opacity: 0 }, { x: 0, opacity: 1, stagger: 0.1, duration: 0.8, delay: 0.15, ease: "expo.out" });
  }
  $("#todayBtn").onclick = openToday;
  $("#tdList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-td]");
    if (!b) return;
    closeDlg($("#todayDlg"));
    planItems[+b.dataset.td].run();
  });
  $$("#todayDlg, #shareDlg").forEach((d) => d.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeDlg(d); }));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $$("#todayDlg.open, #shareDlg.open").forEach(closeDlg); });

  // =====================================================================
  //  Share my progress: a 1080×1920 picture for WhatsApp status / Instagram story
  // =====================================================================
  function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
  async function drawCard() {
    try { await Promise.all(["800 120px 'Bricolage Grotesque'", "700 60px 'Bricolage Grotesque'", "500 40px Inter", "600 40px Inter"].map((f) => document.fonts.load(f))); } catch (e) {}
    const W = 1080, H = 1920, cv = Object.assign(document.createElement("canvas"), { width: W, height: H }), c = cv.getContext("2d");
    const D = "'Bricolage Grotesque', system-ui, sans-serif", S = "Inter, system-ui, sans-serif";
    // Background: night with violet and coral glows
    c.fillStyle = "#0e0c1d"; c.fillRect(0, 0, W, H);
    [[180, 200, 900, "rgba(109,93,252,0.65)"], [1000, 1500, 900, "rgba(255,107,87,0.40)"], [900, 450, 500, "rgba(163,91,255,0.35)"]].forEach(([x, y, r, col]) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, "rgba(14,12,29,0)");
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    });
    // Logo
    const lg = c.createLinearGradient(80, 90, 180, 190); lg.addColorStop(0, "#5b4bf5"); lg.addColorStop(0.55, "#a35bff"); lg.addColorStop(1, "#ff6b57");
    rr(c, 80, 90, 100, 100, 30); c.fillStyle = lg; c.fill();
    c.fillStyle = "#fff"; c.font = `800 56px ${D}`; c.textBaseline = "middle"; c.fillText("📖", 101, 142);
    c.textBaseline = "alphabetic";
    c.fillStyle = "rgba(255,255,255,0.6)"; c.font = `600 30px ${S}`; c.fillText("STUDY WITH", 205, 128);
    c.fillStyle = "#fff"; c.font = `800 52px ${D}`; c.fillText("Ahmad", 205, 182);
    // Who
    const who = (typeof username === "string" && username) || "My";
    c.fillStyle = "#ffd166"; c.font = `600 34px ${S}`; c.fillText("THIS WEEK'S PROGRESS", 80, 330);
    c.fillStyle = "#fff"; c.font = `800 92px ${D}`;
    const title = who === "My" ? "My study week" : `${who}'s week`;
    c.fillText(title.length > 18 ? title.slice(0, 17) + "…" : title, 80, 430);
    c.fillStyle = "rgba(255,255,255,0.7)"; c.font = `500 36px ${S}`;
    c.fillText(`Class ${state.profile.cls} · ${state.profile.board === "fbise" ? "FBISE" : "Punjab Board"} · ${groupOf()?.name || ""}`, 80, 490);
    // Big number: hours this week
    const mins = weekMinutes(), hrs = mins / 60;
    rr(c, 60, 560, 960, 380, 48); c.fillStyle = "rgba(255,255,255,0.07)"; c.fill(); c.strokeStyle = "rgba(255,255,255,0.15)"; c.lineWidth = 2; c.stroke();
    const hg = c.createLinearGradient(100, 620, 700, 860); hg.addColorStop(0, "#ffffff"); hg.addColorStop(1, "#ffd166");
    c.fillStyle = hg; c.font = `800 230px ${D}`;
    const hTxt = hrs >= 10 ? String(Math.round(hrs)) : hrs.toFixed(1).replace(/\.0$/, "");
    c.fillText(hTxt, 100, 820);
    const hw = c.measureText(hTxt).width;
    c.fillStyle = "#fff"; c.font = `800 90px ${D}`; c.fillText("hrs", 120 + hw, 820);
    c.fillStyle = "rgba(255,255,255,0.75)"; c.font = `500 38px ${S}`; c.fillText(`focused this week · ${Math.min(100, Math.round((mins / 600) * 100))}% of the 10-hour challenge`, 100, 895);
    // Four tiles
    const { read, total } = syllabusLeft(), pct = total ? Math.round((read / total) * 100) : 0;
    const days = Math.floor(Math.max(0, boardDate() - Date.now()) / 864e5);
    const tiles = [["🔥", streak(), "day streak"], ["📚", pct + "%", "syllabus read"], ["✅", read, "chapters done"], ["⏳", days, "days to boards"]];
    tiles.forEach(([ico, val, lab], i) => {
      const x = 60 + (i % 2) * 490, y = 980 + Math.floor(i / 2) * 250;
      rr(c, x, y, 470, 220, 40); c.fillStyle = "rgba(255,255,255,0.07)"; c.fill(); c.strokeStyle = "rgba(255,255,255,0.12)"; c.stroke();
      c.font = `500 56px ${S}`; c.fillStyle = "#fff"; c.fillText(ico, x + 36, y + 86);
      c.font = `800 92px ${D}`; c.fillText(String(val), x + 120, y + 100);
      c.fillStyle = "rgba(255,255,255,0.7)"; c.font = `500 34px ${S}`; c.fillText(lab, x + 38, y + 175);
    });
    // Subject bars (up to 5 books, least done last so the strong ones show first)
    const subs = bookSubjects().filter((s) => bookOf(s)?.chapters.length).map((s) => { const p = bookProgress(s); return { n: SUBJECT_INFO[s].name, c: SUBJECT_INFO[s].color, f: p.read / p.total }; })
      .sort((a, b) => b.f - a.f).slice(0, 5);
    c.fillStyle = "#ffd166"; c.font = `600 30px ${S}`; c.fillText("BOOKS", 80, 1525);
    subs.forEach((s, i) => {
      const y = 1570 + i * 54;
      c.fillStyle = "#fff"; c.font = `500 30px ${S}`; c.fillText(s.n.length > 16 ? s.n.slice(0, 15) + "…" : s.n, 80, y + 22);
      rr(c, 380, y, 560, 22, 11); c.fillStyle = "rgba(255,255,255,0.12)"; c.fill();
      if (s.f > 0) { rr(c, 380, y, Math.max(22, 560 * s.f), 22, 11); c.fillStyle = s.c; c.fill(); }
      c.fillStyle = "rgba(255,255,255,0.75)"; c.font = `600 28px ${S}`; c.fillText(Math.round(s.f * 100) + "%", 960, y + 22);
    });
    // Footer
    c.fillStyle = "rgba(255,255,255,0.55)"; c.font = `500 32px ${S}`; c.textAlign = "center";
    c.fillText(`Plan your studies free · ${location.host || "studywithahmad.vercel.app"}`, W / 2, 1870);
    return cv;
  }
  let shareBlob = null, shareUrl = "";
  async function openShare() {
    if (!state.profile) { toast("Choose your class first"); openSetup(); return; }
    const btn = $("#shareBtn");
    btn.disabled = true;
    try {
      const cv = await drawCard();
      shareBlob = await new Promise((res) => cv.toBlob(res, "image/png"));
      if (shareUrl) URL.revokeObjectURL(shareUrl);
      shareUrl = URL.createObjectURL(shareBlob);
      $("#shareImg").src = shareUrl;
      $("#shareSave").href = shareUrl;
      $("#shareSend").hidden = !(navigator.canShare && navigator.canShare({ files: [new File([shareBlob], "progress.png", { type: "image/png" })] }));
      openDlg("#shareDlg");
      if (A) gsap.fromTo("#shareImg", { y: 40, rotate: -3, opacity: 0 }, { y: 0, rotate: 0, opacity: 1, duration: 1, delay: 0.1, ease: "expo.out" });
    } catch (e) { toast("Couldn't make the picture on this device"); }
    finally { btn.disabled = false; }
  }
  $("#shareBtn").onclick = openShare;
  $("#shareSend").onclick = async () => {
    try {
      await navigator.share({ files: [new File([shareBlob], "study-with-ahmad-progress.png", { type: "image/png" })], text: `My study week on Study with Ahmad 📚 ${location.origin}/` });
    } catch (e) { if (e.name !== "AbortError") toast("Sharing didn't work. Use Download instead"); }
  };

  // =====================================================================
  //  Guided tour + presentation mode
  // =====================================================================
  const STEPS = [
    { sec: "hero", sel: "#statGrid", t: "Your day at a glance", d: "Minutes focused, tasks done, your study streak and the next exam. It all updates live as you study." },
    { sec: "hero", sel: "#todayBtn", t: "Aaj kya parhun? One tap, today's plan", d: "The app picks three things for today: the revision that's due, the next chapter of your weakest book at board-exam pace, and your most urgent task. One more tap starts the timer." },
    { sec: "hero", sel: "#boardCount", t: "Board exam countdown", d: "Counts down to the annual board exam and works out how many chapters a day you need to finish a month early, so the last month is pure revision." },
    { sec: "syllabus", sel: "#sylSubjects", t: "Every chapter of your books", d: "Official 2026–27 PTB and FBISE chapter lists for every subject. Tick Read and Revised, and spaced-repetition reminders bring old chapters back before you forget them." },
    { sec: "focus", sel: "#timerCard", t: "Focus timer with study sounds", d: "25-minute Pomodoro sessions, rain and noise sounds, a mock-exam timer, and a full-screen focus mode that notices when you leave to check your phone." },
    { sec: "tasks", sel: "#taskList", t: "Tasks that remember", d: "Homework and revision tasks by subject, due date and priority. Drag to reorder, tick to finish. Due ones show up on the home screen." },
    { sec: "timetable", sel: "#blocks", t: "Weekly timetable + namaz times", d: "School, tuition and self-study blocks for every day, and one tap adds the five prayer times for your city." },
    { sec: "exams", sel: "#planPanel", t: "AI study plan", d: "Add your date sheet and the AI makes a day-by-day plan from the chapters you haven't read yet, at the hours you can actually give." },
    { sec: "exams", sel: "#paperPanel", t: "Practice papers in board pattern", d: "A fresh paper from your chapters with MCQs, short and long questions. MCQs are marked as you answer them." },
    { sec: "flashcards", sel: "#flashcard", t: "Flashcards and mistake notebook", d: "Starter cards for every subject. Snap a photo of a book page and the AI turns it into cards. Every wrong answer lands in your mistake notebook." },
    { sec: "progress-sec", sel: ".report-btns", t: "Share your progress", d: "One tap makes a progress card for WhatsApp status or an Instagram story: hours this week, streak and syllabus done. Friends see it and join in." },
    { sec: "progress-sec", sel: "#predict", t: "Progress, badges and marks predictor", d: "Charts of your week, a study heatmap, 16 badges, a city vs city challenge and a predicted board score from your test results." },
    { sec: "buddy", sel: ".panel.buddy", t: "AI Study Buddy in Urdu & English", d: "Ask by typing, by voice or with a photo of the question. Answers come in English, Roman Urdu or Urdu, and can be read aloud." },
    { sec: "get-app", sel: "#get-app .container", t: "An app for phones and PCs", d: "Install it on Android or Windows. It works offline during load-shedding and syncs between devices when the internet is back." },
  ];
  const SLIDES = {
    title: () => `
      <svg class="logo-svg slide-logo" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="12" fill="url(#lgBrand)" /><path d="M20 15C16.5 12.3 12.2 11.8 8.5 13.1v15.2c3.7-1.3 8-.8 11.5 1.9z" fill="#fff" /><path d="M20 15c3.5-2.7 7.8-3.2 11.5-1.9v15.2c-3.7-1.3-8-.8-11.5 1.9z" fill="#fff" fill-opacity=".8" /><path d="M31 3.2l1.05 2.75 2.75 1.05-2.75 1.05L31 10.8l-1.05-2.75L27.2 7l2.75-1.05z" fill="#ffd166" /></svg>
      <p class="kicker">Presenting</p>
      <h1>Study with <em>Ahmad</em></h1>
      <p class="slide-sub">A free study planner made for Matric and Inter students of Pakistan.</p>
      <div class="slide-chips"><span>📚 PTB + FBISE syllabus</span><span>🤖 AI tutor in Urdu</span><span>📴 Works offline</span><span>📱 Android + Windows</span></div>
      <button class="btn btn-primary slide-go" data-slide-next type="button"><svg><use href="#i-play"/></svg>Start the presentation</button>`,
    problem: () => `
      <p class="kicker">The problem</p>
      <h2>8 books. 1 date sheet. <em>Zero plan.</em></h2>
      <div class="slide-cols">
        <div><b>📖</b><p>Students don't know how much syllabus is left or how much to read each day.</p></div>
        <div><b>📱</b><p>Phones distract, and study apps aren't made for our boards or our language.</p></div>
        <div><b>⚡</b><p>Load-shedding and slow internet break most online tools.</p></div>
      </div>
      <p class="slide-sub">Study with Ahmad puts the whole syllabus, a plan and a tutor in one free app.</p>`,
    end: () => {
      const url = location.origin + "/";
      const live = $("#liveStats").hidden ? "" : `<p class="slide-live">${$$("#liveStats > span:not(.live-tag)").map((s) => s.textContent).join(" · ")}</p>`;
      return `
      <p class="kicker">Try it now</p>
      <h2>Scan, sign up, <em>start studying.</em></h2>
      <div class="slide-qr" id="slideQr"><span class="muted">${esc(url)}</span></div>
      <p class="slide-url">${esc(url.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</p>
      ${live}
      <h3 class="slide-thanks">Shukriya! 🙏</h3>
      <button class="btn btn-soft" data-slide-exit type="button">Explore the app</button>`;
    },
  };
  let T = null; // { items, i, auto, paused, left, raf, timer }
  const STEP_MS = 8000, SLIDE_MS = 9000;
  const tourEl = $("#tour"), hole = $("#tourHole"), tip = $("#tourTip"), slide = $("#slide");

  function place() {
    if (!T) return;
    const it = T.items[T.i];
    if (!it.slide) {
      const el = $(it.sel);
      if (el) {
        const r = el.getBoundingClientRect(), pad = 10;
        const clampY = (y) => Math.min(innerHeight - 6, Math.max(6, y));
        const top = clampY(r.top - pad), bottom = clampY(r.bottom + pad);
        const left = Math.max(6, r.left - pad), right = Math.min(innerWidth - 6, r.right + pad);
        Object.assign(hole.style, { left: left + "px", top: top + "px", width: Math.max(0, right - left) + "px", height: Math.max(0, bottom - top) + "px" });
        const tw = tip.offsetWidth, th = tip.offsetHeight;
        let y = bottom + 14;
        if (y + th > innerHeight - 10) y = top - th - 14 >= 10 ? top - th - 14 : innerHeight - th - 12;
        const x = Math.min(innerWidth - tw - 12, Math.max(12, r.left + r.width / 2 - tw / 2));
        tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      }
    }
    T.raf = requestAnimationFrame(place);
  }
  function scrollTo(el) {
    const y = el.getBoundingClientRect().top;
    const offset = -(isTabbed() ? 70 : 96);
    if (lenis) lenis.scrollTo(el, { offset, duration: 1, force: true });
    else window.scrollTo({ top: scrollY + y + offset, behavior: "smooth" });
  }
  function show(i) {
    if (!T) return;
    if (i < 0) i = 0;
    if (i >= T.items.length) return end(true);
    T.i = i;
    const it = T.items[i];
    T.left = it.slide ? SLIDE_MS : STEP_MS;
    if (it.slide) {
      slide.hidden = false;
      tourEl.hidden = true;
      $("#slideInner").innerHTML = SLIDES[it.slide]();
      if (it.slide === "end") drawQr();
      if (A) gsap.fromTo("#slideInner > *", { y: 40, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.08, duration: 1, ease: "expo.out" });
      return;
    }
    slide.hidden = true;
    tourEl.hidden = false;
    if (isTabbed()) showTab(it.sec);
    const el = $(it.sel);
    if (!el || !el.offsetParent) { // not on this screen (e.g. no class chosen yet): skip it
      if (i === 0) T.dir = 1;
      return show(i + T.dir);
    }
    scrollTo(el);
    // Switching phone tabs resets the scroll position a moment later; if that undid our scroll, do it again
    setTimeout(() => {
      if (!T || T.items[T.i] !== it) return;
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.top > innerHeight * 0.45) scrollTo(el);
    }, 1200);
    const n = T.items.filter((x) => !x.slide), k = n.indexOf(it) + 1;
    $("#tourStep").textContent = `${k} of ${n.length}`;
    $("#tourTitle").textContent = it.t;
    $("#tourText").textContent = it.d;
    $("#tourBack").disabled = i === 0 || T.items[i - 1].slide === "title";
    $("#tourNext").textContent = i === T.items.length - 1 ? "Finish" : T.auto ? (T.paused ? "Resume" : "Next") : "Next";
    if (!T.auto) $("#tourProg").style.transform = `scaleX(${k / n.length})`;
    if (A) gsap.fromTo("#tourTip > *:not(.tour-prog)", { y: 12, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.04, duration: 0.6, ease: "expo.out" });
  }
  function start(items, auto) {
    if (T) end();
    zenClose();
    T = { items, i: 0, auto, paused: false, left: 0, dir: 1 };
    tourEl.classList.toggle("auto", auto);
    document.addEventListener("keydown", onKey);
    T.raf = requestAnimationFrame(place);
    if (auto) T.timer = setInterval(() => {
      if (!T || T.paused || T.items[T.i].slide === "title" || T.items[T.i].slide === "end") return;
      T.left -= 100;
      const it = T.items[T.i], f = 1 - T.left / (it.slide ? SLIDE_MS : STEP_MS);
      $("#tourProg").style.transform = `scaleX(${Math.min(1, f)})`;
      if (T.left <= 0) next();
    }, 100);
    show(0);
  }
  function next() { if (T) { T.dir = 1; show(T.i + 1); } }
  function back() { if (T) { T.dir = -1; show(T.i - 1); } }
  function end(finished) {
    if (!T) return;
    cancelAnimationFrame(T.raf);
    clearInterval(T.timer);
    const wasAuto = T.auto;
    T = null;
    tourEl.hidden = true;
    slide.hidden = true;
    document.removeEventListener("keydown", onKey);
    try { sessionStorage.setItem("swa-toured", "1"); } catch (e) {}
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (finished && !wasAuto) { toast("That's the tour! Now pick a chapter and start studying 🚀"); confetti(innerWidth / 2, innerHeight / 3, 120); }
  }
  function onKey(e) {
    if (!T) return;
    if (e.key === "Escape") { e.preventDefault(); end(); }
    else if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === "Enter" && e.target === document.body)) { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); back(); }
    else if (e.key === " " && T.auto) { e.preventDefault(); togglePause(); }
  }
  function togglePause() {
    if (!T) return;
    T.paused = !T.paused;
    toast(T.paused ? "Paused · press Space to continue" : "Playing");
    if (!T.items[T.i].slide) $("#tourNext").textContent = T.paused ? "Resume" : "Next";
  }
  $("#tourNext").onclick = () => (T && T.auto && T.paused ? togglePause() : next());
  $("#tourBack").onclick = back;
  $("#tourSkip").onclick = () => end();
  slide.addEventListener("click", (e) => {
    if (e.target.closest("[data-slide-next]")) {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      next();
    } else if (e.target.closest("[data-slide-exit]")) end(true);
  });
  addEventListener("resize", () => { if (T && !T.items[T.i].slide) { const el = $(T.items[T.i].sel); if (el) scrollTo(el); } });

  function drawQr() {
    const url = location.origin + "/";
    const paint = () => {
      const box = $("#slideQr");
      if (!box || !window.qrcode) return;
      const q = qrcode(0, "M");
      q.addData(url);
      q.make();
      box.innerHTML = q.createSvgTag(6, 2);
    };
    if (window.qrcode) return paint();
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
    s.onload = paint;
    document.head.append(s);
  }

  const startTour = () => {
    if (!state.profile) { toast("Choose your class first, then take the tour"); openSetup(); return; }
    start(STEPS, false);
  };
  window.startTour = startTour;
  $("#tourBtn").onclick = startTour;
  $("#tourFooter").onclick = startTour;

  // Wait for the intro animation to finish before starting anything on top of it
  function afterIntro(fn) {
    const t0 = Date.now();
    const wait = () => {
      const l = $("#loader");
      if ((!l || getComputedStyle(l).display === "none") || Date.now() - t0 > 9000) setTimeout(fn, 500);
      else setTimeout(wait, 250);
    };
    wait();
  }
  if (PRESENT) afterIntro(() => start([{ slide: "title" }, { slide: "problem" }, ...STEPS, { slide: "end" }], true));
  else if (DEMO) {
    let seen = false;
    try { seen = sessionStorage.getItem("swa-toured") === "1"; } catch (e) {}
    if (!seen) afterIntro(() => { if (!T && state.profile) start(STEPS, false); });
  }
})();
