// BarnSignal — USDA PDF Fetcher & Parser
// Fetches auction PDFs from ams.usda.gov and extracts structured price data

import { BARNS, PA_WEEKLY_SUMMARY, HAY_BARNS, type AuctionBarn } from "./config.js";
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
  // Match patterns like "Mon Mar  30,  2026" (extra spaces from PDF extraction)
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

  // PDF extraction concatenates columns: "Total Receipts:1,6721,9341,933"
  // We need to split three comma-formatted numbers that run together
  const receiptMatch = text.match(
    /Total Receipts:\s*([\d,]+?)([\d,]+?)([\d,]+)\s/
  );
  if (receiptMatch) {
    result.total = parseInt(receiptMatch[1].replace(/,/g, ""));
    result.lastWeek = parseInt(receiptMatch[2].replace(/,/g, ""));
    result.lastYear = parseInt(receiptMatch[3].replace(/,/g, ""));
  }

  // Better approach: find the line and split by known number patterns
  const receiptLine = text.match(/Total Receipts:([\d,.\s]+)/);
  if (receiptLine) {
    // Extract all comma-formatted numbers from the line
    const numbers = receiptLine[1].match(/[\d,]+/g);
    if (numbers && numbers.length >= 3) {
      result.total = parseInt(numbers[0].replace(/,/g, ""));
      result.lastWeek = parseInt(numbers[1].replace(/,/g, ""));
      result.lastYear = parseInt(numbers[2].replace(/,/g, ""));
    } else if (numbers && numbers.length === 1) {
      // All concatenated — need to split intelligently
      // e.g., "1,6721,9341,933" — split on digit followed by comma-digit pattern
      const raw = numbers[0];
      const parts = raw.match(/\d{1,3}(?:,\d{3})*/g);
      if (parts && parts.length >= 3) {
        result.total = parseInt(parts[0].replace(/,/g, ""));
        result.lastWeek = parseInt(parts[1].replace(/,/g, ""));
        result.lastYear = parseInt(parts[2].replace(/,/g, ""));
      }
    }
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

function parseConcatenatedDataRow(
  line: string
): { head: number; wtRange: string; avgWt: number; priceRange: string; avgPrice: number; dressing: string } | null {
  // Strip trailing dressing text first
  let dressing = "";
  let numPart = line;
  const dressingMatch = line.match(/\s*(Average Heavy Weight|Very Low|Average|High|Low|Beef Cross)\s*$/);
  if (dressingMatch) {
    dressing = dressingMatch[1];
    numPart = line.slice(0, line.length - dressingMatch[0].length).trim();
  }

  // Find the FIRST decimal point — this is where prices begin
  // Prices have format like 252.00 or 1325.00 (2-4 digits before decimal, 2 after)
  // The digits before the first "." include the end of avg_wt + start of first price
  const firstDotIdx = numPart.indexOf(".");
  if (firstDotIdx === -1) return null;

  // Price values are typically 2-4 digits before decimal: 90.00 to 2600.00
  // Look back from the first dot to find where the price starts
  // Try 2, 3, and 4 digits before the dot
  let priceSplitIdx = -1;
  for (const digits of [3, 4, 2]) { // most common first
    const candidateIdx = firstDotIdx - digits;
    if (candidateIdx < 4) continue; // need at least head(1) + wtLow(2) + "-" + wtHigh(2) + avgWt(2) = 8 chars min before price
    const priceCandidate = parseFloat(numPart.slice(candidateIdx, firstDotIdx + 3));
    // Cattle prices are typically $50-$3000/cwt. Feeder calves can go up to $2500/head
    if (priceCandidate >= 50 && priceCandidate <= 3000) {
      priceSplitIdx = candidateIdx;
      break;
    }
    // Feeder calves can have prices like 300-2500 per head
    if (priceCandidate >= 100 && priceCandidate <= 2500) {
      priceSplitIdx = candidateIdx;
      break;
    }
  }

  if (priceSplitIdx === -1) {
    // Try broader range for feeder calves
    for (const digits of [4, 3, 2]) {
      const candidateIdx = firstDotIdx - digits;
      if (candidateIdx < 2) continue;
      priceSplitIdx = candidateIdx;
      break;
    }
  }

  if (priceSplitIdx === -1) return null;

  const integerPart = numPart.slice(0, priceSplitIdx);
  const pricePart = numPart.slice(priceSplitIdx);

  // Parse prices: format is "252.00-258.00255.49" or "220.00220.00"
  // Find all X+.XX patterns in price part
  const priceNums: number[] = [];
  const priceRegex = /(\d+\.\d{2})/g;
  let pm;
  while ((pm = priceRegex.exec(pricePart)) !== null) {
    priceNums.push(parseFloat(pm[1]));
  }

  if (priceNums.length < 2) return null;

  const avgPrice = priceNums[priceNums.length - 1];
  let priceRange: string;
  if (priceNums.length === 3) {
    priceRange = `${priceNums[0].toFixed(2)}-${priceNums[1].toFixed(2)}`;
  } else {
    // 2 prices: could be range+avg or just single+avg (when both same)
    priceRange = priceNums[0] === avgPrice
      ? avgPrice.toFixed(2)
      : `${priceNums[0].toFixed(2)}-${avgPrice.toFixed(2)}`;
    // If 2 different numbers, first is low price of range, but we lost the high
    // In "252.00-258.00255.49" the regex finds 252.00, 258.00255 (nope, 258.00, 255.49)
    // Actually let's re-check: "252.00-258.00255.49" → matches: 252.00, 258.00, 255.49 → 3 nums ✓
    // "220.00220.00" → matches: 220.00, 220.00 → priceRange = 220.00 ✓
  }

  // Parse integer part: HEAD + WT_LOW + "-" + WT_HIGH + AVG_WT
  const hyphenIdx = integerPart.indexOf("-");
  if (hyphenIdx === -1) return null;

  const beforeHyphen = integerPart.slice(0, hyphenIdx);
  const afterHyphen = integerPart.slice(hyphenIdx + 1);

  if (!afterHyphen || !beforeHyphen) return null;

  // afterHyphen = WT_HIGH + AVG_WT (both concatenated)
  // They're typically the same digit count. Split in half.
  const afterLen = afterHyphen.length;
  const halfLen = Math.floor(afterLen / 2);

  // Try different splits and pick best
  let bestSplit = halfLen;
  let bestScore = Infinity;
  for (const s of [halfLen, halfLen + 1, halfLen - 1].filter(x => x > 0 && x < afterLen)) {
    const wh = parseInt(afterHyphen.slice(0, s));
    const aw = parseInt(afterHyphen.slice(s));
    if (isNaN(wh) || isNaN(aw) || wh === 0 || aw === 0) continue;
    const score = Math.abs(aw - wh);
    if (score < bestScore) { bestScore = score; bestSplit = s; }
  }

  const wtHigh = afterHyphen.slice(0, bestSplit);
  const avgWt = parseInt(afterHyphen.slice(bestSplit));

  // HEAD and WT_LOW from beforeHyphen
  const wtHighLen = wtHigh.length;
  if (wtHighLen >= beforeHyphen.length) return null;
  const wtLow = beforeHyphen.slice(-wtHighLen);
  const headStr = beforeHyphen.slice(0, -wtHighLen);

  if (!headStr || isNaN(parseInt(headStr))) return null;

  const head = parseInt(headStr);
  const wtRange = `${wtLow}-${wtHigh}`;

  // Sanity checks
  if (head < 1 || head > 5000) return null;
  if (avgWt < 30 || avgWt > 5000) return null;
  if (avgPrice < 1 || avgPrice > 50000) return null;

  return { head, wtRange, avgWt, priceRange, avgPrice, dressing };
}

function parseCategories(text: string): CategoryData[] {
  const categories: CategoryData[] = [];
  let currentSection = "SLAUGHTER CATTLE";

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
    if (!line || line.startsWith("Head") || line.startsWith("Source:") || line.startsWith("Page ")) continue;

    // Check for section headers
    for (const header of sectionHeaders) {
      if (line === header || line.startsWith(header)) {
        currentSection = header;
      }
    }

    // Match category headers
    const catMatch = line.match(
      /^((?:DAIRY\s+)?(?:BEEF\/DAIRY\s+)?(?:STEERS|HEIFERS|COWS|BULLS|DAIRY COWS|DAIRY BULLS|DAIRY STEERS|DAIRY HEIFERS))\s*-\s*(.+?)\s*\(Per\s+Cwt/
    );
    if (catMatch) {
      currentCategory = `${catMatch[1]} - ${catMatch[2].trim()}`;
      continue;
    }

    // Only try parsing lines that start with a digit
    if (!/^\d/.test(line)) continue;
    if (!currentCategory) continue;

    const parsed = parseConcatenatedDataRow(line);
    if (parsed) {
      const isBeefCross = parsed.dressing === "Beef Cross";
      categories.push({
        category: currentCategory + (isBeefCross ? " (Beef Cross)" : ""),
        section: currentSection,
        head: parsed.head,
        wtRange: parsed.wtRange,
        avgWt: parsed.avgWt,
        priceRange: parsed.priceRange,
        avgPrice: parsed.avgPrice,
        dressing: isBeefCross ? "Average" : parsed.dressing,
      });
    }
  }

  return categories;
}

// ─── Hay Report Parsing ───

function parseHayCategories(text: string): CategoryData[] {
  const categories: CategoryData[] = [];
  let currentSection = "HAY";
  let currentCategory = "";

  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Detect section switch
    if (line.startsWith("Straw")) {
      currentSection = "STRAW";
      continue;
    }
    if (line.startsWith("Hay (") || line.startsWith("Hay Auction")) {
      currentSection = "HAY";
      continue;
    }

    // Match hay category headers like "Alfalfa - Premium  (Per Ton)"
    const catMatch = line.match(/^(.+?)\s+\(Per Ton\)$/);
    if (catMatch) {
      currentCategory = catMatch[1].trim();
      // For straw categories like "Corn Stalk -  (Per Ton)" or "Wheat -  (Per Ton)"
      currentCategory = currentCategory.replace(/\s*-\s*$/, "");
      if (currentSection === "STRAW" && currentCategory === "Wheat") {
        currentCategory = "Wheat Straw";
      } else if (currentSection === "STRAW" && currentCategory === "Corn Stalk") {
        currentCategory = "Corn Stalk";
      }
      continue;
    }

    // Skip sub-headers
    if (line.startsWith("Qty") || line.startsWith("Large") || line.startsWith("Small") || line.startsWith("Round")) {
      // This might be a bale type line followed by data on the same line
      // Format: "Large Square 3x413.66290.00-315.00305.92"
      // or: "Large Square17.39150.00-190.00163.65"
    }

    if (!currentCategory) continue;

    // Strip bale type prefix to get clean numeric data
    // Lines look like: "Large Square 3x413.66290.00-315.00305.92"
    let baleType = "Large Square";
    let numericPart = line;

    const baleMatch = line.match(/^(Large Square\s*3x4|Large Square|Small Square|Round Bale)\s*/i);
    if (baleMatch) {
      baleType = baleMatch[1].trim();
      numericPart = line.slice(baleMatch[0].length);
    }

    if (!/^\d/.test(numericPart)) continue;

    // Now parse: "13.66290.00-315.00305.92" (qty + range + avg)
    // or: "3.38330.00330.00" (qty + single price + avg)
    // or: "7.12220.00220.00" (qty + single price + avg)

    // Range pattern: qty then low-high then avg
    const rangeMatch = numericPart.match(/^(\d+\.?\d*?)(\d{2,3}\.\d{2})-(\d{2,3}\.\d{2})(\d{2,3}\.\d{2})/);
    if (rangeMatch) {
      const qty = parseFloat(rangeMatch[1]);
      const priceLow = parseFloat(rangeMatch[2]);
      const priceHigh = parseFloat(rangeMatch[3]);
      const avgPrice = parseFloat(rangeMatch[4]);

      if (avgPrice >= 50 && avgPrice <= 1000 && qty > 0 && qty < 500) {
        categories.push({
          category: currentCategory,
          section: currentSection,
          head: Math.round(qty),
          wtRange: baleType,
          avgWt: 0,
          priceRange: `${priceLow.toFixed(2)}-${priceHigh.toFixed(2)}`,
          avgPrice: avgPrice,
          dressing: "Per Ton",
        });
        continue;
      }
    }

    // Single price pattern: qty then price twice (same value)
    const singleMatch = numericPart.match(/^(\d+\.?\d*?)(\d{2,3}\.\d{2})(\d{2,3}\.\d{2})$/);
    if (singleMatch) {
      const qty = parseFloat(singleMatch[1]);
      const price1 = parseFloat(singleMatch[2]);
      const price2 = parseFloat(singleMatch[3]);

      if (price1 >= 50 && price1 <= 1000 && qty > 0 && qty < 500) {
        categories.push({
          category: currentCategory,
          section: currentSection,
          head: Math.round(qty),
          wtRange: baleType,
          avgWt: 0,
          priceRange: price1.toFixed(2),
          avgPrice: price2,
          dressing: "Per Ton",
        });
      }
    }
  }

  return categories;
}

