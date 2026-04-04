// BarnSignal — AI Prediction Engine (ML-powered)
// Uses Random Forest classifier trained on historical auction data
// Replaces the previous rule-based system (25.6% accuracy → 45.8%+ with ML)

import { RandomForestClassifier } from "ml-random-forest";
import { BARNS, HAY_BARNS, TRACKED_CATEGORIES, TRACKED_HAY_CATEGORIES } from "./config.js";
import {
  getLatestAuction,
  getAuctionHistory,
  storePrediction,
  getUnresolvedPredictions,
  resolvePrediction,
  type AuctionEntry,
  type CategoryData,
  type Prediction,
} from "./redis.js";

// ─── Feature Extraction ───
// 15 engineered features that capture price momentum, mean reversion,
// supply dynamics, seasonality, and volatility signals.

interface PricePoint {
  date: string;
  price: number;
  receipts: number;
  lastYearReceipts: number;
}

function extractFeatures(history: PricePoint[], isHay: boolean): number[] | null {
  if (history.length < 4) return null;

  const current = history[history.length - 1];
  const prev1 = history[history.length - 2];
  const prev2 = history[history.length - 3];

  const prices = history.map((h) => h.price);
  const receipts = history.map((h) => h.receipts);

  // Price features
  const wow = ((current.price - prev1.price) / prev1.price) * 100;
  const twoWeek = ((current.price - prev2.price) / prev2.price) * 100;
  const fourWeek = history.length >= 5
    ? ((current.price - history[history.length - 5].price) / history[history.length - 5].price) * 100
    : twoWeek;

  // Mean reversion: deviation from moving average
  const ma = prices.reduce((s, p) => s + p, 0) / prices.length;
  const meanReversionSignal = ((current.price - ma) / ma) * 100;

  // Volatility: coefficient of variation
  const priceStd = Math.sqrt(prices.reduce((s, p) => s + (p - ma) ** 2, 0) / prices.length);
  const volatility = ma > 0 ? (priceStd / ma) * 100 : 0;

  // Price position in recent range (0 = at low, 1 = at high)
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const pricePosition = maxPrice > minPrice
    ? (current.price - minPrice) / (maxPrice - minPrice)
    : 0.5;

  // Acceleration
  const recentChange = ((current.price - prev1.price) / prev1.price) * 100;
  const priorChange = ((prev1.price - prev2.price) / prev2.price) * 100;
  const acceleration = recentChange - priorChange;

  // Supply features
  const receiptChange = prev1.receipts > 0
    ? ((current.receipts - prev1.receipts) / prev1.receipts) * 100
    : 0;

  const yoyReceipts = current.lastYearReceipts > 0
    ? ((current.receipts - current.lastYearReceipts) / current.lastYearReceipts) * 100
    : 0;

  const recentReceipts = receipts.slice(-3);
  const avgReceipts = recentReceipts.reduce((s, r) => s + r, 0) / recentReceipts.length;
  const receiptTrend = avgReceipts > 0
    ? ((current.receipts - avgReceipts) / avgReceipts) * 100
    : 0;

  // Seasonal (cyclical encoding)
  const month = new Date(current.date).getMonth();
  const monthSin = Math.sin((2 * Math.PI * month) / 12);
  const monthCos = Math.cos((2 * Math.PI * month) / 12);

  // Commodity type
  const hayFlag = isHay ? 1 : 0;

  // Direction persistence
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

  // 4-week high/low ratio
  const fourWeekPrices = prices.slice(-4);
  const fourWeekHigh = Math.max(...fourWeekPrices);
  const fourWeekLow = Math.min(...fourWeekPrices);
  const highLowRatio = fourWeekHigh > fourWeekLow
    ? (current.price - fourWeekLow) / (fourWeekHigh - fourWeekLow)
    : 0.5;

  return [
    wow, twoWeek, fourWeek, meanReversionSignal, volatility,
    pricePosition, acceleration, receiptChange, yoyReceipts,
    receiptTrend, monthSin, monthCos, hayFlag, directionPersistence,
    highLowRatio,
  ];
}

