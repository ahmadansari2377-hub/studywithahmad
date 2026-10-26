// =====================================================================
//  PTB / PCTB syllabus data — chapter titles of the 2026-27 Punjab
//  textbooks (Science & Computer subjects). `start` is the chapter number
//  the book begins at (Class 10 and 12 books continue Class 9 and 11).
//  Always double-check against the printed textbook.
// =====================================================================
const SUBJECT_INFO = {
  physics: { name: "Physics", color: "#5b4bf5" },
  chemistry: { name: "Chemistry", color: "#ff6b57" },
  biology: { name: "Biology", color: "#1fae86" },
  maths: { name: "Mathematics", color: "#e6a11f" },
  computer: { name: "Computer Science", color: "#2f8cf0" },
  english: { name: "English", color: "#e05297" },
  urdu: { name: "Urdu", color: "#8a5cf6" },
  islamiat: { name: "Islamiat / Pak Studies", color: "#0f9d8a" },
  tarjama: { name: "Tarjama-tul-Quran", color: "#b7791f" },
};

const GROUPS = {
  matric: [
    { id: "bio", name: "Science (Biology)", subjects: ["physics", "chemistry", "biology", "maths"] },
    { id: "comp", name: "Science (Computer)", subjects: ["physics", "chemistry", "computer", "maths"] },
  ],
  inter: [
    { id: "premed", name: "Pre-Medical", subjects: ["physics", "chemistry", "biology"] },
    { id: "preeng", name: "Pre-Engineering", subjects: ["physics", "chemistry", "maths"] },
    { id: "ics", name: "ICS (Physics)", subjects: ["maths", "computer", "physics"] },
  ],
};
const COMPULSORY = ["english", "urdu", "islamiat", "tarjama"];