function parseHayReceipts(text: string): { total: number; lastWeek: number; lastYear: number } {
  const result = { total: 0, lastWeek: 0, lastYear: 0 };

  // PDF concatenates columns: "Total132249258" means 132, 249, 258
  // Hay totals are typically 2-4 digits each (tons, not head)
  const totalMatch = text.match(/Total\s*(\d+)/);
  if (totalMatch) {
    const raw = totalMatch[1];
    // Try splitting into three roughly equal parts
    const len = raw.length;
    // Each number is typically 2-3 digits for hay tonnage
    const partLen = Math.ceil(len / 3);

    // Try all reasonable splits and pick the one where numbers are most balanced
    let bestSplit: [number, number, number] = [0, 0, 0];
    let bestScore = Infinity;

    for (let i = 1; i <= Math.min(4, len - 2); i++) {
      for (let j = i + 1; j <= Math.min(i + 4, len - 1); j++) {
        const a = parseInt(raw.slice(0, i));
        const b = parseInt(raw.slice(i, j));
        const c = parseInt(raw.slice(j));
        if (isNaN(a) || isNaN(b) || isNaN(c)) continue;
        // All should be reasonable tonnage values (1-999)
        if (a < 1 || a > 999 || b < 1 || b > 999 || c < 1 || c > 999) continue;
        // Prefer splits where digit counts are similar
        const digitScore = Math.abs(i - (j - i)) + Math.abs((j - i) - (len - j));
        if (digitScore < bestScore) {
          bestScore = digitScore;
          bestSplit = [a, b, c];
        }
      }
    }

    result.total = bestSplit[0];
    result.lastWeek = bestSplit[1];
    result.lastYear = bestSplit[2];
  }

  return result;
}

