// BarnSignal — AI Prediction Engine
// Analyzes auction data trends and generates price direction predictions

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

// ─── Trend Analysis (rule-based + AI-enhanced) ───

interface TrendSignal {
  category: string;
  currentPrice: number;
  priceHistory: number[];     // last N weeks avg prices
  receiptsTrend: number[];    // last N weeks total receipts
  weekOverWeekChange: number; // percent
  receiptChange: number;      // percent change in supply
  seasonalFactor: number;     // seasonal adjustment
  direction: "up" | "down" | "flat";
  confidence: number;
  reasoning: string;
}

function getSeasonalFactor(date: string, category: string): number {
  const month = new Date(date).getMonth(); // 0-11

  // Cattle seasonality patterns:
  // Spring (Mar-May): prices typically firm as grass season starts, supply tightens
  // Summer (Jun-Aug): steady to higher, grilling season demand
  // Fall (Sep-Nov): prices often soften as fall run increases supply
  // Winter (Dec-Feb): variable, holiday demand vs weather

  const seasonalMap: Record<number, number> = {
    0: -0.5,  // Jan - post-holiday softness
    1: 0,     // Feb - neutral
    2: 1.0,   // Mar - spring firming
    3: 1.5,   // Apr - strong spring demand
    4: 1.0,   // May - continued strength
    5: 0.5,   // Jun - grilling season starts
    6: 0.5,   // Jul - peak grilling
    7: 0,     // Aug - transitioning
    8: -1.0,  // Sep - fall run beginning
    9: -1.5,  // Oct - peak fall supply
    10: -0.5, // Nov - holiday demand helps
    11: 0,    // Dec - mixed signals
  };

  let factor = seasonalMap[month] || 0;

  // Dairy cows have different seasonality (culling patterns)
  if (category.includes("DAIRY COW")) {
    // More culling in spring (post-calving) and fall
    factor = month >= 2 && month <= 4 ? -1.0 : month >= 8 && month <= 10 ? -0.5 : 0.5;
  }

  return factor;
}

function getHaySeasonalFactor(date: string, category: string): number {
  const month = new Date(date).getMonth(); // 0-11

  // Hay seasonality patterns:
  // Winter (Dec-Feb): prices firm — low supply, high demand from livestock feeders
  // Spring (Mar-May): prices start easing as first cutting approaches
  // Summer (Jun-Aug): prices drop as fresh cuttings flood the market
  // Fall (Sep-Nov): prices firm again as supply from cuttings tapers off

  const haySeasonalMap: Record<number, number> = {
    0: 1.0,   // Jan - peak winter demand, tight supply
    1: 0.5,   // Feb - still firm, waiting on spring
    2: 0,     // Mar - transitioning, new crop anticipation
    3: -0.5,  // Apr - first cutting approaching
    4: -1.0,  // May - first cutting hits market
    5: -1.5,  // Jun - peak supply from first cutting
    6: -1.0,  // Jul - second cutting, ample supply
    7: -0.5,  // Aug - supply still good but easing
    8: 0,     // Sep - transition, fewer cuttings remaining
    9: 0.5,   // Oct - supply tightening
    10: 1.0,  // Nov - winter demand building
    11: 1.0,  // Dec - peak winter pricing
  };

  let factor = haySeasonalMap[month] || 0;

  // Straw follows grain harvest cycles — cheaper in summer/fall after harvest
  if (category.includes("Straw") || category.includes("Corn Stalk")) {
    factor = month >= 7 && month <= 10 ? -1.0 : month >= 0 && month <= 3 ? 0.5 : 0;
  }

  return factor;
}

