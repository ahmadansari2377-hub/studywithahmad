// ---------- Data ----------
const teams = {
  PAK: { name: "Pakistan", c1: "#01411c", c2: "#ffffff" },
  IND: { name: "India", c1: "#1f3c88", c2: "#ff9933" },
  AUS: { name: "Australia", c1: "#d4a500", c2: "#00843d" },
  ENG: { name: "England", c1: "#0b2a6f", c2: "#ce1124" },
  NZ: { name: "New Zealand", c1: "#111111", c2: "#666666" },
  SA: { name: "South Africa", c1: "#007749", c2: "#ffb612" },
  SL: { name: "Sri Lanka", c1: "#0c2c84", c2: "#ffbe29" },
  AFG: { name: "Afghanistan", c1: "#0066b3", c2: "#d32011" },
};

const matches = [
  { type: "live", info: "Final · T20", venue: "Lahore", a: "PAK", as: "186/4 (18.2)", b: "IND", bs: "192/7 (20)", note: "PAK need 7 runs in 10 balls" },
  { type: "live", info: "Test · Day 3", venue: "Sydney", a: "AUS", as: "412 & 88/2", b: "ENG", bs: "356", note: "AUS lead by 144 runs" },
  { type: "live", info: "ODI · Match 12", venue: "Kabul", a: "AFG", as: "241/6 (44.1)", b: "SL", bs: "268/9 (50)", note: "AFG need 28 runs in 35 balls" },
  { type: "upcoming", info: "ODI · Match 13", venue: "Cape Town", a: "SA", as: "", b: "NZ", bs: "", note: "Tomorrow · 2:00 PM" },
  { type: "upcoming", info: "T20 · Match 14", venue: "Mumbai", a: "IND", as: "", b: "AUS", bs: "", note: "Oct 29 · 7:30 PM" },
  { type: "upcoming", info: "Test · Match 3", venue: "Lord's", a: "ENG", as: "", b: "PAK", bs: "", note: "Nov 02 · 11:00 AM" },
  { type: "result", info: "T20 · Semi Final", venue: "Karachi", a: "PAK", as: "201/5 (20)", b: "AUS", bs: "178/9 (20)", note: "Pakistan won by 23 runs" },
  { type: "result", info: "T20 · Semi Final", venue: "Delhi", a: "IND", as: "165/3 (17.4)", b: "SA", bs: "163/8 (20)", note: "India won by 7 wickets" },
  { type: "result", info: "ODI · Match 11", venue: "Auckland", a: "NZ", as: "289/7 (50)", b: "SL", bs: "290/4 (47.3)", note: "Sri Lanka won by 6 wickets" },
];

const points = [
  ["PAK", 9, 7, 2, "+1.204", 14],
  ["IND", 9, 7, 2, "+0.988", 14],
  ["AUS", 9, 6, 3, "+0.645", 12],
  ["SA", 9, 5, 4, "+0.210", 10],
  ["NZ", 9, 4, 5, "-0.115", 8],
  ["ENG", 9, 3, 6, "-0.402", 6],
  ["SL", 9, 2, 7, "-0.887", 4],
  ["AFG", 9, 2, 7, "-1.330", 4],
];

const players = [
  { name: "Babar Azam", team: "PAK", role: "Batter", s: [["Runs", 512], ["Avg", 64.0], ["SR", 138]] },
  { name: "Virat Kohli", team: "IND", role: "Batter", s: [["Runs", 498], ["Avg", 71.1], ["SR", 141]] },
  { name: "Shaheen Afridi", team: "PAK", role: "Bowler", s: [["Wkts", 19], ["Econ", 6.8], ["Best", "4/22"]] },
  { name: "Pat Cummins", team: "AUS", role: "All-rounder", s: [["Wkts", 16], ["Runs", 188], ["Econ", 7.1]] },
];