function classifyDirection(priceChange: number): number {
  // 0 = down, 1 = flat, 2 = up — using ±2% threshold
  if (priceChange > 2) return 2;
  if (priceChange < -2) return 0;
  return 1;
}

function directionLabel(cls: number): "up" | "down" | "flat" {
  if (cls === 2) return "up";
  if (cls === 0) return "down";
  return "flat";
}

// ─── Build training data from auction history ───

function buildTrainingData(
  history: AuctionEntry[],
  category: string,
  isHay: boolean,
): { features: number[][]; labels: number[] } {
  const features: number[][] = [];
  const labels: number[] = [];

  // Build chronological price series for this category
  const priceSeries: PricePoint[] = [];
  // History comes newest-first from Redis, reverse for chronological order
  const chronological = [...history].reverse();

  for (const entry of chronological) {
    const catData = isHay
      ? entry.categories.find((c) => c.category === category && c.dressing === "Per Ton")
      : entry.categories.find((c) => c.category === category && c.dressing === "Average");
    if (catData) {
      priceSeries.push({
        date: entry.reportDate,
        price: catData.avgPrice,
        receipts: entry.totalReceipts,
        lastYearReceipts: entry.lastYearReceipts,
      });
    }
  }

  // Walk through and build training pairs
  for (let i = 4; i < priceSeries.length - 1; i++) {
    const window = priceSeries.slice(Math.max(0, i - 8), i + 1);
    const feat = extractFeatures(window, isHay);
    if (!feat) continue;

    const currentPrice = priceSeries[i].price;
    const nextPrice = priceSeries[i + 1].price;
    const change = ((nextPrice - currentPrice) / currentPrice) * 100;
    labels.push(classifyDirection(change));
    features.push(feat);
  }

  return { features, labels };
}

// ─── Generate reasoning from features ───

function buildReasoning(features: number[], isHay: boolean): string {
  const reasons: string[] = [];
  const [wow, twoWeek, fourWeek, meanReversion, volatility, pricePos, accel, receiptChange, yoyReceipts] = features;

  if (Math.abs(wow) > 1) {
    reasons.push(`${wow > 0 ? "+" : ""}${wow.toFixed(1)}% last week`);
  }
  if (Math.abs(twoWeek) > 2) {
    reasons.push(`${twoWeek > 0 ? "+" : ""}${twoWeek.toFixed(1)}% 2-week trend`);
  }
  if (Math.abs(meanReversion) > 3) {
    reasons.push(`${meanReversion > 0 ? "above" : "below"} moving avg (${meanReversion > 0 ? "+" : ""}${meanReversion.toFixed(1)}%)`);
  }
  if (Math.abs(receiptChange) > 10) {
    const unit = isHay ? "tonnage" : "supply";
    reasons.push(`${unit} ${receiptChange > 0 ? "up" : "down"} ${Math.abs(receiptChange).toFixed(0)}%`);
  }
  if (Math.abs(yoyReceipts) > 10) {
    reasons.push(`YoY receipts ${yoyReceipts > 0 ? "up" : "down"} ${Math.abs(yoyReceipts).toFixed(0)}%`);
  }
  if (volatility > 5) {
    reasons.push(`high volatility (${volatility.toFixed(1)}%)`);
  }
  if (pricePos > 0.85) {
    reasons.push("near recent highs");
  } else if (pricePos < 0.15) {
    reasons.push("near recent lows");
  }

  return reasons.length > 0 ? reasons.join("; ") : "ML model signal";
}

// ─── Generate Predictions (ML-powered) ───

