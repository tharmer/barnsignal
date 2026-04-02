// BarnSignal — Auction barn configuration
// Each barn has a USDA report ID, name, location, and schedule

export interface AuctionBarn {
  reportId: number;
  name: string;
  shortName: string;
  location: string;
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
    auctionDays: ["Monday"],
    categories: ["slaughter_cattle", "feeder_dairy_calves"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1908.pdf",
  },
  {
    reportId: 1909,
    name: "New Holland Livestock Cattle Auction (Thursday)",
    shortName: "New Holland (Thu)",
    location: "New Holland, PA",
    auctionDays: ["Thursday"],
    categories: ["slaughter_cattle", "feeder_dairy_calves"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1909.pdf",
  },
  {
    reportId: 1916,
    name: "Vintage Livestock Auction (Monday)",
    shortName: "Vintage (Mon)",
    location: "Paradise, PA",
    auctionDays: ["Monday"],
    categories: ["slaughter_cattle"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1916.pdf",
  },
  {
    reportId: 1917,
    name: "Greencastle Livestock Auction (Monday)",
    shortName: "Greencastle (Mon)",
    location: "Greencastle, PA",
    auctionDays: ["Monday"],
    categories: ["slaughter_cattle", "feeder_cattle"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1917.pdf",
  },
  {
    reportId: 1918,
    name: "Middleburg Livestock Auction",
    shortName: "Middleburg",
    location: "Middleburg, PA",
    auctionDays: ["Monday"],
    categories: ["slaughter_cattle"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1918.pdf",
  },
  {
    reportId: 1920,
    name: "Greencastle Livestock Auction (Thursday)",
    shortName: "Greencastle (Thu)",
    location: "Greencastle, PA",
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
    auctionDays: ["Tuesday"],
    categories: ["slaughter_cattle", "feeder_cattle"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1870.pdf",
  },
  // ── Virginia ──
  {
    reportId: 2173,
    name: "Fauquier Livestock Exchange Graded Feeder Cattle Sale",
    shortName: "Fauquier (VA)",
    location: "Marshall, VA",
    auctionDays: ["Monthly"],
    categories: ["feeder_cattle"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_2173.pdf",
  },
  {
    reportId: 2175,
    name: "Farmers Livestock Exchange Graded Feeder Cattle Sale",
    shortName: "Winchester (VA)",
    location: "Winchester, VA",
    auctionDays: ["Monthly"],
    categories: ["feeder_cattle"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_2175.pdf",
  },
  // ── West Virginia ──
  {
    reportId: 1872,
    name: "Buckhannon Stockyards Livestock Auction",
    shortName: "Buckhannon (WV)",
    location: "Buckhannon, WV",
    auctionDays: ["Wednesday"],
    categories: ["slaughter_cattle", "feeder_cattle"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1872.pdf",
  },
  {
    reportId: 1880,
    name: "Jackson County Regional Livestock Market",
    shortName: "Ripley (WV)",
    location: "Ripley, WV",
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

// Hay auction for produce angle later
export const HAY_AUCTION = {
  reportId: 1725,
  name: "Wolgemuth Hay Auction - Leola, PA",
  pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1725.pdf",
};

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
  {
    id: "shenandoah",
    name: "Shenandoah Valley",
    reportIds: [2173, 2175],  // Fauquier, Winchester
  },
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
