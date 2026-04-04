// BarnSignal — Auction barn configuration
// Each barn has a USDA report ID, name, location, and schedule

export interface AuctionBarn {
  reportId: number;
  name: string;
  shortName: string;
  location: string;
  lat: number;
  lng: number;
  auctionDays: string[];   // e.g. ["Monday"] or ["Tuesday"]
  categories: string[];     // what they sell
  pdfUrl: string;
}

export const BARNS: AuctionBarn[] = [
  // ── Pennsylvania ──
  {
    reportId: 1908,
    name: "New Holland Livestock Cattle Auction (Monday)",
    shortName: "New Holland (Mon)",
    location: "New Holland, PA",
    lat: 40.1012, lng: -76.0852,
    auctionDays: ["Monday"],
    categories: ["slaughter_cattle", "feeder_dairy_calves"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1908.pdf",
  },
  {
    reportId: 1909,
    name: "New Holland Livestock Cattle Auction (Thursday)",
    shortName: "New Holland (Thu)",
    location: "New Holland, PA",
    lat: 40.1012, lng: -76.0852,
    auctionDays: ["Thursday"],
    categories: ["slaughter_cattle", "feeder_dairy_calves"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1909.pdf",
  },
  {
    reportId: 1916,
    name: "Vintage Livestock Auction (Monday)",
    shortName: "Vintage (Mon)",
    location: "Paradise, PA",
    lat: 40.0099, lng: -76.1271,
    auctionDays: ["Monday"],
    categories: ["slaughter_cattle"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1916.pdf",
  },
  {
    reportId: 1917,
    name: "Greencastle Livestock Auction (Monday)",
    shortName: "Greencastle (Mon)",
    location: "Greencastle, PA",
    lat: 39.7904, lng: -77.7261,
    auctionDays: ["Monday"],
    categories: ["slaughter_cattle", "feeder_cattle"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1917.pdf",
  },
  {
    reportId: 1918,
    name: "Middleburg Livestock Auction",
    shortName: "Middleburg",
    location: "Middleburg, PA",
    lat: 40.7865, lng: -77.0477,
    auctionDays: ["Monday"],
    categories: ["slaughter_cattle"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1918.pdf",
  },
  {
    reportId: 1920,
    name: "Greencastle Livestock Auction (Thursday)",
    shortName: "Greencastle (Thu)",
    location: "Greencastle, PA",
    lat: 39.7904, lng: -77.7261,
    auctionDays: ["Thursday"],
    categories: ["slaughter_cattle", "feeder_cattle"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1920.pdf",
  },
  // ── Maryland ──
  {
    reportId: 1870,
    name: "Four States Livestock Sales",
    shortName: "Four States (MD)",
    location: "Hagerstown, MD",
    lat: 39.6418, lng: -77.7200,
    auctionDays: ["Tuesday"],
    categories: ["slaughter_cattle", "feeder_cattle"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1870.pdf",
  },
  // ── Virginia ──
  // Fauquier (2173) and Winchester (2175) are graded feeder cattle sales
  // with a different PDF format (Medium/Large 1-2 vs Choice/Select grading).
  // Parser needs feeder-cattle support before these can be added back.
  // ── West Virginia ──
  {
    reportId: 1872,
    name: "Buckhannon Stockyards Livestock Auction",
    shortName: "Buckhannon (WV)",
    location: "Buckhannon, WV",
    lat: 38.9937, lng: -80.2320,
    auctionDays: ["Wednesday"],
    categories: ["slaughter_cattle", "feeder_cattle"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1872.pdf",
  },
  {
    reportId: 1880,
    name: "Jackson County Regional Livestock Market",
    shortName: "Ripley (WV)",
    location: "Ripley, WV",
    lat: 38.8187, lng: -81.7104,
    auctionDays: ["Thursday"],
    categories: ["slaughter_cattle", "feeder_cattle"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1880.pdf",
  },
  // ── New York ──
  {
    reportId: 1974,
    name: "Canandaigua Stockyards Livestock Auction",
    shortName: "Canandaigua (NY)",
    location: "Canandaigua, NY",
    lat: 42.8873, lng: -77.2814,
    auctionDays: ["Monday"],
    categories: ["slaughter_cattle", "feeder_cattle"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1974.pdf",
  },
];

// PA Weekly Summary — aggregated view across all PA auctions
export const PA_WEEKLY_SUMMARY = {
  reportId: 1919,
  name: "Pennsylvania Weekly Cattle Auction Summary",
  pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1919.pdf",
};

// Hay auctions — same USDA PDF pipeline, different parser
export const HAY_BARNS: AuctionBarn[] = [
  {
    reportId: 1725,
    name: "Wolgemuth Hay Auction - Leola, PA (Wednesday)",
    shortName: "Wolgemuth (Wed)",
    location: "Leola, PA",
    lat: 40.0893, lng: -76.1833,
    auctionDays: ["Wednesday"],
    categories: ["hay", "straw"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1725.pdf",
  },
  {
    reportId: 1716,
    name: "Wolgemuth Hay Auction - New Holland, PA (Monday)",
    shortName: "Wolgemuth NH (Mon)",
    location: "New Holland, PA",
    lat: 40.1012, lng: -76.0852,
    auctionDays: ["Monday"],
    categories: ["hay", "straw"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1716.pdf",
  },
];

// Geographic regions — grouped by realistic hauling distance
export interface Region {
  id: string;
  name: string;
  reportIds: number[];  // barns in this region
}

export const REGIONS: Region[] = [
  {
    id: "lancaster",
    name: "Lancaster / Chester Co.",
    reportIds: [1908, 1909, 1916],  // NH Mon/Thu, Vintage Mon
  },
  {
    id: "south-central-pa",
    name: "South-Central PA / MD",
    reportIds: [1917, 1920, 1918, 1870],  // Greencastle Mon/Thu, Middleburg, Four States MD
  },
  // Shenandoah Valley region paused until feeder cattle parser is built
  // { id: "shenandoah", name: "Shenandoah Valley", reportIds: [2173, 2175] },
  {
    id: "wv",
    name: "West Virginia",
    reportIds: [1872, 1880],  // Buckhannon, Ripley
  },
  {
    id: "finger-lakes",
    name: "Finger Lakes NY",
    reportIds: [1974],  // Canandaigua
  },
];

// Key cattle categories we track for predictions
export const TRACKED_CATEGORIES = [
  "STEERS - Choice and Prime 3-4",
  "STEERS - Choice 2-3",
  "STEERS - Select 2-3",
  "HEIFERS - Choice and Prime 3-4",
  "HEIFERS - Choice 2-3",
  "HEIFERS - Select 2-3",
  "DAIRY COWS - Breaker 75-80%",
  "DAIRY COWS - Boner 80-85%",
  "DAIRY COWS - Lean 85-90%",
  "BULLS - 1-2",
  "COWS - Breaker 75-80%",
  "COWS - Boner 80-85%",
] as const;

// Key hay/straw categories for tracking
export const TRACKED_HAY_CATEGORIES = [
  "Alfalfa - Premium",
  "Alfalfa - Good",
  "Alfalfa/Grass Mix - Premium",
  "Alfalfa/Grass Mix - Good",
  "Grass - Premium",
  "Grass - Good",
  "Grass - Fair",
  "Orchard Grass - Good",
  "Orchard/Timothy Grass - Good",
  "Corn Stalk",
  "Wheat Straw",
] as const;