export async function generatePredictions(): Promise<Prediction[]> {
  const predictions: Prediction[] = [];
  const now = new Date().toISOString();

  // Staleness cutoff: skip barns with no data in the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const staleCutoff = thirtyDaysAgo.toISOString().split("T")[0];

  // We need deep history for training — fetch up to 100 weeks
  const HISTORY_DEPTH = 100;

  // ─── Cattle Predictions ───

  for (const barn of BARNS) {
    if (!barn.categories.includes("slaughter_cattle")) continue;

    const history = await getAuctionHistory(barn.reportId, HISTORY_DEPTH);
    if (history.length < 12) {
      console.log(`⏭️  Not enough history for ${barn.shortName} (${history.length} weeks), need 12+`);
      continue;
    }

    const latest = history[0];
    if (latest.reportDate < staleCutoff) {
      console.log(`⏭️  ${barn.shortName} data is stale (${latest.reportDate}), skipping`);
      continue;
    }
    console.log(`\n🤖 ML predictions for ${barn.shortName} (${history.length} weeks history)...`);

    for (const trackedCat of TRACKED_CATEGORIES) {
      const pred = trainAndPredict(history, trackedCat, barn, latest, now, false);
      if (pred) {
        await storePrediction(pred);
        predictions.push(pred);
        const arrow = pred.predictedDirection === "up" ? "📈" : pred.predictedDirection === "down" ? "📉" : "➡️";
        console.log(`  ${arrow} ${trackedCat}: $${pred.currentAvgPrice.toFixed(2)} → ${pred.predictedDirection} (${pred.confidence}% conf)`);
      }
    }
  }

  // ─── Hay Predictions ───

  for (const barn of HAY_BARNS) {
    const history = await getAuctionHistory(barn.reportId, HISTORY_DEPTH);
    if (history.length < 12) {
      console.log(`⏭️  Not enough history for ${barn.shortName} (${history.length} weeks), need 12+`);
      continue;
    }

    const latest = history[0];
    if (latest.reportDate < staleCutoff) {
      console.log(`⏭️  ${barn.shortName} data is stale (${latest.reportDate}), skipping`);
      continue;
    }
    console.log(`\n🌾 ML hay predictions for ${barn.shortName} (${history.length} weeks history)...`);

    for (const trackedCat of TRACKED_HAY_CATEGORIES) {
      const pred = trainAndPredict(history, trackedCat, barn, latest, now, true);
      if (pred) {
        await storePrediction(pred);
        predictions.push(pred);
        const arrow = pred.predictedDirection === "up" ? "📈" : pred.predictedDirection === "down" ? "📉" : "➡️";
        console.log(`  ${arrow} ${trackedCat}: $${pred.currentAvgPrice.toFixed(2)}/ton → ${pred.predictedDirection} (${pred.confidence}% conf)`);
      }
    }
  }

  console.log(`\n✅ Generated ${predictions.length} ML predictions`);
  return predictions;
}