const news = [
  { tag: "Final Preview", icon: "🏆", grad: "linear-gradient(135deg,#0f5132,#c6ff3d)", title: "Pakistan vs India: The final everyone has been waiting for", text: "Two unbeaten giants meet in Lahore for the title. Here's everything you need to know before the first ball." },
  { tag: "Records", icon: "🏏", grad: "linear-gradient(135deg,#1f3c88,#2ee88f)", title: "Kohli breaks another all-time T20 record", text: "The star batter now has the most 50+ scores in tournament history." },
  { tag: "Injury", icon: "🩹", grad: "linear-gradient(135deg,#7a1010,#ff9933)", title: "Starc ruled out of the Test series", text: "Australia's left-arm quick picks up a hamstring strain." },
  { tag: "Analysis", icon: "📊", grad: "linear-gradient(135deg,#3d1f88,#ff4dd2)", title: "Why spin will decide the final", text: "Lahore's dry pitch could turn the game in the middle overs." },
  { tag: "Interview", icon: "🎙️", grad: "linear-gradient(135deg,#0c2c84,#ffbe29)", title: "\"We play fearless cricket\" – Shaheen", text: "The pacer opens up about leading the bowling attack." },
];

// ---------- Helpers ----------
const flag = (code) =>
  `<div class="flag" style="--c1:${teams[code].c1};--c2:${teams[code].c2}">${code}</div>`;

// ---------- Ticker ----------
const tickerItems = matches
  .filter((m) => m.type !== "upcoming")
  .map((m) => `<span>🏏 ${m.a} ${m.as} vs ${m.b} ${m.bs} — ${m.note}</span>`)
  .join("");
// duplicated so the CSS scroll loops seamlessly
document.getElementById("tickerContent").innerHTML = tickerItems + tickerItems;

// ---------- Matches ----------
const matchGrid = document.getElementById("matchGrid");
function renderMatches(type) {
  matchGrid.innerHTML = matches
    .filter((m) => m.type === type)
    .map(
      (m, i) => `
      <div class="match-card" style="animation-delay:${i * 0.1}s">
        <div class="match-meta">
          <span>${m.info}</span>
          ${m.type === "live" ? '<span class="badge-live"><span class="dot"></span> LIVE</span>' : `<span>📍 ${m.venue}</span>`}
        </div>
        <div class="match-row">${flag(m.a)}<span class="name">${teams[m.a].name}</span><span class="score">${m.as || "–"}</span></div>
        <div class="match-row">${flag(m.b)}<span class="name">${teams[m.b].name}</span><span class="score">${m.bs || "–"}</span></div>
        <div class="match-foot">${m.note}</div>
      </div>`
    )
    .join("");
}
document.querySelectorAll("#matchTabs .tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelector("#matchTabs .tab.active").classList.remove("active");
    tab.classList.add("active");
    renderMatches(tab.dataset.filter);
  });
});
renderMatches("live");

// ---------- Points table ----------
document.getElementById("pointsBody").innerHTML = points
  .map(
    ([code, p, w, l, nrr, pts], i) => `
    <tr class="${i < 4 ? "qualified" : ""}">
      <td>${i + 1}</td>
      <td><div class="team-cell">${flag(code)} ${teams[code].name}</div></td>
      <td>${p}</td><td>${w}</td><td>${l}</td><td>${nrr}</td>
      <td class="pts">${pts}</td>
    </tr>`
  )
  .join("");

// ---------- Players ----------
document.getElementById("playerGrid").innerHTML = players
  .map(
    (pl) => `
    <div class="player-card reveal">
      <div class="avatar">${pl.name.split(" ").map((w) => w[0]).join("")}</div>
      <h3>${pl.name}</h3>
      <p class="role">${pl.role} · ${teams[pl.team].name}</p>
      <div class="player-stats">
        ${pl.s.map(([k, v]) => `<div><b>${v}</b><small>${k}</small></div>`).join("")}
      </div>
    </div>`
  )
  .join("");

// ---------- News ----------
document.getElementById("newsGrid").innerHTML = news
  .map(
    (n) => `
    <article class="news-card reveal">
      <div class="news-img" style="--grad:${n.grad}">${n.icon}</div>
      <div class="news-body">
        <span class="news-tag">${n.tag}</span>
        <h3>${n.title}</h3>
        <p>${n.text}</p>
      </div>
    </article>`
  )
  .join("");

