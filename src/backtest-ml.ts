// BarnSignal — ML Prediction Model Backtest
// Replaces rule-based signals with Random Forest classifier
// Run: MARS_API_KEY=xxx npx tsx src/backtest-ml.ts

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

// ─── API Fetch ───

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
        if (qualityGrade && qualityGrade !== "N/A") {
          categoryName += ` - ${qualityGrade}`;
        }
        if (frameGrade && frameGrade !== "N/A") {
          categoryName += ` ${frameGrade}`;
        }
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

// ─── Feature Extraction ───
// This is the key upgrade: instead of hand-coded rules with arbitrary thresholds,
// we extract numerical features and let the Random Forest learn the patterns.

function extractFeatures(
  history: { date: string; price: number; receipts: number; lastYearReceipts: number }[],
  isHay: boolean,
): number[] | null {
  // Need at least 4 data points for meaningful features
  if (history.length < 4) return null;

  const current = history[history.length - 1];
  const prev1 = history[history.length - 2];
  const prev2 = history[history.length - 3];
  const prev3 = history[history.length - 4];

  const prices = history.map((h) => h.price);
  const receipts = history.map((h) => h.receipts);

  // ── Price features ──

  // 1. Week-over-week change (%)
  const wow = ((current.price - prev1.price) / prev1.price) * 100;

  // 2. Two-week change (%)
  const twoWeek = ((current.price - prev2.price) / prev2.price) * 100;

  // 3. Four-week change (%) — if we have enough history
  const fourWeek = history.length >= 5
    ? ((current.price - history[history.length - 5].price) / history[history.length - 5].price) * 100
    : twoWeek;

  // 4. Mean reversion: deviation from N-week moving average (%)
  const ma = prices.reduce((s, p) => s + p, 0) / prices.length;
  const meanReversionSignal = ((current.price - ma) / ma) * 100;

  // 5. Volatility: coefficient of variation of recent prices
  const priceStd = Math.sqrt(
    prices.reduce((s, p) => s + (p - ma) ** 2, 0) / prices.length,
  );
  const volatility = ma > 0 ? (priceStd / ma) * 100 : 0;

  // 6. Price position in recent range (0 = at low, 1 = at high)
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const pricePosition = maxPrice > minPrice
    ? (current.price - minPrice) / (maxPrice - minPrice)
    : 0.5;

  // 7. Acceleration: is the trend accelerating or decelerating?
  const recentChange = ((current.price - prev1.price) / prev1.price) * 100;
  const priorChange = ((prev1.price - prev2.price) / prev2.price) * 100;
  const acceleration = recentChange - priorChange;

  // ── Supply features ──

  // 8. Receipt change week-over-week
  const receiptChange = prev1.receipts > 0
    ? ((current.receipts - prev1.receipts) / prev1.receipts) * 100
    : 0;

  // 9. YoY receipt change
  const yoyReceipts = current.lastYearReceipts > 0
    ? ((current.receipts - current.lastYearReceipts) / current.lastYearReceipts) * 100
    : 0;

  // 10. Receipt trend (3-week average vs current)
  const recentReceipts = receipts.slice(-3);
  const avgReceipts = recentReceipts.reduce((s, r) => s + r, 0) / recentReceipts.length;
  const receiptTrend = avgReceipts > 0
    ? ((current.receipts - avgReceipts) / avgReceipts) * 100
    : 0;

  // ── Seasonal features (cyclical encoding) ──

  const month = new Date(current.date).getMonth();
  // 11-12. Sine/cosine encoding of month (captures cyclical seasonality)
  const monthSin = Math.sin((2 * Math.PI * month) / 12);
  const monthCos = Math.cos((2 * Math.PI * month) / 12);

  // 13. Is hay (commodity type)
  const hayFlag = isHay ? 1 : 0;

  // 14. Consecutive direction count (momentum persistence)
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

  // 15. Price vs 4-week high/low ratio
  const fourWeekPrices = prices.slice(-4);
  const fourWeekHigh = Math.max(...fourWeekPrices);
  const fourWeekLow = Math.min(...fourWeekPrices);
  const highLowRatio = fourWeekHigh > fourWeekLow
    ? (current.price - fourWeekLow) / (fourWeekHigh - fourWeekLow)
    : 0.5;

  return [
    wow,                    // 0: week-over-week %
    twoWeek,               // 1: 2-week change %
    fourWeek,              // 2: 4-week change %
    meanReversionSignal,   // 3: deviation from moving avg %
    volatility,            // 4: price volatility (CV)
    pricePosition,         // 5: position in range [0,1]
    acceleration,          // 6: trend acceleration
    receiptChange,         // 7: week receipt change %
    yoyReceipts,           // 8: year-over-year receipts %
    receiptTrend,          // 9: receipt trend vs 3wk avg %
    monthSin,              // 10: seasonal sine
    monthCos,              // 11: seasonal cosine
    hayFlag,               // 12: commodity type
    directionPersistence,  // 13: consecutive direction count
    highLowRatio,          // 14: 4-week high/low position
  ];
}

