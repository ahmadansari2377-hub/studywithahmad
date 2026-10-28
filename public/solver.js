// =====================================================================
//  Formula solver: common Matric / FSc physics and maths formulas.
//  "Solve for one" formulas: leave exactly one box empty and it is worked out, with the steps shown.
//  "Results" formulas (projectile, Atwood, quadratic): fill every box and all the results are listed.
// =====================================================================
const SOLVER = [
  {
    id: "newton2", group: "Physics", name: "Newton's second law", formula: "F = m × a",
    vars: { F: ["Force", "N"], m: ["Mass", "kg"], a: ["Acceleration", "m/s²"] },
    solve: { F: (v) => [v.m * v.a, `F = m × a = ${v.m} × ${v.a}`], m: (v) => [v.F / v.a, `m = F ÷ a = ${v.F} ÷ ${v.a}`], a: (v) => [v.F / v.m, `a = F ÷ m = ${v.F} ÷ ${v.m}`] },
  },
  {
    id: "vuat", group: "Physics", name: "First equation of motion", formula: "v = u + a t",
    vars: { v: ["Final velocity", "m/s"], u: ["Initial velocity", "m/s"], a: ["Acceleration", "m/s²"], t: ["Time", "s"] },
    solve: {
      v: (x) => [x.u + x.a * x.t, `v = u + a t = ${x.u} + ${x.a} × ${x.t}`],
      u: (x) => [x.v - x.a * x.t, `u = v − a t = ${x.v} − ${x.a} × ${x.t}`],
      a: (x) => [(x.v - x.u) / x.t, `a = (v − u) ÷ t = (${x.v} − ${x.u}) ÷ ${x.t}`],
      t: (x) => [(x.v - x.u) / x.a, `t = (v − u) ÷ a = (${x.v} − ${x.u}) ÷ ${x.a}`],
    },
  },
  {
    id: "suat", group: "Physics", name: "Second equation of motion", formula: "S = u t + ½ a t²",
    vars: { S: ["Distance", "m"], u: ["Initial velocity", "m/s"], a: ["Acceleration", "m/s²"], t: ["Time", "s"] },
    solve: {
      S: (x) => [x.u * x.t + 0.5 * x.a * x.t ** 2, `S = u t + ½ a t² = ${x.u} × ${x.t} + ½ × ${x.a} × ${x.t}²`],
      u: (x) => [(x.S - 0.5 * x.a * x.t ** 2) / x.t, `u = (S − ½ a t²) ÷ t = (${x.S} − ½ × ${x.a} × ${x.t}²) ÷ ${x.t}`],
      a: (x) => [(2 * (x.S - x.u * x.t)) / x.t ** 2, `a = 2(S − u t) ÷ t² = 2(${x.S} − ${x.u} × ${x.t}) ÷ ${x.t}²`],
    },
  },
  {
    id: "v2", group: "Physics", name: "Third equation of motion", formula: "v² = u² + 2 a S",
    vars: { v: ["Final velocity", "m/s"], u: ["Initial velocity", "m/s"], a: ["Acceleration", "m/s²"], S: ["Distance", "m"] },
    solve: {
      v: (x) => [Math.sqrt(x.u ** 2 + 2 * x.a * x.S), `v = √(u² + 2 a S) = √(${x.u}² + 2 × ${x.a} × ${x.S})`],
      u: (x) => [Math.sqrt(x.v ** 2 - 2 * x.a * x.S), `u = √(v² − 2 a S) = √(${x.v}² − 2 × ${x.a} × ${x.S})`],
      a: (x) => [(x.v ** 2 - x.u ** 2) / (2 * x.S), `a = (v² − u²) ÷ 2S = (${x.v}² − ${x.u}²) ÷ (2 × ${x.S})`],
      S: (x) => [(x.v ** 2 - x.u ** 2) / (2 * x.a), `S = (v² − u²) ÷ 2a = (${x.v}² − ${x.u}²) ÷ (2 × ${x.a})`],
    },
  },
  {
    id: "pendulum", group: "Physics", name: "Simple pendulum", formula: "T = 2π √(L ÷ g)",
    vars: { T: ["Time period", "s"], L: ["Length", "m"], g: ["Gravity (9.8 on Earth)", "m/s²"] },
    defaults: { g: 9.8 },
    solve: {
      T: (x) => [2 * Math.PI * Math.sqrt(x.L / x.g), `T = 2π √(L ÷ g) = 2 × 3.1416 × √(${x.L} ÷ ${x.g})`],
      L: (x) => [x.g * (x.T / (2 * Math.PI)) ** 2, `L = g (T ÷ 2π)² = ${x.g} × (${x.T} ÷ 6.2832)²`],
      g: (x) => [x.L * (2 * Math.PI / x.T) ** 2, `g = L (2π ÷ T)² = ${x.L} × (6.2832 ÷ ${x.T})²`],
    },
  },
  {
    id: "atwood", group: "Physics", name: "Atwood machine", formula: "a = (m₁ − m₂) g ÷ (m₁ + m₂), T = 2 m₁ m₂ g ÷ (m₁ + m₂)",
    vars: { m1: ["Heavier mass m₁", "kg"], m2: ["Lighter mass m₂", "kg"], g: ["Gravity", "m/s²"] },
    defaults: { g: 9.8 },
    results: (x) => [
      ["Acceleration a", ((x.m1 - x.m2) * x.g) / (x.m1 + x.m2), "m/s²", `a = (${x.m1} − ${x.m2}) × ${x.g} ÷ (${x.m1} + ${x.m2})`],
      ["Tension T", (2 * x.m1 * x.m2 * x.g) / (x.m1 + x.m2), "N", `T = 2 × ${x.m1} × ${x.m2} × ${x.g} ÷ (${x.m1} + ${x.m2})`],
    ],
  },
  {
    id: "projectile", group: "Physics", name: "Projectile motion", formula: "R = v² sin 2θ ÷ g, H = v² sin²θ ÷ 2g, t = 2 v sinθ ÷ g",
    vars: { v: ["Launch speed", "m/s"], th: ["Angle θ", "°"], g: ["Gravity", "m/s²"] },
    defaults: { g: 9.8 },
    results: (x) => {
      const r = (x.th * Math.PI) / 180, s = Math.sin(r);
      return [
        ["Range R", (x.v ** 2 * Math.sin(2 * r)) / x.g, "m", `R = ${x.v}² × sin(2 × ${x.th}°) ÷ ${x.g}`],
        ["Max height H", (x.v ** 2 * s ** 2) / (2 * x.g), "m", `H = ${x.v}² × sin²(${x.th}°) ÷ (2 × ${x.g})`],
        ["Time of flight t", (2 * x.v * s) / x.g, "s", `t = 2 × ${x.v} × sin(${x.th}°) ÷ ${x.g}`],
      ];
    },
  },
  {
    id: "ohm", group: "Physics", name: "Ohm's law", formula: "V = I × R",
    vars: { V: ["Voltage", "V"], I: ["Current", "A"], R: ["Resistance", "Ω"] },
    solve: { V: (x) => [x.I * x.R, `V = I × R = ${x.I} × ${x.R}`], I: (x) => [x.V / x.R, `I = V ÷ R = ${x.V} ÷ ${x.R}`], R: (x) => [x.V / x.I, `R = V ÷ I = ${x.V} ÷ ${x.I}`] },
  },
  {
    id: "ke", group: "Physics", name: "Kinetic energy", formula: "K.E = ½ m v²",
    vars: { K: ["Kinetic energy", "J"], m: ["Mass", "kg"], v: ["Speed", "m/s"] },
    solve: {
      K: (x) => [0.5 * x.m * x.v ** 2, `K.E = ½ m v² = ½ × ${x.m} × ${x.v}²`],
      m: (x) => [(2 * x.K) / x.v ** 2, `m = 2 K.E ÷ v² = 2 × ${x.K} ÷ ${x.v}²`],
      v: (x) => [Math.sqrt((2 * x.K) / x.m), `v = √(2 K.E ÷ m) = √(2 × ${x.K} ÷ ${x.m})`],
    },
  },
  {
    id: "pe", group: "Physics", name: "Potential energy", formula: "P.E = m g h",
    vars: { P: ["Potential energy", "J"], m: ["Mass", "kg"], g: ["Gravity", "m/s²"], h: ["Height", "m"] },
    defaults: { g: 9.8 },
    solve: {
      P: (x) => [x.m * x.g * x.h, `P.E = m g h = ${x.m} × ${x.g} × ${x.h}`],
      m: (x) => [x.P / (x.g * x.h), `m = P.E ÷ (g h) = ${x.P} ÷ (${x.g} × ${x.h})`],
      h: (x) => [x.P / (x.m * x.g), `h = P.E ÷ (m g) = ${x.P} ÷ (${x.m} × ${x.g})`],
    },
  },
  {
    id: "power", group: "Physics", name: "Power", formula: "P = W ÷ t",
    vars: { P: ["Power", "W"], W: ["Work", "J"], t: ["Time", "s"] },
    solve: { P: (x) => [x.W / x.t, `P = W ÷ t = ${x.W} ÷ ${x.t}`], W: (x) => [x.P * x.t, `W = P × t = ${x.P} × ${x.t}`], t: (x) => [x.W / x.P, `t = W ÷ P = ${x.W} ÷ ${x.P}`] },
  },
  {
    id: "density", group: "Physics", name: "Density", formula: "ρ = m ÷ V",
    vars: { d: ["Density ρ", "kg/m³"], m: ["Mass", "kg"], V: ["Volume", "m³"] },
    solve: { d: (x) => [x.m / x.V, `ρ = m ÷ V = ${x.m} ÷ ${x.V}`], m: (x) => [x.d * x.V, `m = ρ × V = ${x.d} × ${x.V}`], V: (x) => [x.m / x.d, `V = m ÷ ρ = ${x.m} ÷ ${x.d}`] },
  },
  {
    id: "hooke", group: "Physics", name: "Hooke's law", formula: "F = k x",
    vars: { F: ["Force", "N"], k: ["Spring constant", "N/m"], x: ["Extension", "m"] },
    solve: { F: (v) => [v.k * v.x, `F = k x = ${v.k} × ${v.x}`], k: (v) => [v.F / v.x, `k = F ÷ x = ${v.F} ÷ ${v.x}`], x: (v) => [v.F / v.k, `x = F ÷ k = ${v.F} ÷ ${v.k}`] },
  },
  {
    id: "quadratic", group: "Maths", name: "Quadratic equation", formula: "a x² + b x + c = 0 → x = (−b ± √(b² − 4ac)) ÷ 2a",
    vars: { a: ["a", ""], b: ["b", ""], c: ["c", ""] },
    results: (x) => {
      const D = x.b ** 2 - 4 * x.a * x.c;
      if (x.a === 0) return [["Not quadratic", NaN, "", "a must not be 0"]];
      if (D < 0) {
        const re = -x.b / (2 * x.a), im = Math.sqrt(-D) / (2 * Math.abs(x.a));
        return [["Discriminant b² − 4ac", D, "", `D = ${x.b}² − 4 × ${x.a} × ${x.c}`], ["Roots (complex)", `${fmtNum(re)} ± ${fmtNum(im)} i`, "", "D < 0, so the roots are complex"]];
      }
      return [
        ["Discriminant b² − 4ac", D, "", `D = ${x.b}² − 4 × ${x.a} × ${x.c}`],
        ["x₁", (-x.b + Math.sqrt(D)) / (2 * x.a), "", `x₁ = (−${x.b} + √${fmtNum(D)}) ÷ (2 × ${x.a})`],
        ["x₂", (-x.b - Math.sqrt(D)) / (2 * x.a), "", `x₂ = (−${x.b} − √${fmtNum(D)}) ÷ (2 × ${x.a})`],
      ];
    },
  },
];

// 4 significant figures, without trailing zeros; very big or small numbers in scientific form
function fmtNum(n) {
  if (typeof n !== "number") return String(n);
  if (!isFinite(n)) return "undefined";
  if (n !== 0 && (Math.abs(n) >= 1e6 || Math.abs(n) < 1e-3)) return n.toExponential(3).replace(/\.?0+e/, "e");
  return String(+n.toPrecision(4));
}
