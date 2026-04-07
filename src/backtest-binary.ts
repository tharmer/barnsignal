// BarnSignal — Binary Backtest: 21 features (CME) vs 33 features (CME + Cultural Calendar)
// Tests whether cultural calendar features help or hurt live prediction accuracy
// Uses the SAME binary classification + ±0.5% thresholds as production predictor.ts
// Run: MARS_API_KEY=xxx npx tsx src/backtest-binary.ts

import "dotenv/config";
import { RandomForestClassifier } from "ml-random-forest";

const MARS_API_BASE = "https://marsapi.ams.usda.gov/services/v1.2/reports";

function getMarsApiKey(): string {
  const key = process.env.MARS_API_KEY;
  if (!key) throw new Error("Missing MARS_API_KEY");
  return key;
}

// ─── Types ───

interface AuctionSnapshot {
  date: string;
  categories: Map<string, { avgPrice: number; head: number }>;
  totalReceipts: number;
  lastYearReceipts: number;
}

interface FuturesDataPoint {
  date: string;
  liveClose: number;
  feederClose: number;
}

interface PricePoint {
  date: string;
  price: number;
  receipts: number;
  lastYearReceipts: number;
}

interface BacktestResult {
  date: string;
  barn: string;
  category: string;
  predictedDirection: "up" | "down";
  actualDirection: "up" | "down";
  confidence: number;
  currentPrice: number;
  nextPrice: number;
  priceChange: number;
  correct: boolean;
  featureSet: "21-cme" | "33-cme-cultural";
}

// ─── CME Futures Fetch ───

function getWeekKey(d: Date): string {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().split("T")[0];
}

function getWeekKeyFromDate(dateStr: string): string {
  return getWeekKey(new Date(dateStr));
}

