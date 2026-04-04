// BarnSignal — ML Backtest with CME Futures Features
// Adds Live Cattle (LE=F) and Feeder Cattle (GF=F) futures data as features
// Run: MARS_API_KEY=xxx npx tsx src/backtest-ml-cme.ts

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
  date: string;   // YYYY-MM-DD
  liveClose: number;
  feederClose: number;
}

interface BacktestResult {
  date: string;
  barn: string;
  category: string;
  predictedDirection: "up" | "down" | "flat";
  actualDirection: "up" | "down" | "flat";
  confidence: number;
  currentPrice: number;
  nextPrice: number;
  priceChange: number;
  correct: boolean;
}

// ─── Fetch CME Futures from Yahoo Finance ───

async function fetchCMEFutures(): Promise<FuturesDataPoint[]> {
  console.log("📈 Fetching CME futures data from Yahoo Finance...");

  const fetchSymbol = async (symbol: string): Promise<{ timestamps: number[]; closes: number[] }> => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=3y&interval=1wk`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BarnSignal/1.0)" },
    });
    if (!resp.ok) throw new Error(`Yahoo Finance API error for ${symbol}: ${resp.status}`);
    const data = (await resp.json()) as any;
    const result = data.chart.result[0];
    return {
      timestamps: result.timestamp as number[],
      closes: result.indicators.quote[0].close as number[],
    };
  };

  const [live, feeder] = await Promise.all([
    fetchSymbol("LE=F"),
    fetchSymbol("GF=F"),
  ]);

  console.log(`  LE=F: ${live.timestamps.length} weeks, GF=F: ${feeder.timestamps.length} weeks`);

  // Build lookup by date (round to nearest Monday for weekly alignment)
  const liveByWeek = new Map<string, number>();
  for (let i = 0; i < live.timestamps.length; i++) {
    if (live.closes[i] != null) {
      const d = new Date(live.timestamps[i] * 1000);
      const weekKey = getWeekKey(d);
      liveByWeek.set(weekKey, live.closes[i]);
    }
  }

  const feederByWeek = new Map<string, number>();
  for (let i = 0; i < feeder.timestamps.length; i++) {
    if (feeder.closes[i] != null) {
      const d = new Date(feeder.timestamps[i] * 1000);
      const weekKey = getWeekKey(d);
      feederByWeek.set(weekKey, feeder.closes[i]);
    }
  }

  // Merge into unified series
  const allWeeks = new Set([...liveByWeek.keys(), ...feederByWeek.keys()]);
  const dataPoints: FuturesDataPoint[] = [];

  for (const week of [...allWeeks].sort()) {
    const livePrice = liveByWeek.get(week);
    const feederPrice = feederByWeek.get(week);
    if (livePrice && feederPrice) {
      dataPoints.push({ date: week, liveClose: livePrice, feederClose: feederPrice });
    }
  }

  console.log(`  Merged: ${dataPoints.length} weeks with both LE and GF data`);
  return dataPoints;
}

function getWeekKey(d: Date): string {
  // Round to Monday of that week for alignment
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().split("T")[0];
}

function getWeekKeyFromDate(dateStr: string): string {
  return getWeekKey(new Date(dateStr));
}

// ─── MARS API Fetch ───

async function fetchReportData(
  reportId: number,
  begin: string,
  end: string,
): Promise<Record<string, any>[]> {
  const apiKey = getMarsApiKey();
  const url = `${MARS_API_BASE}/${reportId}?q=report_begin_date=${begin}:${end}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(apiKey + ":").toString("base64")}`,
    },
  });
  if (!resp.ok) throw new Error(`API error ${reportId}: ${resp.status}`);
  const data = (await resp.json()) as any;
  return data.results || [];
}

// ─── Data Transform ───

function toISODate(mmddyyyy: string): string {
  const parts = mmddyyyy.split("/");
  return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
}

function buildSnapshots(
  results: Record<string, any>[],
  isHay: boolean,
): AuctionSnapshot[] {
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
          if (cls === "Wheat") categoryName = "Wheat Straw";
          else categoryName = cls;
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

      const avgPrice = parseFloat(
        isHay ? (row.average_Price || row.average_price) : row.avg_price,
      ) || 0;
      const head = parseInt(
        isHay ? (row.current_Quantity || row.current_quantity) : row.head_count,
      ) || 0;

      if (avgPrice <= 0) continue;
      if (!isHay && dressing !== "Average") continue;

      const key = categoryName;
      if (!categories.has(key) || categories.get(key)!.head < head) {
        categories.set(key, { avgPrice, head });
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

// ─── Feature Extraction (now with CME futures) ───

interface PricePoint {
  date: string;
  price: number;
  receipts: number;
  lastYearReceipts: number;
}

function extractFeatures(
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

  // ── Original 15 features ──

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
  const pricePosition = maxPrice > minPrice
    ? (current.price - minPrice) / (maxPrice - minPrice) : 0.5;

  const recentChange = ((current.price - prev1.price) / prev1.price) * 100;
  const priorChange = ((prev1.price - prev2.price) / prev2.price) * 100;
  const acceleration = recentChange - priorChange;

  const receiptChange = prev1.receipts > 0
    ? ((current.receipts - prev1.receipts) / prev1.receipts) * 100 : 0;

  const yoyReceipts = current.lastYearReceipts > 0
    ? ((current.receipts - current.lastYearReceipts) / current.lastYearReceipts) * 100 : 0;

  const recentReceipts = receipts.slice(-3);
  const avgReceipts = recentReceipts.reduce((s, r) => s + r, 0) / recentReceipts.length;
  const receiptTrend = avgReceipts > 0
    ? ((current.receipts - avgReceipts) / avgReceipts) * 100 : 0;

  const month = new Date(current.date).getMonth();
  const monthSin = Math.sin((2 * Math.PI * month) / 12);
  const monthCos = Math.cos((2 * Math.PI * month) / 12);

  const hayFlag = isHay ? 1 : 0;

  let consecutiveUp = 0;
  let consecutiveDown = 0;
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
    ? (current.price - fourWeekLow) / (fourWeekHigh - fourWeekLow) : 0.5;

  // ── NEW: CME Futures features ──

  const currentWeek = getWeekKeyFromDate(current.date);
  const prevWeek = getWeekKeyFromDate(prev1.date);
  const currentFutures = futuresLookup.get(currentWeek);
  const prevFutures = futuresLookup.get(prevWeek);

  // Feature 15: Basis (cash vs futures) — key predictor per Utah State research
  // Basis = local cash price - futures price. Negative basis = local discount, positive = local premium
  // For cattle: compare auction price ($/cwt) to LE=F (cents/lb → $/cwt)
  let basis = 0;
  if (currentFutures && !isHay) {
    basis = current.price - currentFutures.liveClose;
  }

  // Feature 16: Basis change (basis tightening/widening)
  let basisChange = 0;
  if (currentFutures && prevFutures && !isHay) {
    const currentBasis = current.price - currentFutures.liveClose;
    const prevBasis = prev1.price - prevFutures.liveClose;
    basisChange = currentBasis - prevBasis;
  }

  // Feature 17: Futures momentum (LE=F week-over-week change %)
  let futuresMomentum = 0;
  if (currentFutures && prevFutures) {
    futuresMomentum = ((currentFutures.liveClose - prevFutures.liveClose) / prevFutures.liveClose) * 100;
  }

  // Feature 18: Feeder-to-live spread change
  // Rising spread = feeder cattle getting more expensive relative to fed cattle
  let feederLiveSpread = 0;
  if (currentFutures) {
    feederLiveSpread = currentFutures.feederClose - currentFutures.liveClose;
  }

  // Feature 19: Feeder-live spread change
  let feederLiveSpreadChange = 0;
  if (currentFutures && prevFutures) {
    const currentSpread = currentFutures.feederClose - currentFutures.liveClose;
    const prevSpread = prevFutures.feederClose - prevFutures.liveClose;
    feederLiveSpreadChange = currentSpread - prevSpread;
  }

  // Feature 20: Cash-to-futures ratio (how much premium/discount is local market at)
  let cashFuturesRatio = 0;
  if (currentFutures && currentFutures.liveClose > 0 && !isHay) {
    cashFuturesRatio = (current.price / currentFutures.liveClose) * 100 - 100; // % premium/discount
  }

  return [
    wow, twoWeek, fourWeek, meanReversionSignal, volatility,
    pricePosition, acceleration, receiptChange, yoyReceipts,
    receiptTrend, monthSin, monthCos, hayFlag, directionPersistence,
    highLowRatio,
    // CME futures features
    basis, basisChange, futuresMomentum, feederLiveSpread,
    feederLiveSpreadChange, cashFuturesRatio,
  ];
}

function classifyActualDirection(priceChange: number): number {
  if (priceChange > 2) return 2;
  if (priceChange < -2) return 0;
  return 1;
}

function directionLabel(cls: number): "up" | "down" | "flat" {
  if (cls === 2) return "up";
  if (cls === 0) return "down";
  return "flat";
}

// ─── Walk-Forward ML Backtest ───

async function backtestBarnML(
  reportId: number,
  barnName: string,
  trackedCategories: string[],
  isHay: boolean,
  beginDate: string,
  endDate: string,
  futuresLookup: Map<string, FuturesDataPoint>,
): Promise<BacktestResult[]> {
  console.log(`\n📊 ML+CME Backtesting ${barnName} (${reportId})...`);

  const results = await fetchReportData(reportId, beginDate, endDate);
  if (results.length === 0) {
    console.log(`  ⏭️  No data`);
    return [];
  }

  const snapshots = buildSnapshots(results, isHay);
  console.log(
    `  📅 ${snapshots.length} auction dates from ${snapshots[0].date} to ${snapshots[snapshots.length - 1].date}`,
  );

  const backtestResults: BacktestResult[] = [];

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

    for (let splitIdx = MIN_TRAIN; splitIdx < priceSeries.length - 1; splitIdx++) {
      const trainFeatures: number[][] = [];
      const trainLabels: number[] = [];

      for (let i = 4; i < splitIdx; i++) {
        const window = priceSeries.slice(Math.max(0, i - 8), i + 1);
        const features = extractFeatures(window, isHay, futuresLookup);
        if (!features) continue;

        const nextPrice = priceSeries[i + 1].price;
        const change = ((nextPrice - priceSeries[i].price) / priceSeries[i].price) * 100;
        trainLabels.push(classifyActualDirection(change));
        trainFeatures.push(features);
      }

      if (trainFeatures.length < 8) continue;
      const uniqueLabels = new Set(trainLabels);
      if (uniqueLabels.size < 2) continue;

      const predWindow = priceSeries.slice(Math.max(0, splitIdx - 8), splitIdx + 1);
      const predFeatures = extractFeatures(predWindow, isHay, futuresLookup);
      if (!predFeatures) continue;

      try {
        const rf = new RandomForestClassifier({
          nEstimators: 50,
          maxFeatures: 0.7,
          replacement: true,
          seed: splitIdx,
        });

        rf.train(trainFeatures, trainLabels);
        const prediction = rf.predict([predFeatures])[0];

        const currentPrice = priceSeries[splitIdx].price;
        const nextPrice = priceSeries[splitIdx + 1].price;
        const priceChange = ((nextPrice - currentPrice) / currentPrice) * 100;
        const actualClass = classifyActualDirection(priceChange);

        const allPredictions = (rf as any).estimators
          ? (rf as any).estimators.map((tree: any) => tree.predict([predFeatures])[0])
          : [];
        const voteCount = allPredictions.filter((p: number) => p === prediction).length;
        const confidence = allPredictions.length > 0
          ? Math.round((voteCount / allPredictions.length) * 100) : 50;

        backtestResults.push({
          date: priceSeries[splitIdx].date,
          barn: barnName,
          category,
          predictedDirection: directionLabel(prediction),
          actualDirection: directionLabel(actualClass),
          confidence,
          currentPrice,
          nextPrice,
          priceChange,
          correct: prediction === actualClass,
        });
      } catch {
        continue;
      }
    }
  }

  const correct = backtestResults.filter((r) => r.correct).length;
  const acc = backtestResults.length > 0
    ? ((correct / backtestResults.length) * 100).toFixed(1) : "0";
  console.log(`  ✅ ${backtestResults.length} predictions, ${acc}% accurate`);

  return backtestResults;
}

// ─── Main ───

async function main() {
  console.log("🧪 BarnSignal ML+CME Prediction Model Backtest");
  console.log("Random Forest with 21 features (15 original + 6 CME futures)\n");

  // Fetch CME futures data first
  const futuresData = await fetchCMEFutures();
  const futuresLookup = new Map<string, FuturesDataPoint>();
  for (const fp of futuresData) {
    futuresLookup.set(fp.date, fp);
  }

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
      const results = await backtestBarnML(
        barn.id, barn.name, cattleCategories, false, "01/01/2023", "04/04/2026", futuresLookup,
      );
      allResults.push(...results);
    } catch (err) {
      console.error(`  ❌ ${barn.name}: ${(err as Error).message}`);
    }
  }

  for (const barn of hayBarns) {
    try {
      const results = await backtestBarnML(
        barn.id, barn.name, hayCategories, true, "01/01/2023", "04/04/2026", futuresLookup,
      );
      allResults.push(...results);
    } catch (err) {
      console.error(`  ❌ ${barn.name}: ${(err as Error).message}`);
    }
  }

  // ─── Analyze Results ───

  console.log("\n" + "═".repeat(80));
  console.log("📈 ML+CME BACKTEST RESULTS");
  console.log("═".repeat(80));

  const total = allResults.length;
  const correct = allResults.filter((r) => r.correct).length;
  const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : "0";

  console.log(`\nTotal predictions tested: ${total}`);
  console.log(`Correct: ${correct}`);
  console.log(`Overall Accuracy: ${accuracy}%`);
  console.log(`\n── Comparison ──`);
  console.log(`  🤖 ML + CME Futures: ${accuracy}%`);
  console.log(`  🤖 ML Only (no CME): 45.8%`);
  console.log(`  📏 Old Rule-based:   25.6%`);
  console.log(`  🎲 Random:           33.3%`);

  // By direction
  console.log("\n── By Predicted Direction ──");
  for (const dir of ["up", "down", "flat"] as const) {
    const predicted = allResults.filter((r) => r.predictedDirection === dir);
    const predCorrect = predicted.filter((r) => r.correct).length;
    const predAcc = predicted.length > 0
      ? ((predCorrect / predicted.length) * 100).toFixed(1) : "0";
    console.log(
      `  ${dir.toUpperCase().padEnd(6)} calls: ${predicted.length.toString().padStart(5)} made, ${predCorrect.toString().padStart(5)} correct (${predAcc}%)`,
    );
  }

  // By barn
  console.log("\n── By Barn ──");
  const barnMap = new Map<string, BacktestResult[]>();
  for (const r of allResults) {
    if (!barnMap.has(r.barn)) barnMap.set(r.barn, []);
    barnMap.get(r.barn)!.push(r);
  }
  for (const [barn, results] of [...barnMap.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const c = results.filter((r) => r.correct).length;
    const acc = ((c / results.length) * 100).toFixed(1);
    console.log(`  ${barn.padEnd(25)} ${results.length.toString().padStart(5)} predictions | ${acc}% accurate`);
  }

  // Cattle vs Hay
  console.log("\n── Cattle vs Hay ──");
  const cattleResults = allResults.filter((r) => !hayBarns.some((h) => h.name === r.barn));
  const hayResults = allResults.filter((r) => hayBarns.some((h) => h.name === r.barn));
  const cattleAcc = cattleResults.length > 0
    ? ((cattleResults.filter((r) => r.correct).length / cattleResults.length) * 100).toFixed(1) : "0";
  const hayAcc = hayResults.length > 0
    ? ((hayResults.filter((r) => r.correct).length / hayResults.length) * 100).toFixed(1) : "0";
  console.log(`  Cattle: ${cattleResults.length} predictions, ${cattleAcc}% accurate`);
  console.log(`  Hay:    ${hayResults.length} predictions, ${hayAcc}% accurate`);

  // By confidence
  console.log("\n── By Confidence Level ──");
  const confBuckets = [
    { label: "High (70%+)", filter: (r: BacktestResult) => r.confidence >= 70 },
    { label: "Medium (50-69%)", filter: (r: BacktestResult) => r.confidence >= 50 && r.confidence < 70 },
    { label: "Low (<50%)", filter: (r: BacktestResult) => r.confidence < 50 },
  ];
  for (const bucket of confBuckets) {
    const filtered = allResults.filter(bucket.filter);
    const c = filtered.filter((r) => r.correct).length;
    const acc = filtered.length > 0 ? ((c / filtered.length) * 100).toFixed(1) : "0";
    console.log(
      `  ${bucket.label.padEnd(20)} ${filtered.length.toString().padStart(5)} predictions | ${acc}% accurate`,
    );
  }

  // By category
  console.log("\n── By Category (top 8) ──");
  const catMap = new Map<string, BacktestResult[]>();
  for (const r of allResults) {
    if (!catMap.has(r.category)) catMap.set(r.category, []);
    catMap.get(r.category)!.push(r);
  }
  const catStats = [...catMap.entries()]
    .filter(([_, results]) => results.length >= 10)
    .map(([cat, results]) => ({
      cat,
      total: results.length,
      correct: results.filter((r) => r.correct).length,
      accuracy: (results.filter((r) => r.correct).length / results.length) * 100,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);

  for (const s of catStats.slice(0, 8)) {
    console.log(`  ${s.cat.padEnd(35)} ${s.accuracy.toFixed(1)}% (${s.correct}/${s.total})`);
  }

  console.log("\n── Feature Set (21 features) ──");
  const featureNames = [
    "wow_change", "two_week_change", "four_week_change", "mean_reversion",
    "volatility", "price_position", "acceleration", "receipt_change",
    "yoy_receipts", "receipt_trend", "month_sin", "month_cos",
    "is_hay", "direction_persistence", "high_low_ratio",
    "CME_basis", "CME_basis_change", "CME_futures_momentum",
    "CME_feeder_live_spread", "CME_spread_change", "CME_cash_futures_ratio",
  ];
  console.log(`  ${featureNames.join(", ")}`);

  console.log("\n✅ ML+CME Backtest complete.");
}

main().catch(console.error);