function trainAndPredict(
  history: AuctionEntry[],
  category: string,
  barn: { reportId: number; shortName: string },
  latest: AuctionEntry,
  now: string,
  isHay: boolean,
): Prediction | null {
  // Build training data
  const { features: trainFeatures, labels: trainLabels } = buildTrainingData(history, category, isHay);

  if (trainFeatures.length < 8) return null;

  // Need at least 2 classes to train
  const uniqueLabels = new Set(trainLabels);
  if (uniqueLabels.size < 2) return null;

  // Build prediction features from current state
  const chronological = [...history].reverse();
  const priceSeries: PricePoint[] = [];
  for (const entry of chronological) {
    const catData = isHay
      ? entry.categories.find((c) => c.category === category && c.dressing === "Per Ton")
      : entry.categories.find((c) => c.category === category && c.dressing === "Average");
    if (catData) {
      priceSeries.push({
        date: entry.reportDate,
        price: catData.avgPrice,
        receipts: entry.totalReceipts,
        lastYearReceipts: entry.lastYearReceipts,
      });
    }
  }

  if (priceSeries.length < 4) return null;
  const currentPrice = priceSeries[priceSeries.length - 1].price;

  const predWindow = priceSeries.slice(Math.max(0, priceSeries.length - 9));
  const predFeatures = extractFeatures(predWindow, isHay);
  if (!predFeatures) return null;

  try {
    // Train Random Forest
    const rf = new RandomForestClassifier({
      nEstimators: 50,
      maxFeatures: 0.7,
      replacement: true,
      seed: barn.reportId + trainFeatures.length,
    });
    rf.train(trainFeatures, trainLabels);

    // Predict
    const prediction = rf.predict([predFeatures])[0];
    const direction = directionLabel(prediction);

    // Confidence from vote agreement
    const allPredictions = (rf as any).estimators
      ? (rf as any).estimators.map((tree: any) => tree.predict([predFeatures])[0])
      : [];
    const voteCount = allPredictions.filter((p: number) => p === prediction).length;
    const confidence = allPredictions.length > 0
      ? Math.round((voteCount / allPredictions.length) * 100)
      : 50;

    // Skip low-confidence predictions (below 40%)
    if (confidence < 40) return null;

    // Build prediction object
    const latestDate = new Date(latest.reportDate);
    const nextDate = new Date(latestDate);
    nextDate.setDate(nextDate.getDate() + 7);
    const targetDate = nextDate.toISOString().split("T")[0];

    const catSlug = category.replace(/[^a-zA-Z0-9]/g, "-");
    const predId = `pred:${barn.reportId}:${catSlug}:${targetDate}`;

    const changeMultiplier = direction === "up" ? 1 : direction === "down" ? -1 : 0;
    const expectedMove = isHay ? 0.03 : 0.02;
    const expectedChange = currentPrice * (changeMultiplier * expectedMove);
    const predictedLow = currentPrice + expectedChange * 0.5;
    const predictedHigh = currentPrice + expectedChange * 1.5;

    const reasoning = buildReasoning(predFeatures, isHay);

    return {
      id: predId,
      reportId: barn.reportId,
      barnName: barn.shortName,
      category,
      predictionDate: now,
      targetDate,
      currentAvgPrice: currentPrice,
      predictedDirection: direction,
      predictedChangePercent: changeMultiplier * (isHay ? 3 : 2),
      predictedPriceRange: `${predictedLow.toFixed(2)}-${predictedHigh.toFixed(2)}`,
      confidence,
      reasoning,
      resolved: false,
    };
  } catch {
    return null;
  }
}

// ─── Resolve Predictions ───

export async function resolvePredictions(): Promise<{ resolved: number; correct: number }> {
  const unresolved = await getUnresolvedPredictions();
  let resolvedCount = 0;
  let correctCount = 0;

  console.log(`🔍 Checking ${unresolved.length} unresolved predictions...`);

  for (const pred of unresolved) {
    const latest = await getLatestAuction(pred.reportId);
    if (!latest || latest.reportDate < pred.targetDate) continue;

    const isHayBarn = HAY_BARNS.some((b) => b.reportId === pred.reportId);
    const actualCat = latest.categories.find(
      (c) => c.category === pred.category && c.dressing === (isHayBarn ? "Per Ton" : "Average"),
    );
    if (!actualCat) continue;

    const actualChange =
      ((actualCat.avgPrice - pred.currentAvgPrice) / pred.currentAvgPrice) * 100;
    let actualDirection: "up" | "down" | "flat";
    if (actualChange > 2) actualDirection = "up";
    else if (actualChange < -2) actualDirection = "down";
    else actualDirection = "flat";

    const correct = pred.predictedDirection === actualDirection;

    pred.resolved = true;
    pred.actualAvgPrice = actualCat.avgPrice;
    pred.actualDirection = actualDirection;
    pred.actualChangePercent = actualChange;
    pred.correct = correct;
    pred.resolvedAt = new Date().toISOString();

    await resolvePrediction(pred);
    resolvedCount++;
    if (correct) correctCount++;

    const icon = correct ? "✅" : "❌";
    console.log(
      `  ${icon} ${pred.barnName} ${pred.category}: predicted ${pred.predictedDirection}, actual ${actualDirection} ($${pred.currentAvgPrice.toFixed(2)} → $${actualCat.avgPrice.toFixed(2)})`,
    );
  }

  console.log(`\n📊 Resolved ${resolvedCount} predictions, ${correctCount} correct`);
  return { resolved: resolvedCount, correct: correctCount };
}
