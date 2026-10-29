// Checks public/syllabus.js: every board has a chapter list for every subject a student of that class and group gets.
// Run: node tests/check_syllabus.js
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "syllabus.js"), "utf8");
const data = new Function(`${src}; return { BOARDS, GROUPS, SUBJECT_INFO, STARTER_CARDS };`)();
const problems = [];

for (const [board, b] of Object.entries(data.BOARDS)) {
  for (const cls of [9, 10, 11, 12]) {
    const level = cls <= 10 ? "matric" : "inter";
    for (const group of data.GROUPS[level]) {
      for (const s of [...group.subjects, ...b.compulsory[cls]]) {
        const book = b.syllabus[cls][s];
        const where = `${board} class ${cls} ${group.id} ${s}`;
        if (!data.SUBJECT_INFO[s]) problems.push(`${where}: unknown subject`);
        if (!book) { problems.push(`${where}: no chapter list`); continue; }
        if (!Number.isInteger(book.start) || book.start < 1) problems.push(`${where}: bad start`);
        if (!book.chapters.length || book.chapters.some((c) => typeof c !== "string" || !c.trim())) problems.push(`${where}: empty chapter`);
        if (new Set(book.chapters).size !== book.chapters.length && s !== "urdu") problems.push(`${where}: repeated chapter`);
      }
    }
  }
}
for (const cls of [9, 10, 11, 12]) if (!data.STARTER_CARDS[cls]) problems.push(`no starter cards for class ${cls}`);

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`syllabus.js OK: ${Object.keys(data.BOARDS).join(", ")}`);