function parseHayReport(text: string): ParsedReport {
  const reportDate = parseReportDate(text);
  const receipts = parseHayReceipts(text);
  const categories = parseHayCategories(text);

  return {
    reportDate,
    totalReceipts: receipts.total,
    lastWeekReceipts: receipts.lastWeek,
    lastYearReceipts: receipts.lastYear,
    categories,
    marketCommentary: "", // hay reports don't include narrative commentary
  };
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

export async function fetchAndParseHayAuction(barn: AuctionBarn): Promise<AuctionEntry> {
  console.log(`🌾 Fetching ${barn.name}...`);
  const pdfParse = await getPdfParse();
  const buffer = await fetchPdf(barn.pdfUrl);
  const pdf = await pdfParse(buffer);
  const parsed = parseHayReport(pdf.text);

  console.log(`  📊 Date: ${parsed.reportDate}, Tons: ${parsed.totalReceipts}, Categories: ${parsed.categories.length}`);

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

  // Fetch hay auctions
  for (const hayBarn of HAY_BARNS) {
    try {
      const entry = await fetchAndParseHayAuction(hayBarn);
      await storeAuctionData(entry);
      entries.push(entry);
      console.log(`  ✅ Stored ${hayBarn.shortName}: ${entry.categories.length} categories, ${entry.totalReceipts} tons`);
    } catch (err) {
      console.error(`  ❌ Failed to fetch ${hayBarn.shortName}: ${(err as Error).message}`);
    }
  }

  return entries;
}