function analyzeTrend(
  category: string,
  history: AuctionEntry[],
  barnName: string,
  isHay: boolean = false,
): TrendSignal | null {
  // Get this category's data across weeks
  const dataPoints: { date: string; avgPrice: number; head: number; totalReceipts: number }[] = [];

  for (const entry of history) {
    // Hay uses dressing="Per Ton", cattle uses dressing="Average"
    const catData = isHay
      ? entry.categories.find((c) => c.category === category && c.dressing === "Per Ton")
      : entry.categories.find((c) => c.category === category && c.dressing === "Average");
    if (catData) {
      dataPoints.push({
        date: entry.reportDate,
        avgPrice: catData.avgPrice,
        head: catData.head,
        totalReceipts: entry.totalReceipts,
      });
    }
  }

  if (dataPoints.length < 2) return null;

  const current = dataPoints[0];
  const previous = dataPoints[1];

  const weekOverWeekChange =
    ((current.avgPrice - previous.avgPrice) / previous.avgPrice) * 100;

  const receiptChange =
    previous.totalReceipts > 0
      ? ((current.totalReceipts - previous.totalReceipts) / previous.totalReceipts) * 100
      : 0;

  const priceHistory = dataPoints.map((d) => d.avgPrice);
  const receiptsTrend = dataPoints.map((d) => d.totalReceipts);

  // Seasonal factor — use hay-specific or cattle-specific
  const seasonalFactor = isHay
    ? getHaySeasonalFactor(current.date, category)
    : getSeasonalFactor(current.date, category);

  // ─── Prediction Logic ───
  // Combine multiple signals:
  // 1. Price momentum (recent trend)
  // 2. Supply changes (receipts up = price pressure down)
  // 3. Seasonal patterns
  // 4. Head count changes (fewer offered = possible scarcity premium)

  let score = 0;
  const reasons: string[] = [];

  // Signal 1: Price momentum (weight: 30%)
  if (weekOverWeekChange > 2) {
    score += 2;
    reasons.push(`prices up ${weekOverWeekChange.toFixed(1)}% last week (momentum)`);
  } else if (weekOverWeekChange < -2) {
    score -= 2;
    reasons.push(`prices down ${Math.abs(weekOverWeekChange).toFixed(1)}% last week (momentum)`);
  } else {
    reasons.push(`prices stable (${weekOverWeekChange > 0 ? "+" : ""}${weekOverWeekChange.toFixed(1)}%)`);
  }

  // Signal 2: 3-week trend
  if (dataPoints.length >= 3) {
    const threeWeekChange =
      ((current.avgPrice - dataPoints[2].avgPrice) / dataPoints[2].avgPrice) * 100;
    if (threeWeekChange > 3) {
      score += 1.5;
      reasons.push(`3-week uptrend (+${threeWeekChange.toFixed(1)}%)`);
    } else if (threeWeekChange < -3) {
      score -= 1.5;
      reasons.push(`3-week downtrend (${threeWeekChange.toFixed(1)}%)`);
    }
  }

  // Signal 3: Supply pressure (weight: 25%)
  const supplyUnit = isHay ? "tonnage" : "supply";
  if (receiptChange < -10) {
    score += 1.5; // fewer receipts = upward price pressure
    reasons.push(`${supplyUnit} down ${Math.abs(receiptChange).toFixed(0)}% (bullish)`);
  } else if (receiptChange > 10) {
    score -= 1.5; // more receipts = downward price pressure
    reasons.push(`${supplyUnit} up ${receiptChange.toFixed(0)}% (bearish)`);
  }

  // Signal 4: Seasonal (weight: 20%)
  score += seasonalFactor * 0.5;
  if (Math.abs(seasonalFactor) > 0.5) {
    reasons.push(
      `seasonal ${seasonalFactor > 0 ? "tailwind" : "headwind"} (${seasonalFactor > 0 ? "spring firming" : "seasonal pressure"})`
    );
  }

  // Signal 5: Year-over-year context
  if (dataPoints.length >= 1 && history[0]) {
    const yoyReceipts =
      ((history[0].totalReceipts - history[0].lastYearReceipts) / history[0].lastYearReceipts) * 100;
    if (yoyReceipts < -10) {
      score += 1;
      reasons.push(`YoY receipts down ${Math.abs(yoyReceipts).toFixed(0)}% (structural tightness)`);
    } else if (yoyReceipts > 10) {
      score -= 0.5;
      reasons.push(`YoY receipts up ${yoyReceipts.toFixed(0)}%`);
    }
  }

  // Convert score to direction
  let direction: "up" | "down" | "flat";
  if (score > 1.5) direction = "up";
  else if (score < -1.5) direction = "down";
  else direction = "flat";

  // Confidence based on signal strength and data depth
  const signalStrength = Math.min(Math.abs(score) / 5, 1); // normalize to 0-1
  const dataDepth = Math.min(dataPoints.length / 6, 1);    // more history = more confident
  const confidence = Math.round(
    (signalStrength * 0.6 + dataDepth * 0.4) * 100
  );

  return {
    category,
    currentPrice: current.avgPrice,
    priceHistory,
    receiptsTrend,
    weekOverWeekChange,
    receiptChange,
    seasonalFactor,
    direction,
    confidence: Math.max(15, Math.min(90, confidence)), // clamp 15-90
    reasoning: reasons.join("; "),
  };
}

