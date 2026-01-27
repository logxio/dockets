// Mock data for Top 10 Law Firms based on AHPI Rankings
const TOP_FIRMS = [
  {
    rank: 1,
    name: "Quinn Emanuel Urquhart & Sullivan",
    shortName: "Quinn Emanuel",
    score: 3.24,
    winRate: 87,
    totalCases: 842,
    specialty: "Patent Litigation",
    strengthVsAverage: 15,
    topOpponents: ["Kirkland & Ellis", "Latham & Watkins"],
    pitchPoint: "87% win rate in patent cases, 15% higher than industry average"
  },
  {
    rank: 2,
    name: "Kirkland & Ellis LLP",
    shortName: "Kirkland & Ellis",
    score: 2.98,
    winRate: 82,
    totalCases: 1205,
    specialty: "Corporate Litigation",
    strengthVsAverage: 12,
    topOpponents: ["Quinn Emanuel", "Cravath Swaine"],
    pitchPoint: "Highest volume of Fortune 500 representations"
  },
  {
    rank: 3,
    name: "Cravath, Swaine & Moore LLP",
    shortName: "Cravath Swaine",
    score: 2.85,
    winRate: 79,
    totalCases: 623,
    specialty: "Securities Litigation",
    strengthVsAverage: 10,
    topOpponents: ["Sullivan & Cromwell", "Wachtell Lipton"],
    pitchPoint: "30% faster case resolution in Delaware corporate disputes"
  },
  {
    rank: 4,
    name: "Latham & Watkins LLP",
    shortName: "Latham & Watkins",
    score: 2.71,
    winRate: 76,
    totalCases: 1543,
    specialty: "Antitrust",
    strengthVsAverage: 8,
    topOpponents: ["Skadden Arps", "Quinn Emanuel"],
    pitchPoint: "Leading antitrust defense record in tech sector"
  },
  {
    rank: 5,
    name: "Wachtell, Lipton, Rosen & Katz",
    shortName: "Wachtell Lipton",
    score: 2.68,
    winRate: 75,
    totalCases: 387,
    specialty: "M&A Litigation",
    strengthVsAverage: 9,
    topOpponents: ["Cravath Swaine", "Sullivan & Cromwell"],
    pitchPoint: "Unmatched track record in hostile takeover defense"
  },
  {
    rank: 6,
    name: "Sullivan & Cromwell LLP",
    shortName: "Sullivan & Cromwell",
    score: 2.54,
    winRate: 73,
    totalCases: 756,
    specialty: "Banking Litigation",
    strengthVsAverage: 7,
    topOpponents: ["Cravath Swaine", "Davis Polk"],
    pitchPoint: "Dominant in financial services regulatory matters"
  },
  {
    rank: 7,
    name: "Skadden, Arps, Slate, Meagher & Flom",
    shortName: "Skadden Arps",
    score: 2.49,
    winRate: 72,
    totalCases: 1821,
    specialty: "Securities Class Actions",
    strengthVsAverage: 6,
    topOpponents: ["Latham & Watkins", "Gibson Dunn"],
    pitchPoint: "Most experienced in multi-district litigation"
  },
  {
    rank: 8,
    name: "Gibson, Dunn & Crutcher LLP",
    shortName: "Gibson Dunn",
    score: 2.42,
    winRate: 71,
    totalCases: 1134,
    specialty: "Appellate Advocacy",
    strengthVsAverage: 8,
    topOpponents: ["Skadden Arps", "Williams & Connolly"],
    pitchPoint: "Highest Supreme Court win rate among Big Law firms"
  },
  {
    rank: 9,
    name: "Williams & Connolly LLP",
    shortName: "Williams & Connolly",
    score: 2.38,
    winRate: 70,
    totalCases: 492,
    specialty: "White Collar Defense",
    strengthVsAverage: 12,
    topOpponents: ["Gibson Dunn", "WilmerHale"],
    pitchPoint: "Legendary trial record in high-stakes criminal defense"
  },
  {
    rank: 10,
    name: "Paul, Weiss, Rifkind, Wharton & Garrison",
    shortName: "Paul Weiss",
    score: 2.31,
    winRate: 68,
    totalCases: 891,
    specialty: "Complex Commercial",
    strengthVsAverage: 5,
    topOpponents: ["Kirkland & Ellis", "Skadden Arps"],
    pitchPoint: "Premier choice for bet-the-company litigation"
  }
];

// Industry averages for comparison
const INDUSTRY_AVG = {
  winRate: 63,
  avgCaseLoad: 450,
  avgResolutionTime: 18 // months
};

// Mock case type data
const CASE_TYPES = [
  "Patent Litigation",
  "Securities Litigation",
  "Antitrust",
  "Corporate Litigation",
  "White Collar Defense",
  "M&A Litigation"
];