// ---------- Live score simulation ----------
let runs = 186, wickets = 4, balls = 110; // 18.2 overs
const target = 193;
const outcomes = ["0", "1", "1", "2", "4", "6", "1", "W", "0", "2"];
const ballsEl = document.getElementById("balls");
const lastBalls = ["1", "4", "0", "6", "1", "2"];

function renderBalls() {
  ballsEl.innerHTML = lastBalls
    .map((b) => {
      const cls = b === "4" ? "four" : b === "6" ? "six" : b === "W" ? "wicket" : "";
      return `<div class="ball ${cls}">${b}</div>`;
    })
    .join("");
}

function updateLive() {
  const need = target - runs;
  const left = 120 - balls;
  const overs = `${Math.floor(balls / 6)}.${balls % 6}`;
  document.getElementById("pakScore").textContent = `${runs}/${wickets}`;
  document.getElementById("pakOvers").textContent = `(${overs})`;
  document.getElementById("crr").textContent = (runs / (balls / 6)).toFixed(2);

  const status = document.getElementById("liveStatus");
  if (need <= 0) {
    status.textContent = `🎉 Pakistan won by ${10 - wickets} wickets!`;
    document.getElementById("rrr").textContent = "–";
    document.getElementById("win").textContent = "PAK 100%";
    return false;
  }
  if (left <= 0 || wickets >= 10) {
    status.textContent = need === 1 ? "🤝 Match tied — Super Over!" : `🎉 India won by ${need - 1} runs`;
    document.getElementById("rrr").textContent = "–";
    document.getElementById("win").textContent = "IND 100%";
    return false;
  }
  status.textContent = `Pakistan need ${need} run${need > 1 ? "s" : ""} in ${left} ball${left > 1 ? "s" : ""}`;
  document.getElementById("rrr").textContent = ((need / left) * 6).toFixed(2);
  const pct = Math.max(5, Math.min(95, Math.round(100 - (need / left) * 40 - wickets * 4)));
  document.getElementById("win").textContent = `PAK ${pct}%`;
  return true;
}

renderBalls();
updateLive();

const liveTimer = setInterval(() => {
  const r = outcomes[Math.floor(Math.random() * outcomes.length)];
  balls++;
  if (r === "W") wickets++;
  else runs += Number(r);
  lastBalls.push(r);
  if (lastBalls.length > 6) lastBalls.shift();
  renderBalls();
  if (!updateLive()) clearInterval(liveTimer);
}, 4000);

// ---------- Counters ----------
function animateCounters() {
  document.querySelectorAll("[data-count]").forEach((el) => {
    const end = +el.dataset.count;
    let cur = 0;
    const step = Math.ceil(end / 50);
    const t = setInterval(() => {
      cur = Math.min(end, cur + step);
      el.textContent = cur;
      if (cur === end) clearInterval(t);
    }, 30);
  });
}
animateCounters();

// ---------- Navbar ----------
const navbar = document.getElementById("navbar");
const navLinks = document.getElementById("navLinks");
document.getElementById("menuToggle").addEventListener("click", () => navLinks.classList.toggle("open"));
navLinks.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => navLinks.classList.remove("open")));

const sections = document.querySelectorAll("section[id]");
window.addEventListener("scroll", () => {
  navbar.classList.toggle("scrolled", window.scrollY > 40);
  let current = "home";
  sections.forEach((s) => {
    if (window.scrollY >= s.offsetTop - 150) current = s.id;
  });
  navLinks.querySelectorAll("a").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === `#${current}`);
  });
});

// ---------- Scroll reveal ----------
const observer = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        observer.unobserve(e.target);
      }
    }),
  { threshold: 0.15 }
);
document.querySelectorAll(".reveal, .section-head, .table-wrap").forEach((el) => {
  el.classList.add("reveal");
  observer.observe(el);
});

// ---------- Newsletter ----------
document.getElementById("newsletterForm").addEventListener("submit", (e) => {
  e.preventDefault();
  document.getElementById("formMsg").textContent = "✅ Subscribed! You'll get live match alerts.";
  e.target.reset();
});