// ─── Generate Predictions ───

export async function generatePredictions(): Promise<Prediction[]> {
  const predictions: Prediction[] = [];
  const now = new Date().toISOString();

  for (const barn of BARNS) {
    // Skip non-cattle barns for now
    if (!barn.categories.includes("slaughter_cattle")) continue;

    const history = await getAuctionHistory(barn.reportId, 8);
    if (history.length === 0) {
      console.log(`⏭️  No history for ${barn.shortName}, skipping predictions`);
      continue;
    }

    const latest = history[0];
    console.log(`\n🔮 Generating predictions for ${barn.shortName} (${latest.reportDate})...`);

    for (const trackedCat of TRACKED_CATEGORIES) {
      const signal = analyzeTrend(trackedCat, history, barn.shortName);
      if (!signal) continue;

      // Calculate next expected auction date
      const latestDate = new Date(latest.reportDate);
      const nextDate = new Date(latestDate);
      nextDate.setDate(nextDate.getDate() + 7); // next week
      const targetDate = nextDate.toISOString().split("T")[0];

      const catSlug = trackedCat.replace(/[^a-zA-Z0-9]/g, "-");
      const predId = `pred:${barn.reportId}:${catSlug}:${targetDate}`;

      // Predicted price range
      const changeMultiplier = signal.direction === "up" ? 1 : signal.direction === "down" ? -1 : 0;
      const expectedChange = signal.currentPrice * (changeMultiplier * 0.02); // ~2% move
      const predictedLow = signal.currentPrice + expectedChange * 0.5;
      const predictedHigh = signal.currentPrice + expectedChange * 1.5;

      const pred: Prediction = {
        id: predId,
        reportId: barn.reportId,
        barnName: barn.shortName,
        category: trackedCat,
        predictionDate: now,
        targetDate,
        currentAvgPrice: signal.currentPrice,
        predictedDirection: signal.direction,
        predictedChangePercent: changeMultiplier * 2,
        predictedPriceRange: `${predictedLow.toFixed(2)}-${predictedHigh.toFixed(2)}`,
        confidence: signal.confidence,
        reasoning: signal.reasoning,
        resolved: false,
      };

      await storePrediction(pred);
      predictions.push(pred);

      const arrow = signal.direction === "up" ? "📈" : signal.direction === "down" ? "📉" : "➡️";
      console.log(
        `  ${arrow} ${trackedCat}: $${signal.currentPrice.toFixed(2)} → ${signal.direction} (${signal.confidence}% conf)`
      );
    }
  }

  // ─── Hay Predictions ───

  for (const barn of HAY_BARNS) {
    const history = await getAuctionHistory(barn.reportId, 8);
    if (history.length === 0) {
      console.log(`⏭️  No history for ${barn.shortName}, skipping hay predictions`);
      continue;
    }

    const latest = history[0];
    console.log(`\n🌾 Generating hay predictions for ${barn.shortName} (${latest.reportDate})...`);

    for (const trackedCat of TRACKED_HAY_CATEGORIES) {
      const signal = analyzeTrend(trackedCat, history, barn.shortName, true);
      if (!signal) continue;

      const latestDate = new Date(latest.reportDate);
      const nextDate = new Date(latestDate);
      nextDate.setDate(nextDate.getDate() + 7);
      const targetDate = nextDate.toISOString().split("T")[0];

      const catSlug = trackedCat.replace(/[^a-zA-Z0-9]/g, "-");
      const predId = `pred:${barn.reportId}:${catSlug}:${targetDate}`;

      const changeMultiplier = signal.direction === "up" ? 1 : signal.direction === "down" ? -1 : 0;
      const expectedChange = signal.currentPrice * (changeMultiplier * 0.03); // ~3% move for hay (more volatile)
      const predictedLow = signal.currentPrice + expectedChange * 0.5;
      const predictedHigh = signal.currentPrice + expectedChange * 1.5;

      const pred: Prediction = {
        id: predId,
        reportId: barn.reportId,
        barnName: barn.shortName,
        category: trackedCat,
        predictionDate: now,
        targetDate,
        currentAvgPrice: signal.currentPrice,
        predictedDirection: signal.direction,
        predictedChangePercent: changeMultiplier * 3,
        predictedPriceRange: `${predictedLow.toFixed(2)}-${predictedHigh.toFixed(2)}`,
        confidence: signal.confidence,
        reasoning: signal.reasoning,
        resolved: false,
      };

      await storePrediction(pred);
      predictions.push(pred);

      const arrow = signal.direction === "up" ? "📈" : signal.direction === "down" ? "📉" : "➡️";
      console.log(
        `  ${arrow} ${trackedCat}: $${signal.currentPrice.toFixed(2)}/ton → ${signal.direction} (${signal.confidence}% conf)`
      );
    }
  }

  console.log(`\n✅ Generated ${predictions.length} predictions`);
  return predictions;
}

