// =====================================================================
//  Entry tests: paper pattern of each test (MCQs per part, time, marking).
//  Parts with a `subject` track progress on the FSc (11th + 12th) PTB chapters from syllabus.js.
//  Patterns come from the official notices / news reports linked in `source`; check them before your test,
//  since boards change the pattern from year to year.
// =====================================================================
const ENTRY_TESTS = {
  mdcat: {
    name: "MDCAT",
    by: "PMDC",
    for: "MBBS and BDS admissions",
    mcqs: 180,
    minutes: 180,
    marking: "No negative marking",
    note: "Pass mark: 55% for MBBS, 50% for BDS",
    parts: [
      { subject: "biology", mcqs: 81 },
      { subject: "chemistry", mcqs: 45 },
      { subject: "physics", mcqs: 36 },
      { label: "English", mcqs: 9, color: "#e0307a", topic: "English grammar, vocabulary and sentence correction" },
      { label: "Logical Reasoning", mcqs: 9, color: "#8a8a9a", topic: "logical reasoning (patterns, deductions, analogies)" },
    ],
    source: { label: "PMDC MDCAT 2025 pattern (Express Tribune)", url: "https://tribune.com.pk/story/2550605/pmdc-introduces-new-mdcat-syllabus" },
  },
  ecat: {
    name: "ECAT",
    by: "UET",
    for: "Engineering admissions (Pre-Engineering)",
    mcqs: 100,
    minutes: 100,
    marking: "+4 for a right answer, −1 for a wrong one",
    note: "400 marks in total",
    parts: [
      { subject: "maths", mcqs: 30 },
      { subject: "physics", mcqs: 30 },
      { subject: "chemistry", mcqs: 30 },
      { label: "English", mcqs: 10, color: "#e0307a", topic: "English grammar, vocabulary and sentence correction" },
    ],
    source: { label: "UET entry test notice", url: "https://admission.uet.edu.pk/Downloads/Advertisements/BSC/Combined_Ad_Updated.pdf" },
  },
  ecatcs: {
    name: "ECAT (ICS)",
    by: "UET",
    for: "Engineering admissions with Computer Science",
    mcqs: 100,
    minutes: 100,
    marking: "+4 for a right answer, −1 for a wrong one",
    note: "Computer Science takes Chemistry's place",
    parts: [
      { subject: "maths", mcqs: 30 },
      { subject: "physics", mcqs: 30 },
      { subject: "computer", mcqs: 30 },
      { label: "English", mcqs: 10, color: "#e0307a", topic: "English grammar, vocabulary and sentence correction" },
    ],
    source: { label: "UET entry test notice", url: "https://admission.uet.edu.pk/Downloads/Advertisements/BSC/Combined_Ad_Updated.pdf" },
  },
  net: {
    name: "NUST NET",
    by: "NUST",
    for: "Engineering and Computing admissions",
    mcqs: 200,
    minutes: 180,
    marking: "No negative marking",
    note: "Pattern from prep sites, not an official NUST notice",
    parts: [
      { subject: "maths", mcqs: 100 },
      { subject: "physics", mcqs: 60 },
      { label: "English", mcqs: 40, color: "#e0307a", topic: "SAT-style English: reading, vocabulary and sentence correction" },
    ],
    source: { label: "NUST NET guide (Parhlai)", url: "https://parhlai.com/blog/nust-net-past-papers" },
  },
  fast: {
    name: "FAST",
    by: "FAST-NUCES",
    for: "BS Computing and Engineering admissions",
    unit: "%", // only the share of each part is reported, not exact question counts
    mcqs: 120,
    minutes: 120,
    marking: "−0.25 for a wrong answer",
    note: "Pattern from prep sites, not an official FAST notice",
    parts: [
      { subject: "maths", mcqs: 50 },
      { label: "Basic Maths", mcqs: 20, color: "#f2b02f", topic: "Matric-level maths (algebra, ratios, percentages, geometry)" },
      { label: "Analytical & IQ", mcqs: 20, color: "#8a8a9a", topic: "analytical reasoning and IQ (series, patterns, puzzles)" },
      { label: "English", mcqs: 10, color: "#e0307a", topic: "English grammar, vocabulary and comprehension" },
    ],
    source: { label: "FAST test guide (Parhlai)", url: "https://parhlai.com/blog/fast-test" },
  },
};
