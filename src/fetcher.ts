// BarnSignal — USDA PDF Fetcher & Parser
// Fetches auction PDFs from ams.usda.gov and extracts structured price data

import { BARNS, PA_WEEKLY_SUMMARY, type AuctionBarn } from "./config.js";
import { storeAuctionData, type AuctionEntry, type CategoryData } from "./redis.js";

// pdf-parse is CJS, need dynamic import
async function getPdfParse() {
  const mod = await import("pdf-parse");
  return mod.default || mod;
}

// ─── PDF Fetching ───

async function fetchPdf(url: string): Promise<Buffer> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  const arrayBuf = await resp.arrayBuffer();
  return Buffer.from(arrayBuf);
}

// ─── Text Parsing ───

interface ParsedReport {
  reportDate: string;
  totalReceipts: number;
  lastWeekReceipts: number;
  lastYearReceipts: number;
  categories: CategoryData[];
  marketCommentary: string;
}

function parseReportDate(text: string): string {
  // Match patterns like "Mon Mar 30, 2026" or "Thu Mar 27, 2026"
  const dateMatch = text.match(
    /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})/
  );
  if (!dateMatch) return new Date().toISOString().split("T")[0];

  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const month = months[dateMatch[1]];
  const day = dateMatch[2].padStart(2, "0");
  const year = dateMatch[3];
  return `${year}-${month}-${day}`;
}

function parseReceipts(text: string): { total: number; lastWeek: number; lastYear: number } {
  const result = { total: 0, lastWeek: 0, lastYear: 0 };

  // Match "Total Receipts: 1,672 1,934 1,933" pattern
  const receiptMatch = text.match(
    /Total Receipts:\s*([\d,]+)\s*([\d,]+)\s*([\d,]+)/
  );
  if (receiptMatch) {
    result.total = parseInt(receiptMatch[1].replace(/,/g, ""));
    result.lastWeek = parseInt(receiptMatch[2].replace(/,/g, ""));
    result.lastYear = parseInt(receiptMatch[3].replace(/,/g, ""));
  }
  return result;
}

function parseMarketCommentary(text: string): string {
  // Extract the "Compared to last week..." paragraph
  const commentMatch = text.match(
    /Compared to last week['']?s sale[,.]?\s*(.*?)(?=Supply included:|AUCTION|SLAUGHTER|LIVESTOCK SUMMARY)/s
  );
  if (commentMatch) {
    return `Compared to last week's sale, ${commentMatch[1].trim()}`;
  }

  // Also try matching just the trend commentary
  const trendMatch = text.match(
    /(Compared to.*?)(?=\s*Supply included:)/s
  );
  return trendMatch ? trendMatch[1].trim() : "";
}

function parseCategories(text: string): CategoryData[] {
  const categories: CategoryData[] = [];
  let currentSection = "SLAUGHTER CATTLE";

  // Track section headers
  const sectionHeaders = [
    "SLAUGHTER CATTLE",
    "FEEDER DAIRY CALVES",
    "FEEDER CATTLE",
    "REPLACEMENT CATTLE",
  ];

  const lines = text.split("\n");

  let currentCategory = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for section headers
    for (const header of sectionHeaders) {
      if (line === header || line.startsWith(header)) {
        currentSection = header;
      }
    }

    // Match category headers like "STEERS - Choice 2-3 (Per Cwt / Actual Wt)"
    const catMatch = line.match(
      /^((?:DAIRY\s+)?(?:BEEF\/DAIRY\s+)?(?:STEERS|HEIFERS|COWS|BULLS|DAIRY COWS|DAIRY BULLS|DAIRY STEERS|DAIRY HEIFERS))\s*-\s*(.+?)\s*\(Per\s+Cwt/
    );
    if (catMatch) {
      currentCategory = `${catMatch[1]} - ${catMatch[2].trim()}`;
      continue;
    }

    // Match data rows: "209 1110-1880 1673 234.00-245.00 239.67 Average"
    // or feeder calves: "51 90-95 93 1325.00-1650.00 1524.57"
    const dataMatch = line.match(
      /^(\d+)\s+([\d]+-?[\d]*)\s+(\d+)\s+([\d.]+(?:-[\d.]+)?)\s+([\d.]+)\s*(Average|High|Low|Very Low|Beef Cross)?/
    );
    if (dataMatch && currentCategory) {
      const dressing = dataMatch[6] || "";
      // For feeder calves, "Beef Cross" is a breed type, not dressing
      const isBeefCross = dressing === "Beef Cross";

      categories.push({
        category: currentCategory + (isBeefCross ? " (Beef Cross)" : ""),
        section: currentSection,
        head: parseInt(dataMatch[1]),
        wtRange: dataMatch[2],
        avgWt: parseInt(dataMatch[3]),
        priceRange: dataMatch[4],
        avgPrice: parseFloat(dataMatch[5]),
        dressing: isBeefCross ? "Average" : dressing,
      });
    }
  }

  return categories;
}