const SYLLABUS = {
  9: {
    physics: { start: 1, chapters: ["Physical Quantities and Measurements", "Kinematics", "Dynamics", "Turning Effects of Force", "Work, Energy and Power", "Mechanical Properties of Matter", "Thermal Properties of Matter", "Magnetism", "Nature of Science"] },
    chemistry: { start: 1, chapters: ["States of Matter and Phase Changes", "Atomic Structure", "Chemical Bonding", "Stoichiometry", "Energetics", "Equilibria", "Acid Base Chemistry", "Periodic Table and Periodicity", "Group Properties and Elements", "Environmental Chemistry", "Hydrocarbons", "Empirical Data Collection and Analysis", "Laboratory and Practical Skills"] },
    biology: { start: 1, chapters: ["The Science of Biology", "Biodiversity", "The Cell", "Cell Cycle", "Tissues, Organs and Organ Systems", "Biomolecules", "Enzymes", "Bioenergetics", "Plant Physiology", "Reproduction in Plants", "Biostatistics"] },
    maths: { start: 1, chapters: ["Real Numbers", "Logarithms", "Set and Functions", "Factorization and Algebraic Manipulation", "Linear Equations and Inequalities", "Trigonometry", "Coordinate Geometry", "Logic", "Similar Figures", "Graphs of Functions", "Loci and Construction", "Information Handling", "Probability"] },
    computer: { start: 1, chapters: ["Introduction to Computational Systems", "System Design and Troubleshooting", "Introduction to Computer Networks", "Computational Thinking", "Web Development with HTML, CSS and JavaScript", "Data Science and Data Gathering", "Emerging Technologies in Computer Science", "Ethical, Social, and Legal Concerns in Computer Usage", "Entrepreneurship in Digital Age"] },
  },
  10: {
    physics: { start: 10, chapters: ["Thermal Physics", "Transfer of Thermal Energy", "Waves", "Sound", "Light", "Electrostatics", "Electricity", "Electromagnetism", "Electromagnetic Induction and Electromagnetic Waves", "Electronics", "Atomic and Nuclear Physics", "Space and Environment"] },
    chemistry: { start: 14, chapters: ["States of Matter and Phase Changes", "Stoichiometry", "Electrochemistry", "Reaction Kinetics", "Salts", "Nitrogen and Sulphur", "Water", "Organic Chemistry", "Hydrocarbons", "Monohydroxy Alkanes or Alcohols", "Carboxylic Acids", "Biochemistry", "Polymers"] },
    biology: { start: 1, chapters: ["Human Digestive System", "Human Respiratory System", "Human Blood Circulatory System", "Human Urinary System", "Coordination", "Reproduction", "Inheritance", "Biotechnology", "Diseases and Immunity", "Evolution"] },
    maths: { start: 1, chapters: ["Complex Numbers", "Quadratic Equations and Inequalities", "Matrices and Determinants", "Functions and Graphs", "Algebraic Fractions", "Vectors in Plane", "Trigonometry", "Chords and Arcs of a Circle", "Tangent and Angles of a Circle", "Practical Geometry of Circles", "Information Handling", "Probability"] },
    computer: { start: 1, chapters: ["Operating Systems: Structure and Services", "System Recovery and Advanced Maintenance", "Introduction to Python Programming", "Control Structures in Python", "Data Science", "Introduction to Artificial Intelligence (AI) and Machine Learning (ML)", "Applications of AI", "Digital Entrepreneurship"] },
  },
  11: {
    physics: { start: 1, chapters: ["Measurements", "Force and Motion", "Circular and Rotational Motion", "Work, Energy and Power", "Solids and Fluid Dynamics", "Heat and Thermodynamics", "Waves and Vibrations", "Physical Optics and Gravitational Waves", "Electrostatics and Current Electricity", "Electromagnetism", "Special Theory of Relativity", "Nuclear and Particle Physics"] },
    chemistry: { start: 1, chapters: ["Periodic Table and Periodic Properties", "Atomic Structure", "Chemical Bonding", "Stoichiometry", "States and Phases of Matter", "Chemical Energetics", "Reaction Kinetics", "Chemical Equilibrium", "Acid-Base Chemistry", "Electrochemistry", "Hydrocarbons", "Nitrogen and Sulfur", "Halogens", "Atmosphere", "Basic Separation Techniques", "Lab Safety and Practical Skills"] },
    biology: { start: 1, chapters: ["Biodiversity and Classification", "Bacteria and Viruses", "Cells and Subcellular Organelles", "Molecular Biology", "Enzymes", "Bioenergetics", "Structural and Computational Biology", "Plant Physiology", "Human Digestive System", "Human Respiratory System", "Human Circulatory System", "Human Skeletal and Muscular Systems"] },
    maths: { start: 1, chapters: ["Complex Numbers", "Functions and Graphs", "Theory of Quadratic Functions", "Matrices and Determinants", "Partial Fractions", "Sequences and Series", "Permutations and Combinations", "Mathematical Induction and Binomial Theorem", "Division of Polynomials", "Trigonometric Identities", "Trigonometric Functions and their Graphs", "Limit and Continuity", "Differentiation", "Vectors in Space"] },
    computer: { start: 1, chapters: ["Introduction to Software Development", "Python Programming", "Algorithms and Problem Solving", "Computational Structures", "Data Analytics", "Emerging Technologies", "Legal and Ethical Aspects of Computing Systems", "Online Research and Digital Literacy", "Entrepreneurship in Digital Age"] },
  },
  12: {
    physics: { start: 13, chapters: ["Thermal Physics", "Simple Harmonic Motion", "Physical Optics", "Electrostatics", "Alternating Current", "Quantum Physics", "Nuclear and Particle Physics", "Medical Physics", "Space and Environment"] },
    chemistry: { start: 17, chapters: ["Group 2 Elements", "Transition Metals", "Basics of Organic Chemistry", "Aromatic Hydrocarbons", "Halogenoalkanes", "Hydroxy Compounds", "Carbonyl Compounds and Carboxylic Acids", "Organic Nitrogen Compounds", "Organic Synthesis", "Polymers", "Biochemistry", "Chromatography", "Spectroscopy-1", "Spectroscopy-2 (NMR)", "Materials and Energy", "Medicine, Agriculture and Industry", "Water"] },
    biology: { start: 13, chapters: ["Thermoregulation and Osmoregulation", "Human Urinary System", "Human Nervous System", "Human Endocrine System", "Human Reproductive System", "Inheritance", "Chromosome and DNA", "Biotechnology", "Immunity", "Biostatistics", "Pharmacology", "Evolution", "Ecology"] },
    maths: { start: 1, chapters: ["Graphical Representation of Functions", "Further Differentiation", "Integration", "Differential Equations", "Analytical Geometry", "Conic Sections", "Kinematics", "Numerical Methods", "Inverse Trigonometric Functions and Their Graphs", "Solution of Trigonometric Equations", "Vector Valued Functions and Their Differentiation"] },
    computer: { start: 1, chapters: ["Computing Networks", "Computational Thinking and Algorithms", "Object Oriented Programming Using Python", "Development of Graphical User Interface (GUI)", "Code Testing and Debugging", "Data and Analysis", "Hypothesis Testing", "Applications of Computer Science", "Cybersecurity and Safe Digital Collaboration"] },
  },
};