function classifyActualDirection(priceChange: number): number {
  // 0 = down, 1 = flat, 2 = up
  // Using ±2% threshold (wider than the old ±1% — research says weekly noise is high)
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
): Promise<BacktestResult[]> {
  console.log(`\n📊 ML Backtesting ${barnName} (${reportId})...`);

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
    // Build chronological price series
    const priceSeries: {
      date: string;
      price: number;
      receipts: number;
      lastYearReceipts: number;
    }[] = [];

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

    if (priceSeries.length < 20) continue; // Need enough data for train + test

    // Walk-forward: train on first N points, predict next, slide forward
    const MIN_TRAIN = 12; // Minimum training set size

    for (let splitIdx = MIN_TRAIN; splitIdx < priceSeries.length - 1; splitIdx++) {
      // Build training data from all available history up to splitIdx
      const trainFeatures: number[][] = [];
      const trainLabels: number[] = [];

      for (let i = 4; i < splitIdx; i++) {
        const window = priceSeries.slice(Math.max(0, i - 8), i + 1);
        const features = extractFeatures(window, isHay);
        if (!features) continue;

        // Label: what actually happened next
        const nextPrice = priceSeries[i + 1].price;
        const change = ((nextPrice - priceSeries[i].price) / priceSeries[i].price) * 100;
        trainLabels.push(classifyActualDirection(change));
        trainFeatures.push(features);
      }

      if (trainFeatures.length < 8) continue; // Not enough training data

      // Check we have at least 2 different classes
      const uniqueLabels = new Set(trainLabels);
      if (uniqueLabels.size < 2) continue;

      // Extract features for the prediction point
      const predWindow = priceSeries.slice(Math.max(0, splitIdx - 8), splitIdx + 1);
      const predFeatures = extractFeatures(predWindow, isHay);
      if (!predFeatures) continue;

      // Train Random Forest
      try {
        const rf = new RandomForestClassifier({
          nEstimators: 50,
          maxFeatures: 0.7,
          replacement: true,
          seed: splitIdx, // deterministic
        });

        rf.train(trainFeatures, trainLabels);

        // Predict
        const prediction = rf.predict([predFeatures])[0];

        // Get actual outcome
        const currentPrice = priceSeries[splitIdx].price;
        const nextPrice = priceSeries[splitIdx + 1].price;
        const priceChange = ((nextPrice - currentPrice) / currentPrice) * 100;
        const actualClass = classifyActualDirection(priceChange);

        // Confidence from class probabilities (vote fraction)
        const allPredictions = (rf as any).estimators
          ? (rf as any).estimators.map((tree: any) => tree.predict([predFeatures])[0])
          : [];
        const voteCount = allPredictions.filter((p: number) => p === prediction).length;
        const confidence = allPredictions.length > 0
          ? Math.round((voteCount / allPredictions.length) * 100)
          : 50;

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
      } catch (err) {
        // Skip if training fails (e.g., degenerate data)
        continue;
      }
    }
  }

  const correct = backtestResults.filter((r) => r.correct).length;
  const acc = backtestResults.length > 0
    ? ((correct / backtestResults.length) * 100).toFixed(1)
    : "0";
  console.log(`  ✅ ${backtestResults.length} predictions, ${acc}% accurate`);

  return backtestResults;
}

// ─── Main ───

