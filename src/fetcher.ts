// BarnSignal — USDA MARS API Fetcher
// Fetches structured auction data from the MARS v1.2 API
// Replaces the old PDF fetch+parse pipeline with direct JSON data

import { BARNS, PA_WEEKLY_SUMMARY, HAY_BARNS, type AuctionBarn } from "./config.js";
import { storeAuctionData, type AuctionEntry, type CategoryData } from "./redis.js";

const MARS_API_BASE = "https://marsapi.ams.usda.gov/services/v1.2/reports";

function getMarsApiKey(): string {
  const key = process.env.MARS_API_KEY;
  if (!key) throw new Error("Missing MARS_API_KEY environment variable");
  return key;
}

// ─── API Fetching ───

interface MarsApiResponse {
  stats: { returnedRows: number; userAllowedRows: number; totalRows: number };
  results: Record<string, any>[];
  reportSection?: string;
  reportSections?: string[];
}

async function fetchMarsApi(
  reportId: number,
  dateRange?: { begin: string; end: string },
): Promise<MarsApiResponse> {
  const apiKey = getMarsApiKey();
  let url = `${MARS_API_BASE}/${reportId}`;

  if (dateRange) {
    url += `?q=report_begin_date=${dateRange.begin}:${dateRange.end}`;
  }

  const resp = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
    },
  });

  if (!resp.ok) {
    throw new Error(`MARS API error for report ${reportId}: ${resp.status} ${resp.statusText}`);
  }

  return resp.json() as Promise<MarsApiResponse>;
}

// ─── Date Helpers ───