// Starter revision cards (written for Study with Ahmad, not copied from the books)
const STARTER_CARDS = {
  9: {
    physics: [
      ["What are the seven SI base quantities?", "Length, mass, time, electric current, temperature, amount of substance and luminous intensity."],
      ["State Newton's second law of motion.", "The acceleration of a body is directly proportional to the net force on it and inversely proportional to its mass: F = ma."],
      ["What is the moment of a force (torque)?", "The turning effect of a force: torque = force × perpendicular distance from the axis. SI unit: N m."],
    ],
    chemistry: [
      ["Name the three subatomic particles.", "Protons (positive), neutrons (no charge) and electrons (negative)."],
      ["What is an ionic bond?", "A bond formed when electrons are transferred from one atom to another, making oppositely charged ions that attract each other."],
      ["Define one mole.", "The amount of substance that contains 6.022 × 10²³ particles (Avogadro's number)."],
    ],
    biology: [
      ["What is the basic structural and functional unit of life?", "The cell."],
      ["What are enzymes?", "Biological catalysts (mostly proteins) that speed up chemical reactions without being used up."],
      ["Word equation for photosynthesis?", "Carbon dioxide + water → glucose + oxygen (in the presence of light and chlorophyll)."],
    ],
    maths: [
      ["Product law of logarithms?", "log(mn) = log m + log n"],
      ["Distance between (x₁, y₁) and (x₂, y₂)?", "d = √[(x₂ − x₁)² + (y₂ − y₁)²]"],
      ["How do you find the probability of an event?", "P(E) = favourable outcomes ÷ total possible outcomes, and 0 ≤ P(E) ≤ 1."],
    ],
    computer: [
      ["Convert binary 1011 to decimal.", "8 + 0 + 2 + 1 = 11"],
      ["What do HTML, CSS and JavaScript each do?", "HTML structures a web page, CSS styles it, and JavaScript adds behaviour."],
      ["What is computational thinking?", "Solving problems like a computer scientist: decomposition, pattern recognition, abstraction and algorithms."],
    ],
  },
  10: {
    physics: [
      ["State Ohm's law.", "At constant temperature, the current through a conductor is directly proportional to the potential difference across it: V = IR."],
      ["State the laws of reflection.", "The angle of incidence equals the angle of reflection, and the incident ray, reflected ray and normal lie in one plane."],
      ["Approximate speed of sound in air?", "About 340 m/s at room temperature."],
    ],
    chemistry: [
      ["What is an electrolyte?", "A substance that conducts electricity when molten or dissolved in water, because its ions can move."],
      ["General formula of alkanes?", "CₙH₂ₙ₊₂ — e.g. methane CH₄, ethane C₂H₆."],
      ["Functional group of alcohols?", "The hydroxyl group, –OH."],
    ],
    biology: [
      ["Where does most digestion and absorption take place?", "In the small intestine — absorption happens through the villi."],
      ["Functional unit of the kidney?", "The nephron."],
      ["Which plant did Mendel use to study inheritance?", "The garden pea (Pisum sativum)."],
    ],
    maths: [
      ["Quadratic formula?", "x = [−b ± √(b² − 4ac)] / 2a, for ax² + bx + c = 0"],
      ["What is i²?", "i² = −1, where i = √−1"],
      ["How is a tangent related to the radius at the point of contact?", "The tangent is perpendicular to the radius at that point."],
    ],
    computer: [
      ["What is an operating system?", "System software that manages hardware and software resources — e.g. Windows, Linux, Android."],
      ["What does print() do in Python?", "It shows output on the screen, e.g. print(\"Hello\")."],
      ["What is machine learning?", "A branch of AI where computers learn patterns from data instead of following only fixed instructions."],
    ],
  },
  11: {
    physics: [
      ["Difference between accuracy and precision?", "Accuracy is closeness to the true value; precision is closeness of repeated readings to each other."],
      ["Formula for centripetal force?", "F = mv²/r, directed towards the centre of the circle."],
      ["First law of thermodynamics?", "Energy is conserved: heat supplied = increase in internal energy + work done by the system (Q = ΔU + W)."],
    ],
    chemistry: [
      ["What is electronegativity?", "The tendency of an atom to attract a shared pair of electrons towards itself."],
      ["State Le Chatelier's principle.", "If a system at equilibrium is disturbed, it shifts in the direction that opposes the change."],
      ["Define pH.", "pH = −log[H⁺]. Below 7 is acidic, 7 is neutral, above 7 is basic (at 25 °C)."],
    ],
    biology: [
      ["Prokaryotic vs eukaryotic cells?", "Prokaryotes (e.g. bacteria) have no true nucleus or membrane-bound organelles; eukaryotes do."],
      ["What is ATP?", "Adenosine triphosphate — the cell's main energy currency."],
      ["What does haemoglobin do?", "It carries oxygen in red blood cells."],
    ],
    maths: [
      ["Modulus of z = a + bi?", "|z| = √(a² + b²)"],
      ["Formula for combinations nCr?", "nCr = n! / [r!(n − r)!]"],
      ["Derivative of xⁿ?", "d/dx (xⁿ) = n·xⁿ⁻¹"],
    ],
    computer: [
      ["What is Python?", "A high-level, interpreted programming language known for its readable syntax."],
      ["What is an algorithm?", "A finite, step-by-step set of instructions for solving a problem."],
      ["What is a variable?", "A named place to store data in a program, e.g. marks = 85."],
    ],
  },
  12: {
    physics: [
      ["Condition for simple harmonic motion?", "Acceleration is proportional to displacement and directed towards the mean position: a = −ω²x."],
      ["Einstein's photoelectric equation?", "hf = φ + K.E.max — photon energy = work function + maximum kinetic energy of the electron."],
      ["What is half-life?", "The time taken for half of the radioactive nuclei in a sample to decay."],
    ],
    chemistry: [
      ["Molecular formula of benzene?", "C₆H₆ — an aromatic ring with delocalised π electrons."],
      ["Functional group of aldehydes?", "–CHO (a carbonyl group at the end of the carbon chain)."],
      ["What is chromatography used for?", "Separating and identifying the components of a mixture."],
    ],
    biology: [
      ["Basic unit of the nervous system?", "The neuron."],
      ["What is a hormone?", "A chemical messenger made by an endocrine gland and carried in the blood to target organs."],
      ["Who proposed the theory of natural selection?", "Charles Darwin (with Alfred Russel Wallace)."],
    ],
    maths: [
      ["∫ xⁿ dx = ?", "xⁿ⁺¹/(n + 1) + C, for n ≠ −1"],
      ["Slope of the line through (x₁, y₁) and (x₂, y₂)?", "m = (y₂ − y₁)/(x₂ − x₁)"],
      ["Standard equation of a circle?", "(x − h)² + (y − k)² = r², with centre (h, k) and radius r."],
    ],
    computer: [
      ["What is a class in object-oriented programming?", "A blueprint for objects that bundles data (attributes) and functions (methods)."],
      ["What is debugging?", "Finding and fixing errors (bugs) in a program."],
      ["What is hypothesis testing?", "A statistical method for deciding, from sample data, whether to reject a null hypothesis."],
    ],
  },
};