function parseReport(text: string): ParsedReport {
  const reportDate = parseReportDate(text);
  const receipts = parseReceipts(text);
  const categories = parseCategories(text);
  const commentary = parseMarketCommentary(text);

  return {
    reportDate,
    totalReceipts: receipts.total,
    lastWeekReceipts: receipts.lastWeek,
    lastYearReceipts: receipts.lastYear,
    categories,
    marketCommentary: commentary,
  };
}

// ─── Main Fetch Function ───

export async function fetchAndParseAuction(barn: AuctionBarn): Promise<AuctionEntry> {
  console.log(`📥 Fetching ${barn.name}...`);
  const pdfParse = await getPdfParse();
  const buffer = await fetchPdf(barn.pdfUrl);
  const pdf = await pdfParse(buffer);
  const parsed = parseReport(pdf.text);

  console.log(`  📊 Date: ${parsed.reportDate}, Receipts: ${parsed.totalReceipts}, Categories: ${parsed.categories.length}`);

  const entry: AuctionEntry = {
    reportId: barn.reportId,
    barnName: barn.shortName,
    location: barn.location,
    reportDate: parsed.reportDate,
    fetchedAt: new Date().toISOString(),
    totalReceipts: parsed.totalReceipts,
    lastWeekReceipts: parsed.lastWeekReceipts,
    lastYearReceipts: parsed.lastYearReceipts,
    categories: parsed.categories,
    marketCommentary: parsed.marketCommentary,
  };

  return entry;
}

export async function fetchAllBarns(): Promise<AuctionEntry[]> {
  const entries: AuctionEntry[] = [];

  for (const barn of BARNS) {
    try {
      const entry = await fetchAndParseAuction(barn);
      await storeAuctionData(entry);
      entries.push(entry);
      console.log(`  ✅ Stored ${barn.shortName}: ${entry.categories.length} categories, ${entry.totalReceipts} head`);
    } catch (err) {
      console.error(`  ❌ Failed to fetch ${barn.shortName}: ${(err as Error).message}`);
    }
  }

  // Also fetch PA Weekly Summary
  try {
    console.log(`📥 Fetching PA Weekly Summary...`);
    const pdfParse = await getPdfParse();
    const buffer = await fetchPdf(PA_WEEKLY_SUMMARY.pdfUrl);
    const pdf = await pdfParse(buffer);
    const parsed = parseReport(pdf.text);

    const summaryEntry: AuctionEntry = {
      reportId: PA_WEEKLY_SUMMARY.reportId,
      barnName: "PA Weekly Summary",
      location: "Pennsylvania",
      reportDate: parsed.reportDate,
      fetchedAt: new Date().toISOString(),
      totalReceipts: parsed.totalReceipts,
      lastWeekReceipts: parsed.lastWeekReceipts,
      lastYearReceipts: parsed.lastYearReceipts,
      categories: parsed.categories,
      marketCommentary: parsed.marketCommentary,
    };

    await storeAuctionData(summaryEntry);
    entries.push(summaryEntry);
    console.log(`  ✅ Stored PA Weekly Summary: ${parsed.categories.length} categories, ${parsed.totalReceipts} head`);
  } catch (err) {
    console.error(`  ❌ Failed to fetch PA Weekly Summary: ${(err as Error).message}`);
  }

  return entries;
}
