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
    reportId: 1913,
    name: "New Holland Sheep and Goat Auction",
    shortName: "New Holland Sheep/Goat",
    location: "New Holland, PA",
    auctionDays: ["Monday"],
    categories: ["sheep", "goats"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1913.pdf",
  },
  {
    reportId: 1915,
    name: "Vintage Livestock Auction (Tuesday)",
    shortName: "Vintage (Tue)",
    location: "Paradise, PA",
    auctionDays: ["Tuesday"],
    categories: ["slaughter_cattle", "feeder_cattle"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1915.pdf",
  },
  {
    reportId: 1924,
    name: "Vintage Feeder Cattle Sale",
    shortName: "Vintage Feeder",
    location: "Paradise, PA",
    auctionDays: ["Monthly"],
    categories: ["feeder_cattle"],
    pdfUrl: "https://www.ams.usda.gov/mnreports/ams_1924.pdf",
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