function todayMMDDYYYY(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

function daysAgoMMDDYYYY(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Convert MM/DD/YYYY to YYYY-MM-DD */
function toISODate(mmddyyyy: string): string {
  const parts = mmddyyyy.split("/");
  if (parts.length !== 3) return mmddyyyy;
  return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
}

// ─── Cattle Data Mapping ───

/** Group API rows by report_date and transform to AuctionEntry */
function mapCattleApiToEntries(
  barn: AuctionBarn | { reportId: number; name: string; pdfUrl?: string },
  results: Record<string, any>[],
): AuctionEntry[] {
  // Group by report_date
  const byDate = new Map<string, Record<string, any>[]>();
  for (const row of results) {
    const date = row.report_date as string;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(row);
  }

  const entries: AuctionEntry[] = [];

  for (const [dateStr, rows] of byDate) {
    const isoDate = toISODate(dateStr);
    const categories: CategoryData[] = [];

    for (const row of rows) {
      const commodity = (row.commodity || "") as string;
      const cls = (row.class || "") as string;
      const qualityGrade = (row.quality_grade_name || "N/A") as string;
      const dressing = (row.dressing || "Average") as string;
      const frameGrade = (row.frame || "N/A") as string;
      const muscleGrade = (row.muscle_grade || "N/A") as string;

      // Build category name to match existing format
      // e.g. "STEERS - Choice 2-3", "DAIRY COWS - Breaker 75-80%"
      let categoryName = cls.toUpperCase();
      if (qualityGrade && qualityGrade !== "N/A") {
        categoryName += ` - ${qualityGrade}`;
      }
      if (frameGrade && frameGrade !== "N/A" && muscleGrade && muscleGrade !== "N/A") {
        categoryName += ` ${frameGrade}`;
      }

      // Determine section from commodity
      let section = "SLAUGHTER CATTLE";
      if (commodity.includes("Feeder") && commodity.includes("Dairy")) {
        section = "FEEDER DAIRY CALVES";
      } else if (commodity.includes("Feeder")) {
        section = "FEEDER CATTLE";
      } else if (commodity.includes("Replacement")) {
        section = "REPLACEMENT CATTLE";
      }

      const avgPriceMin = parseFloat(row.avg_price_min) || 0;
      const avgPriceMax = parseFloat(row.avg_price_max) || 0;
      const avgPrice = parseFloat(row.avg_price) || 0;
      const avgWt = parseFloat(row.avg_weight) || 0;
      const headCount = parseInt(row.head_count) || 0;
      const wtMin = parseInt(row.avg_weight_min) || 0;
      const wtMax = parseInt(row.avg_weight_max) || 0;

      if (avgPrice <= 0 || headCount <= 0) continue;

      const priceRange = avgPriceMin === avgPriceMax
        ? avgPrice.toFixed(2)
        : `${avgPriceMin.toFixed(2)}-${avgPriceMax.toFixed(2)}`;

      const wtRange = wtMin === wtMax
        ? `${wtMin}`
        : `${wtMin}-${wtMax}`;

      categories.push({
        category: categoryName,
        section,
        head: headCount,
        wtRange,
        avgWt,
        priceRange,
        avgPrice,
        dressing,
      });
    }

    // Get receipts from first row (same across all rows for a date)
    const firstRow = rows[0];
    const receipts = parseInt(firstRow.receipts) || 0;
    const receiptsWeekAgo = parseInt(firstRow.receipts_week_ago) || 0;
    const receiptsYearAgo = parseInt(firstRow.receipts_year_ago) || 0;
    const commentary = (firstRow.report_narrative || "") as string;

    const shortName = "shortName" in barn ? (barn as AuctionBarn).shortName : barn.name;
    const location = "location" in barn ? (barn as AuctionBarn).location : "Pennsylvania";

    entries.push({
      reportId: barn.reportId,
      barnName: shortName,
      location,
      reportDate: isoDate,
      fetchedAt: new Date().toISOString(),
      totalReceipts: receipts,
      lastWeekReceipts: receiptsWeekAgo,
      lastYearReceipts: receiptsYearAgo,
      categories,
      marketCommentary: commentary,
    });
  }

  // Sort newest first
  return entries.sort((a, b) => b.reportDate.localeCompare(a.reportDate));
}

// ─── Hay Data Mapping ───

function mapHayApiToEntries(
  barn: AuctionBarn,
  results: Record<string, any>[],
): AuctionEntry[] {
  const byDate = new Map<string, Record<string, any>[]>();
  for (const row of results) {
    // Hay API uses "report_Date" (capital D) instead of "report_date"
    const date = (row.report_Date || row.report_date) as string;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(row);
  }

  const entries: AuctionEntry[] = [];

  for (const [dateStr, rows] of byDate) {
    const isoDate = toISODate(dateStr);
    const categories: CategoryData[] = [];

    for (const row of rows) {
      const cls = (row.class || "") as string;
      const quality = (row.quality || "") as string;
      const pkg = (row.pkg || "") as string;
      const commodity = (row.commodity || "") as string;

      // Build category name: "Alfalfa - Premium", "Grass - Good", etc.
      let categoryName = cls;
      if (quality) {
        categoryName += ` - ${quality}`;
      }
      // For straw, use commodity as section marker
      const isStraw = commodity.toLowerCase() === "straw" ||
        (row.category || "").toLowerCase() === "straw";
      const section = isStraw ? "STRAW" : "HAY";

      // For straw categories: "Wheat Straw", "Corn Stalk", etc.
      if (isStraw) {
        categoryName = cls;
        if (cls === "Wheat") categoryName = "Wheat Straw";
      }

      const minPrice = parseFloat(row.min_Price || row.min_price) || 0;
      const maxPrice = parseFloat(row.max_Price || row.max_price) || 0;
      const avgPrice = parseFloat(row.average_Price || row.average_price) || 0;
      const qty = parseFloat(row.current_Quantity || row.current_quantity) || 0;

      if (avgPrice <= 0) continue;

      const priceRange = minPrice === maxPrice
        ? avgPrice.toFixed(2)
        : `${minPrice.toFixed(2)}-${maxPrice.toFixed(2)}`;

      categories.push({
        category: categoryName,
        section,
        head: Math.round(qty), // tons, stored in head field
        wtRange: pkg, // bale type stored in wtRange
        avgWt: 0,
        priceRange,
        avgPrice,
        dressing: "Per Ton",
      });
    }

    // Hay reports: calculate total tonnage from categories
    const totalTons = categories.reduce((sum, c) => sum + c.head, 0);
    const commentary = (rows[0]?.report_narrative || "") as string;

    entries.push({
      reportId: barn.reportId,
      barnName: barn.shortName,
      location: barn.location,
      reportDate: isoDate,
      fetchedAt: new Date().toISOString(),
      totalReceipts: totalTons,
      lastWeekReceipts: 0,
      lastYearReceipts: 0,
      categories,
      marketCommentary: commentary,
    });
  }

  return entries.sort((a, b) => b.reportDate.localeCompare(a.reportDate));
}

// ─── Main Fetch Functions ───

/** Fetch the latest auction data for a cattle barn (last 14 days) */
export async function fetchAndParseAuction(barn: AuctionBarn): Promise<AuctionEntry> {
  console.log(`📥 Fetching ${barn.name} via MARS API...`);
  const data = await fetchMarsApi(barn.reportId, {
    begin: daysAgoMMDDYYYY(14),
    end: todayMMDDYYYY(),
  });

  const entries = mapCattleApiToEntries(barn, data.results);
  if (entries.length === 0) {
    throw new Error(`No recent data for ${barn.name}`);
  }

  const latest = entries[0]; // newest first
  console.log(`  📊 Date: ${latest.reportDate}, Receipts: ${latest.totalReceipts}, Categories: ${latest.categories.length}`);
  return latest;
}

/** Fetch the latest hay auction data (last 14 days) */
export async function fetchAndParseHayAuction(barn: AuctionBarn): Promise<AuctionEntry> {
  console.log(`🌾 Fetching ${barn.name} via MARS API...`);
  const data = await fetchMarsApi(barn.reportId, {
    begin: daysAgoMMDDYYYY(14),
    end: todayMMDDYYYY(),
  });

  const entries = mapHayApiToEntries(barn, data.results);
  if (entries.length === 0) {
    throw new Error(`No recent data for ${barn.name}`);
  }

  const latest = entries[0];
  console.log(`  📊 Date: ${latest.reportDate}, Tons: ${latest.totalReceipts}, Categories: ${latest.categories.length}`);
  return latest;
}

/** Fetch all barns — latest data */
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

  // PA Weekly Summary
  try {
    console.log(`📥 Fetching PA Weekly Summary via MARS API...`);
    const data = await fetchMarsApi(PA_WEEKLY_SUMMARY.reportId, {
      begin: daysAgoMMDDYYYY(14),
      end: todayMMDDYYYY(),
    });

    const summaryBarn = {
      reportId: PA_WEEKLY_SUMMARY.reportId,
      name: PA_WEEKLY_SUMMARY.name,
      shortName: "PA Weekly Summary",
      location: "Pennsylvania",
    };

    const allEntries = mapCattleApiToEntries(summaryBarn as any, data.results);
    if (allEntries.length > 0) {
      const latest = allEntries[0];
      await storeAuctionData(latest);
      entries.push(latest);
      console.log(`  ✅ Stored PA Weekly Summary: ${latest.categories.length} categories, ${latest.totalReceipts} head`);
    }
  } catch (err) {
    console.error(`  ❌ Failed to fetch PA Weekly Summary: ${(err as Error).message}`);
  }

  // Hay auctions
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

// ─── Historical Backfill ───

/** Fetch and store historical data for a barn across a date range */
export async function backfillBarn(
  barn: AuctionBarn,
  beginDate: string,  // MM/DD/YYYY
  endDate: string,    // MM/DD/YYYY
  isHay: boolean = false,
): Promise<number> {
  console.log(`📜 Backfilling ${barn.name} from ${beginDate} to ${endDate}...`);

  const data = await fetchMarsApi(barn.reportId, { begin: beginDate, end: endDate });
  console.log(`  📊 API returned ${data.stats.totalRows} rows`);

  const entries = isHay
    ? mapHayApiToEntries(barn, data.results)
    : mapCattleApiToEntries(barn, data.results);

  let stored = 0;
  for (const entry of entries) {
    await storeAuctionData(entry);
    stored++;
  }

  console.log(`  ✅ Stored ${stored} auction dates for ${barn.shortName}`);
  return stored;
}

/** Backfill all barns with available historical data */
export async function backfillAll(
  beginDate: string = "01/01/2023",
  endDate: string = todayMMDDYYYY(),
): Promise<void> {
  console.log(`\n📜 BarnSignal Historical Backfill: ${beginDate} → ${endDate}\n`);
  let totalDates = 0;

  // Cattle barns
  for (const barn of BARNS) {
    try {
      const count = await backfillBarn(barn, beginDate, endDate, false);
      totalDates += count;
    } catch (err) {
      console.error(`  ❌ Backfill failed for ${barn.shortName}: ${(err as Error).message}`);
    }
  }

  // PA Weekly Summary
  try {
    const summaryBarn = {
      reportId: PA_WEEKLY_SUMMARY.reportId,
      name: PA_WEEKLY_SUMMARY.name,
      shortName: "PA Weekly Summary",
      location: "Pennsylvania",
      lat: 40.0, lng: -76.3,
      auctionDays: ["Weekly"],
      categories: ["slaughter_cattle"],
      pdfUrl: "",
    } as AuctionBarn;
    const count = await backfillBarn(summaryBarn, beginDate, endDate, false);
    totalDates += count;
  } catch (err) {
    console.error(`  ❌ Backfill failed for PA Weekly Summary: ${(err as Error).message}`);
  }

  // Hay barns
  for (const hayBarn of HAY_BARNS) {
    try {
      const count = await backfillBarn(hayBarn, beginDate, endDate, true);
      totalDates += count;
    } catch (err) {
      console.error(`  ❌ Backfill failed for ${hayBarn.shortName}: ${(err as Error).message}`);
    }
  }

  console.log(`\n🏁 Backfill complete. Stored ${totalDates} total auction dates.`);
}