async function fetchCMEFutures(): Promise<Map<string, FuturesDataPoint>> {
  console.log("📈 Fetching CME futures data...");
  const lookup = new Map<string, FuturesDataPoint>();
  try {
    const fetchSymbol = async (symbol: string) => {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=3y&interval=1wk`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BarnSignal/1.0)" },
      });
      if (!resp.ok) throw new Error(`Yahoo Finance ${symbol}: ${resp.status}`);
      const data = (await resp.json()) as any;
      const result = data.chart.result[0];
      return {
        timestamps: result.timestamp as number[],
        closes: result.indicators.quote[0].close as number[],
      };
    };

    const [live, feeder] = await Promise.all([fetchSymbol("LE=F"), fetchSymbol("GF=F")]);

    const liveByWeek = new Map<string, number>();
    for (let i = 0; i < live.timestamps.length; i++) {
      if (live.closes[i] != null)
        liveByWeek.set(getWeekKey(new Date(live.timestamps[i] * 1000)), live.closes[i]);
    }
    const feederByWeek = new Map<string, number>();
    for (let i = 0; i < feeder.timestamps.length; i++) {
      if (feeder.closes[i] != null)
        feederByWeek.set(getWeekKey(new Date(feeder.timestamps[i] * 1000)), feeder.closes[i]);
    }

    for (const week of new Set([...liveByWeek.keys(), ...feederByWeek.keys()])) {
      const livePrice = liveByWeek.get(week);
      const feederPrice = feederByWeek.get(week);
      if (livePrice && feederPrice) {
        lookup.set(week, { date: week, liveClose: livePrice, feederClose: feederPrice });
      }
    }
    console.log(`  ✅ ${lookup.size} weeks of LE=F + GF=F data`);
  } catch (err) {
    console.warn(`  ⚠️ CME fetch failed: ${(err as Error).message}`);
  }
  return lookup;
}

// ─── MARS API Fetch ───

async function fetchReportData(reportId: number, begin: string, end: string) {
  const apiKey = getMarsApiKey();
  const url = `${MARS_API_BASE}/${reportId}?q=report_begin_date=${begin}:${end}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}` },
  });
  if (!resp.ok) throw new Error(`API error ${reportId}: ${resp.status}`);
  const data = (await resp.json()) as any;
  return (data.results || []) as Record<string, any>[];
}

// ─── Data Transform ───

function toISODate(mmddyyyy: string): string {
  const parts = mmddyyyy.split("/");
  return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
}

function buildSnapshots(results: Record<string, any>[], isHay: boolean): AuctionSnapshot[] {
  const byDate = new Map<string, Record<string, any>[]>();
  for (const row of results) {
    const rawDate = (row.report_Date || row.report_date) as string;
    const date = toISODate(rawDate);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(row);
  }

  const snapshots: AuctionSnapshot[] = [];
  for (const [date, rows] of byDate) {
    const categories = new Map<string, { avgPrice: number; head: number }>();
    for (const row of rows) {
      let categoryName: string;
      let dressing: string;
      if (isHay) {
        const cls = (row.class || "") as string;
        const quality = (row.quality || "") as string;
        categoryName = quality ? `${cls} - ${quality}` : cls;
        dressing = "Per Ton";
        const commodity = (row.commodity || "").toLowerCase();
        const cat = (row.category || "").toLowerCase();
        if (commodity === "straw" || cat === "straw") {
          categoryName = cls === "Wheat" ? "Wheat Straw" : cls;
        }
      } else {
        const cls = (row.class || "") as string;
        const qualityGrade = (row.quality_grade_name || "N/A") as string;
        const frameGrade = (row.frame || "N/A") as string;
        dressing = (row.dressing || "Average") as string;
        categoryName = cls.toUpperCase();
        if (qualityGrade && qualityGrade !== "N/A") categoryName += ` - ${qualityGrade}`;
        if (frameGrade && frameGrade !== "N/A") categoryName += ` ${frameGrade}`;
      }
      const avgPrice = parseFloat(isHay ? (row.average_Price || row.average_price) : row.avg_price) || 0;
      const head = parseInt(isHay ? (row.current_Quantity || row.current_quantity) : row.head_count) || 0;
      if (avgPrice <= 0) continue;
      if (!isHay && dressing !== "Average") continue;
      if (!categories.has(categoryName) || categories.get(categoryName)!.head < head) {
        categories.set(categoryName, { avgPrice, head });
      }
    }
    const firstRow = rows[0];
    snapshots.push({
      date,
      categories,
      totalReceipts: parseInt(firstRow.receipts || "0") || 0,
      lastYearReceipts: parseInt(firstRow.receipts_year_ago || "0") || 0,
    });
  }
  return snapshots.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Cultural Calendar Engine (copied from predictor.ts) ───

function computeEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getAmishHolidays(year: number): Date[] {
  const easter = computeEaster(year);
  const addDays = (d: Date, n: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  };
  const nov1 = new Date(year, 10, 1);
  const firstThu = ((4 - nov1.getDay() + 7) % 7) + 1;
  return [
    addDays(easter, -2),
    addDays(easter, 1),
    addDays(easter, 39),
    addDays(easter, 50),
    new Date(year, 10, firstThu + 21),
    new Date(year, 11, 25),
    new Date(year, 11, 26),
    new Date(year, 0, 1),
  ];
}

function extractCulturalFeatures(dateStr: string): number[] {
  const d = new Date(dateStr);
  const month = d.getMonth();
  const day = d.getDate();
  const dow = d.getDay();
  const year = d.getFullYear();

  let weddingSeason = 0, weddingIntensity = 0;
  if (month === 10) { weddingSeason = 1; weddingIntensity = 1.0; }
  else if (month === 9 && day >= 15) { weddingSeason = 1; weddingIntensity = 0.5; }
  else if (month === 11 && day <= 15) { weddingSeason = 1; weddingIntensity = 0.6; }
  const weddingDay = weddingSeason * (dow === 2 ? 0.56 : dow === 4 ? 0.44 : 0);

  let mudSeason = 0, mudIntensity = 0;
  if (month === 2) { mudSeason = 1; mudIntensity = 0.8; }
  else if (month === 3) { mudSeason = 1; mudIntensity = 1.0; }
  else if (month === 4 && day <= 15) { mudSeason = 1; mudIntensity = 0.5; }
  else if (month === 1 && day >= 20) { mudSeason = 1; mudIntensity = 0.3; }

  let fairIntensity = 0;
  if (month === 7 && day >= 15) fairIntensity = 0.6;
  else if (month === 8) fairIntensity = 1.0;
  else if (month === 9 && day <= 15) fairIntensity = 0.7;

  let harvest = 0;
  if (month === 7) harvest = 0.7;
  else if (month === 8) harvest = 1.0;
  else if (month === 9) harvest = 0.8;

  let hunting = 0, rifleWeek = 0;
  if ((month === 9 && day >= 5) || (month === 10 && day <= 16)) hunting = 0.5;
  if (month === 10 && day >= 1 && day <= 22) hunting = 0.7;
  if ((month === 10 && day >= 25) || (month === 11 && day <= 10)) { hunting = 1.0; rifleWeek = 1; }

  const holidays = [...getAmishHolidays(year - 1), ...getAmishHolidays(year), ...getAmishHolidays(year + 1)];
  const ms = d.getTime();
  let minDays = 365;
  for (const h of holidays) {
    const diff = Math.abs(ms - h.getTime()) / 86400000;
    if (diff < minDays) minDays = diff;
  }
  const isHolidayWeek = minDays <= 3 ? 1 : 0;
  const holidayProximity = Math.min(minDays, 30) / 30;

  const farmShow = (month === 0 && day >= 7 && day <= 17) ? 1 : 0;

  return [
    weddingSeason, weddingDay, weddingIntensity,
    mudSeason, mudIntensity,
    fairIntensity, harvest,
    hunting, rifleWeek,
    isHolidayWeek, holidayProximity,
    farmShow,
  ];
}

// ─── Feature Extraction ───

// 21-feature set (base + CME, no cultural) — matches backtest-ml-cme.ts
function extractFeatures21(
  history: PricePoint[],
  isHay: boolean,
  futuresLookup: Map<string, FuturesDataPoint>,
): number[] | null {
  if (history.length < 4) return null;
  const current = history[history.length - 1];
  const prev1 = history[history.length - 2];
  const prev2 = history[history.length - 3];
  const prices = history.map((h) => h.price);
  const receipts = history.map((h) => h.receipts);

  const wow = ((current.price - prev1.price) / prev1.price) * 100;
  const twoWeek = ((current.price - prev2.price) / prev2.price) * 100;
  const fourWeek = history.length >= 5
    ? ((current.price - history[history.length - 5].price) / history[history.length - 5].price) * 100
    : twoWeek;
  const ma = prices.reduce((s, p) => s + p, 0) / prices.length;
  const meanReversionSignal = ((current.price - ma) / ma) * 100;
  const priceStd = Math.sqrt(prices.reduce((s, p) => s + (p - ma) ** 2, 0) / prices.length);
  const volatility = ma > 0 ? (priceStd / ma) * 100 : 0;
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const pricePosition = maxPrice > minPrice ? (current.price - minPrice) / (maxPrice - minPrice) : 0.5;
  const recentChange = ((current.price - prev1.price) / prev1.price) * 100;
  const priorChange = ((prev1.price - prev2.price) / prev2.price) * 100;
  const acceleration = recentChange - priorChange;

  const receiptChange = prev1.receipts > 0 ? ((current.receipts - prev1.receipts) / prev1.receipts) * 100 : 0;
  const yoyReceipts = current.lastYearReceipts > 0 ? ((current.receipts - current.lastYearReceipts) / current.lastYearReceipts) * 100 : 0;
  const recentReceipts = receipts.slice(-3);
  const avgReceipts = recentReceipts.reduce((s, r) => s + r, 0) / recentReceipts.length;
  const receiptTrend = avgReceipts > 0 ? ((current.receipts - avgReceipts) / avgReceipts) * 100 : 0;

  const month = new Date(current.date).getMonth();
  const monthSin = Math.sin((2 * Math.PI * month) / 12);
  const monthCos = Math.cos((2 * Math.PI * month) / 12);
  const hayFlag = isHay ? 1 : 0;

  let consecutiveUp = 0, consecutiveDown = 0;
  for (let i = prices.length - 1; i > 0; i--) {
    if (prices[i] > prices[i - 1] * 1.005) consecutiveUp++;
    else break;
  }
  for (let i = prices.length - 1; i > 0; i--) {
    if (prices[i] < prices[i - 1] * 0.995) consecutiveDown++;
    else break;
  }
  const directionPersistence = consecutiveUp - consecutiveDown;

  const fourWeekPrices = prices.slice(-4);
  const fourWeekHigh = Math.max(...fourWeekPrices);
  const fourWeekLow = Math.min(...fourWeekPrices);
  const highLowRatio = fourWeekHigh > fourWeekLow
    ? (current.price - fourWeekLow) / (fourWeekHigh - fourWeekLow)
    : 0.5;

  // CME features
  const currentWeek = getWeekKeyFromDate(current.date);
  const prevWeek = getWeekKeyFromDate(prev1.date);
  const currentFutures = futuresLookup.get(currentWeek);
  const prevFutures = futuresLookup.get(prevWeek);

  let basis = 0, basisChange = 0, futuresMomentum = 0;
  let feederLiveSpread = 0, feederLiveSpreadChange = 0, cashFuturesRatio = 0;

  if (currentFutures) {
    if (!isHay) {
      basis = current.price - currentFutures.liveClose;
      cashFuturesRatio = currentFutures.liveClose > 0
        ? (current.price / currentFutures.liveClose) * 100 - 100
        : 0;
    }
    feederLiveSpread = currentFutures.feederClose - currentFutures.liveClose;
    if (prevFutures) {
      futuresMomentum = ((currentFutures.liveClose - prevFutures.liveClose) / prevFutures.liveClose) * 100;
      if (!isHay) {
        basisChange = (current.price - currentFutures.liveClose) - (prev1.price - prevFutures.liveClose);
      }
      feederLiveSpreadChange = (currentFutures.feederClose - currentFutures.liveClose) -
        (prevFutures.feederClose - prevFutures.liveClose);
    }
  }

  return [
    wow, twoWeek, fourWeek, meanReversionSignal, volatility, pricePosition, acceleration,
    receiptChange, yoyReceipts, receiptTrend,
    monthSin, monthCos, hayFlag, directionPersistence, highLowRatio,
    basis, basisChange, futuresMomentum, feederLiveSpread, feederLiveSpreadChange, cashFuturesRatio,
  ];
}

// 33-feature set (base + CME + cultural calendar) — matches production predictor.ts
function extractFeatures33(
  history: PricePoint[],
  isHay: boolean,
  futuresLookup: Map<string, FuturesDataPoint>,
): number[] | null {
  const base = extractFeatures21(history, isHay, futuresLookup);
  if (!base) return null;
  const current = history[history.length - 1];
  const cultural = extractCulturalFeatures(current.date);
  return [...base, ...cultural];
}

// ─── Binary Classification (matches production predictor.ts) ───

function classifyDirection(priceChange: number): number | null {
  if (priceChange > 0.5) return 1;  // up
  if (priceChange < -0.5) return 0; // down
  return null; // ambiguous — skip
}

function directionLabel(cls: number): "up" | "down" {
  return cls === 1 ? "up" : "down";
}

// ─── Walk-Forward Binary Backtest ───

async function backtestBarn(
  reportId: number,
  barnName: string,
  trackedCategories: string[],
  isHay: boolean,
  beginDate: string,
  endDate: string,
  futuresLookup: Map<string, FuturesDataPoint>,
): Promise<BacktestResult[]> {
  console.log(`\n📊 Binary backtesting ${barnName} (${reportId})...`);

  const results = await fetchReportData(reportId, beginDate, endDate);
  if (results.length === 0) {
    console.log(`  ⏭️ No data`);
    return [];
  }

  const snapshots = buildSnapshots(results, isHay);
  console.log(`  📅 ${snapshots.length} auction dates`);

  const allResults: BacktestResult[] = [];

  for (const category of trackedCategories) {
    const priceSeries: PricePoint[] = [];
    for (const snap of snapshots) {
      const catData = snap.categories.get(category);
      if (catData) {
        priceSeries.push({
          date: snap.date,
          price: catData.avgPrice,
          receipts: snap.totalReceipts,
          lastYearReceipts: snap.lastYearReceipts,
        });
      }
    }
    if (priceSeries.length < 20) continue;

    const MIN_TRAIN = 12;

    // Run BOTH feature sets on the same data
    for (const featureSet of ["21-cme", "33-cme-cultural"] as const) {
      const extractFn = featureSet === "21-cme" ? extractFeatures21 : extractFeatures33;

      for (let splitIdx = MIN_TRAIN; splitIdx < priceSeries.length - 1; splitIdx++) {
        const trainFeatures: number[][] = [];
        const trainLabels: number[] = [];

        for (let i = 4; i < splitIdx; i++) {
          const window = priceSeries.slice(Math.max(0, i - 8), i + 1);
          const features = extractFn(window, isHay, futuresLookup);
          if (!features) continue;

          const nextPrice = priceSeries[i + 1].price;
          const change = ((nextPrice - priceSeries[i].price) / priceSeries[i].price) * 100;
          const label = classifyDirection(change);
          if (label === null) continue; // Skip ambiguous moves (matches production)
          trainLabels.push(label);
          trainFeatures.push(features);
        }

        if (trainFeatures.length < 8) continue;
        const uniqueLabels = new Set(trainLabels);
        if (uniqueLabels.size < 2) continue;

        const predWindow = priceSeries.slice(Math.max(0, splitIdx - 8), splitIdx + 1);
        const predFeatures = extractFn(predWindow, isHay, futuresLookup);
        if (!predFeatures) continue;

        // Get actual outcome
        const currentPrice = priceSeries[splitIdx].price;
        const nextPrice = priceSeries[splitIdx + 1].price;
        const priceChange = ((nextPrice - currentPrice) / currentPrice) * 100;

        // Skip ambiguous actual moves (matches the resolution dead zone fix)
        const actualLabel = classifyDirection(priceChange);
        if (actualLabel === null) continue;

        try {
          const rf = new RandomForestClassifier({
            nEstimators: 50,
            maxFeatures: 0.7,
            replacement: true,
            seed: reportId + splitIdx,
          });
          rf.train(trainFeatures, trainLabels);

          const prediction = rf.predict([predFeatures])[0];

          const allPredictions = (rf as any).estimators
            ? (rf as any).estimators.map((tree: any) => tree.predict([predFeatures])[0])
            : [];
          const voteCount = allPredictions.filter((p: number) => p === prediction).length;
          const confidence = allPredictions.length > 0
            ? Math.round((voteCount / allPredictions.length) * 100)
            : 50;

          // Skip low-confidence (matches production threshold)
          if (confidence < 40) continue;

          allResults.push({
            date: priceSeries[splitIdx].date,
            barn: barnName,
            category,
            predictedDirection: directionLabel(prediction),
            actualDirection: directionLabel(actualLabel),
            confidence,
            currentPrice,
            nextPrice,
            priceChange,
            correct: prediction === actualLabel,
            featureSet,
          });
        } catch {
          continue;
        }
      }
    }
  }

  const r21 = allResults.filter((r) => r.featureSet === "21-cme");
  const r33 = allResults.filter((r) => r.featureSet === "33-cme-cultural");
  const a21 = r21.length > 0 ? ((r21.filter((r) => r.correct).length / r21.length) * 100).toFixed(1) : "0";
  const a33 = r33.length > 0 ? ((r33.filter((r) => r.correct).length / r33.length) * 100).toFixed(1) : "0";
  console.log(`  ✅ 21-feat: ${r21.length} preds, ${a21}% | 33-feat: ${r33.length} preds, ${a33}%`);

  return allResults;
}

// ─── Main ───

async function main() {
  console.log("🧪 BarnSignal BINARY Backtest — 21 features vs 33 features");
  console.log("Binary classification (up/down) with ±0.5% dead zone");
  console.log("Walk-forward validation, RF(50 trees, 70% max features)\n");

  const futuresLookup = await fetchCMEFutures();

  const cattleBarns = [
    { id: 1908, name: "New Holland (Mon)" },
    { id: 1909, name: "New Holland (Thu)" },
    { id: 1917, name: "Greencastle (Mon)" },
    { id: 1918, name: "Middleburg" },
    { id: 1974, name: "Canandaigua (NY)" },
    { id: 1872, name: "Buckhannon (WV)" },
    { id: 1880, name: "Ripley (WV)" },
  ];

  const cattleCategories = [
    "STEERS - Choice and Prime 3-4",
    "STEERS - Choice 2-3",
    "STEERS - Select 2-3",
    "HEIFERS - Choice and Prime 3-4",
    "HEIFERS - Choice 2-3",
    "DAIRY COWS - Breaker 75-80%",
    "DAIRY COWS - Boner 80-85%",
    "DAIRY COWS - Lean 85-90%",
    "BULLS - 1-2",
    "COWS - Breaker 75-80%",
    "COWS - Boner 80-85%",
  ];

  const hayBarns = [
    { id: 1725, name: "Wolgemuth (Wed)" },
    { id: 1716, name: "Wolgemuth NH (Mon)" },
  ];

  const hayCategories = [
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
  ];

  const allResults: BacktestResult[] = [];

  for (const barn of cattleBarns) {
    try {
      const results = await backtestBarn(
        barn.id, barn.name, cattleCategories, false,
        "01/01/2023", "04/04/2026", futuresLookup,
      );
      allResults.push(...results);
    } catch (err) {
      console.error(`  ❌ ${barn.name}: ${(err as Error).message}`);
    }
  }

  for (const barn of hayBarns) {
    try {
      const results = await backtestBarn(
        barn.id, barn.name, hayCategories, true,
        "01/01/2023", "04/04/2026", futuresLookup,
      );
      allResults.push(...results);
    } catch (err) {
      console.error(`  ❌ ${barn.name}: ${(err as Error).message}`);
    }
  }

  // ─── Analyze Results ───

  console.log("\n" + "═".repeat(80));
  console.log("📈 BINARY BACKTEST: 21 features (CME) vs 33 features (CME + Cultural Calendar)");
  console.log("═".repeat(80));

  for (const fs of ["21-cme", "33-cme-cultural"] as const) {
    const results = allResults.filter((r) => r.featureSet === fs);
    const total = results.length;
    const correct = results.filter((r) => r.correct).length;
    const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : "0";

    console.log(`\n── ${fs === "21-cme" ? "21 features (CME only)" : "33 features (CME + Cultural)"} ──`);
    console.log(`  Total predictions: ${total}`);
    console.log(`  Correct: ${correct} (${accuracy}%)`);
    console.log(`  Random baseline: 50.0% (binary)`);

    // By direction
    for (const dir of ["up", "down"] as const) {
      const predicted = results.filter((r) => r.predictedDirection === dir);
      const predCorrect = predicted.filter((r) => r.correct).length;
      const predAcc = predicted.length > 0 ? ((predCorrect / predicted.length) * 100).toFixed(1) : "0";
      console.log(`  ${dir.toUpperCase().padEnd(6)} calls: ${predicted.length} made, ${predCorrect} correct (${predAcc}%)`);
    }

    // Actual distribution
    const actualUp = results.filter((r) => r.actualDirection === "up").length;
    const actualDown = results.filter((r) => r.actualDirection === "down").length;
    console.log(`  Actual distribution: ${actualUp} up (${((actualUp / total) * 100).toFixed(1)}%), ${actualDown} down (${((actualDown / total) * 100).toFixed(1)}%)`);

    // Cattle vs Hay
    const cattleResults = results.filter((r) => !hayBarns.some((h) => h.name === r.barn));
    const hayResults = results.filter((r) => hayBarns.some((h) => h.name === r.barn));
    const cattleAcc = cattleResults.length > 0
      ? ((cattleResults.filter((r) => r.correct).length / cattleResults.length) * 100).toFixed(1)
      : "0";
    const hayAcc = hayResults.length > 0
      ? ((hayResults.filter((r) => r.correct).length / hayResults.length) * 100).toFixed(1)
      : "0";
    console.log(`  Cattle: ${cattleResults.length} preds, ${cattleAcc}% | Hay: ${hayResults.length} preds, ${hayAcc}%`);

    // By confidence
    for (const { label, min, max } of [
      { label: "High (70%+)", min: 70, max: 101 },
      { label: "Medium (50-69%)", min: 50, max: 70 },
      { label: "Low (40-49%)", min: 40, max: 50 },
    ]) {
      const filtered = results.filter((r) => r.confidence >= min && r.confidence < max);
      const c = filtered.filter((r) => r.correct).length;
      const acc = filtered.length > 0 ? ((c / filtered.length) * 100).toFixed(1) : "0";
      console.log(`  ${label.padEnd(20)} ${filtered.length.toString().padStart(5)} preds | ${acc}% accurate`);
    }
  }

  // ─── Head-to-Head Comparison ───

  console.log("\n" + "═".repeat(80));
  console.log("🔬 HEAD-TO-HEAD COMPARISON");
  console.log("═".repeat(80));

  const r21 = allResults.filter((r) => r.featureSet === "21-cme");
  const r33 = allResults.filter((r) => r.featureSet === "33-cme-cultural");

  const acc21 = r21.length > 0 ? ((r21.filter((r) => r.correct).length / r21.length) * 100) : 0;
  const acc33 = r33.length > 0 ? ((r33.filter((r) => r.correct).length / r33.length) * 100) : 0;
  const delta = acc33 - acc21;

  console.log(`\n  21 features (CME only):        ${acc21.toFixed(1)}% (${r21.length} predictions)`);
  console.log(`  33 features (CME + Cultural):  ${acc33.toFixed(1)}% (${r33.length} predictions)`);
  console.log(`  Delta:                         ${delta > 0 ? "+" : ""}${delta.toFixed(1)} pp`);
  console.log(`  Random baseline:               50.0%`);

  if (delta > 1) {
    console.log(`\n  ✅ Cultural features HELP (+${delta.toFixed(1)} pp). Keep them in production.`);
  } else if (delta < -1) {
    console.log(`\n  ❌ Cultural features HURT (${delta.toFixed(1)} pp). Remove them from production.`);
  } else {
    console.log(`\n  ➡️ Cultural features are NEUTRAL (${delta > 0 ? "+" : ""}${delta.toFixed(1)} pp). Consider removing to reduce overfitting risk.`);
  }

  // By barn comparison
  console.log("\n── By Barn (21-feat vs 33-feat) ──");
  const barnNames = [...new Set(allResults.map((r) => r.barn))];
  for (const barn of barnNames) {
    const b21 = r21.filter((r) => r.barn === barn);
    const b33 = r33.filter((r) => r.barn === barn);
    const a21 = b21.length > 0 ? ((b21.filter((r) => r.correct).length / b21.length) * 100).toFixed(1) : "N/A";
    const a33 = b33.length > 0 ? ((b33.filter((r) => r.correct).length / b33.length) * 100).toFixed(1) : "N/A";
    console.log(`  ${barn.padEnd(25)} 21f: ${a21.padStart(5)}% | 33f: ${a33.padStart(5)}%`);
  }

  // Cultural feature impact by season
  console.log("\n── Cultural Feature Impact by Month ──");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  for (let m = 0; m < 12; m++) {
    const monthStr = String(m + 1).padStart(2, "0");
    const m21 = r21.filter((r) => r.date.slice(5, 7) === monthStr);
    const m33 = r33.filter((r) => r.date.slice(5, 7) === monthStr);
    if (m21.length < 5) continue;
    const a21 = ((m21.filter((r) => r.correct).length / m21.length) * 100).toFixed(1);
    const a33 = ((m33.filter((r) => r.correct).length / m33.length) * 100).toFixed(1);
    const d = parseFloat(a33) - parseFloat(a21);
    const indicator = d > 2 ? "📈" : d < -2 ? "📉" : "➡️";
    console.log(`  ${monthNames[m].padEnd(4)} 21f: ${a21.padStart(5)}% | 33f: ${a33.padStart(5)}% (${d > 0 ? "+" : ""}${d.toFixed(1)}pp) ${indicator}`);
  }

  console.log("\n✅ Binary backtest complete.");
}

main().catch(console.error);