async function main() {
  console.log("🧪 BarnSignal ML Prediction Model Backtest");
  console.log("Random Forest classifier with 15 engineered features\n");

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

  // Backtest cattle
  for (const barn of cattleBarns) {
    try {
      const results = await backtestBarnML(
        barn.id, barn.name, cattleCategories, false, "01/01/2023", "04/04/2026",
      );
      allResults.push(...results);
    } catch (err) {
      console.error(`  ❌ ${barn.name}: ${(err as Error).message}`);
    }
  }

  // Backtest hay
  for (const barn of hayBarns) {
    try {
      const results = await backtestBarnML(
        barn.id, barn.name, hayCategories, true, "01/01/2023", "04/04/2026",
      );
      allResults.push(...results);
    } catch (err) {
      console.error(`  ❌ ${barn.name}: ${(err as Error).message}`);
    }
  }

  // ─── Analyze Results ───

  console.log("\n" + "═".repeat(80));
  console.log("📈 ML BACKTEST RESULTS (Random Forest)");
  console.log("═".repeat(80));

  const total = allResults.length;
  const correct = allResults.filter((r) => r.correct).length;
  const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : "0";

  console.log(`\nTotal predictions tested: ${total}`);
  console.log(`Correct: ${correct}`);
  console.log(`Overall Accuracy: ${accuracy}%`);
  console.log(`Old rule-based model: 25.6%`);
  console.log(`Random baseline: 33.3%`);

  // By direction
  console.log("\n── By Predicted Direction ──");
  for (const dir of ["up", "down", "flat"] as const) {
    const predicted = allResults.filter((r) => r.predictedDirection === dir);
    const predCorrect = predicted.filter((r) => r.correct).length;
    const predAcc = predicted.length > 0
      ? ((predCorrect / predicted.length) * 100).toFixed(1)
      : "0";
    console.log(
      `  ${dir.toUpperCase().padEnd(6)} calls: ${predicted.length.toString().padStart(5)} made, ${predCorrect.toString().padStart(5)} correct (${predAcc}%)`,
    );
  }

  // Actual direction distribution
  console.log("\n── Actual Direction Distribution ──");
  for (const dir of ["up", "down", "flat"] as const) {
    const actual = allResults.filter((r) => r.actualDirection === dir);
    console.log(
      `  ${dir.toUpperCase().padEnd(6)}: ${actual.length.toString().padStart(5)} (${((actual.length / total) * 100).toFixed(1)}%)`,
    );
  }

  // By barn
  console.log("\n── By Barn ──");
  const barnMap = new Map<string, BacktestResult[]>();
  for (const r of allResults) {
    if (!barnMap.has(r.barn)) barnMap.set(r.barn, []);
    barnMap.get(r.barn)!.push(r);
  }
  for (const [barn, results] of [...barnMap.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    const c = results.filter((r) => r.correct).length;
    const acc = ((c / results.length) * 100).toFixed(1);
    console.log(
      `  ${barn.padEnd(25)} ${results.length.toString().padStart(5)} predictions | ${acc}% accurate`,
    );
  }

  // By category (top and bottom)
  console.log("\n── By Category ──");
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
      accuracy:
        (results.filter((r) => r.correct).length / results.length) * 100,
    }))
    .sort((a, b) => b.accuracy - a.accuracy);

  console.log("  Best performing:");
  for (const s of catStats.slice(0, 5)) {
    console.log(
      `    ${s.cat.padEnd(35)} ${s.accuracy.toFixed(1)}% (${s.correct}/${s.total})`,
    );
  }
  console.log("  Worst performing:");
  for (const s of catStats.slice(-5)) {
    console.log(
      `    ${s.cat.padEnd(35)} ${s.accuracy.toFixed(1)}% (${s.correct}/${s.total})`,
    );
  }

  // Cattle vs Hay
  console.log("\n── Cattle vs Hay ──");
  const cattleResults = allResults.filter(
    (r) => !hayBarns.some((h) => h.name === r.barn),
  );
  const hayResults = allResults.filter((r) =>
    hayBarns.some((h) => h.name === r.barn),
  );
  const cattleAcc = cattleResults.length > 0
    ? ((cattleResults.filter((r) => r.correct).length / cattleResults.length) * 100).toFixed(1)
    : "0";
  const hayAcc = hayResults.length > 0
    ? ((hayResults.filter((r) => r.correct).length / hayResults.length) * 100).toFixed(1)
    : "0";
  console.log(`  Cattle: ${cattleResults.length} predictions, ${cattleAcc}% accurate`);
  console.log(`  Hay:    ${hayResults.length} predictions, ${hayAcc}% accurate`);

  // By confidence bucket
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

  // Monthly accuracy
  console.log("\n── By Month ──");
  const monthMap = new Map<string, BacktestResult[]>();
  for (const r of allResults) {
    const month = r.date.slice(0, 7);
    if (!monthMap.has(month)) monthMap.set(month, []);
    monthMap.get(month)!.push(r);
  }
  for (const [month, results] of [...monthMap.entries()].sort()) {
    const c = results.filter((r) => r.correct).length;
    const acc = ((c / results.length) * 100).toFixed(1);
    const bar = "█".repeat(Math.round(parseFloat(acc) / 5));
    console.log(
      `  ${month} | ${results.length.toString().padStart(4)} preds | ${acc.padStart(5)}% ${bar}`,
    );
  }

  // Compare to baselines
  console.log("\n── vs. Baselines ──");
  const alwaysFlat = allResults.filter((r) => r.actualDirection === "flat").length;
  const alwaysFlatAcc = ((alwaysFlat / total) * 100).toFixed(1);

  // "Always predict last direction" (naive momentum)
  let naiveCorrect = 0;
  for (const r of allResults) {
    // If price went up last time, predict up again
    if (r.priceChange > 2 && r.predictedDirection === "up") naiveCorrect++;
    else if (r.priceChange < -2 && r.predictedDirection === "down") naiveCorrect++;
    else if (r.priceChange >= -2 && r.priceChange <= 2 && r.predictedDirection === "flat") naiveCorrect++;
  }

  console.log(`  🤖 ML Model (RF):  ${accuracy}%`);
  console.log(`  📏 Old Rule-based: 25.6%`);
  console.log(`  ➡️  Always "flat":  ${alwaysFlatAcc}%`);
  console.log(`  🎲 Random (33.3%): 33.3%`);

  // Feature importance note
  console.log("\n── Feature Set ──");
  const featureNames = [
    "wow_change", "two_week_change", "four_week_change", "mean_reversion",
    "volatility", "price_position", "acceleration", "receipt_change",
    "yoy_receipts", "receipt_trend", "month_sin", "month_cos",
    "is_hay", "direction_persistence", "high_low_ratio",
  ];
  console.log(`  ${featureNames.length} features: ${featureNames.join(", ")}`);

  console.log("\n✅ ML Backtest complete.");
}

main().catch(console.error);