// ─── Resolve Predictions ───

export async function resolvePredictions(): Promise<{ resolved: number; correct: number }> {
  const unresolved = await getUnresolvedPredictions();
  let resolvedCount = 0;
  let correctCount = 0;

  console.log(`🔍 Checking ${unresolved.length} unresolved predictions...`);

  for (const pred of unresolved) {
    // Check if we have actual data for the target date
    const latest = await getLatestAuction(pred.reportId);
    if (!latest || latest.reportDate < pred.targetDate) continue;

    // Find the matching category in actual data
    // Hay barns use "Per Ton" dressing, cattle use "Average"
    const isHayBarn = HAY_BARNS.some((b) => b.reportId === pred.reportId);
    const actualCat = latest.categories.find(
      (c) => c.category === pred.category && c.dressing === (isHayBarn ? "Per Ton" : "Average")
    );
    if (!actualCat) continue;

    // Determine actual direction
    const actualChange =
      ((actualCat.avgPrice - pred.currentAvgPrice) / pred.currentAvgPrice) * 100;
    let actualDirection: "up" | "down" | "flat";
    if (actualChange > 1) actualDirection = "up";
    else if (actualChange < -1) actualDirection = "down";
    else actualDirection = "flat";

    // Score it
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
      `  ${icon} ${pred.barnName} ${pred.category}: predicted ${pred.predictedDirection}, actual ${actualDirection} ($${pred.currentAvgPrice.toFixed(2)} → $${actualCat.avgPrice.toFixed(2)})`
    );
  }

  console.log(`\n📊 Resolved ${resolvedCount} predictions, ${correctCount} correct`);
  return { resolved: resolvedCount, correct: correctCount };
}
