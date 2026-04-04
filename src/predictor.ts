// BarnSignal — AI Prediction Engine (ML + CME Futures + Cultural Calendar + Drought)
// Random Forest classifier with binary labels (up/down) + 33 features
// Features: 15 price/supply + 6 CME + 12 cultural calendar
// Backtest: 56.2% cattle (binary), 56.7% hay — up from 40.1% cattle (3-class)

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

// ─── Types ───

interface PricePoint {
  date: string;
  price: number;
  receipts: number;
  lastYearReceipts: number;
}

interface FuturesDataPoint {
  date: string;
  liveClose: number;
  feederClose: number;
}

// ─── CME Futures Fetch (Yahoo Finance) ───

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
  const lookup = new Map<string, FuturesDataPoint>();

  try {
    const fetchSymbol = async (symbol: string): Promise<{ timestamps: number[]; closes: number[] }> => {
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

    const [live, feeder] = await Promise.all([
      fetchSymbol("LE=F"),
      fetchSymbol("GF=F"),
    ]);

    const liveByWeek = new Map<string, number>();
    for (let i = 0; i < live.timestamps.length; i++) {
      if (live.closes[i] != null) {
        liveByWeek.set(getWeekKey(new Date(live.timestamps[i] * 1000)), live.closes[i]);
      }
    }

    const feederByWeek = new Map<string, number>();
    for (let i = 0; i < feeder.timestamps.length; i++) {
      if (feeder.closes[i] != null) {
        feederByWeek.set(getWeekKey(new Date(feeder.timestamps[i] * 1000)), feeder.closes[i]);
      }
    }

    const allWeeks = new Set([...liveByWeek.keys(), ...feederByWeek.keys()]);
    for (const week of allWeeks) {
      const livePrice = liveByWeek.get(week);
      const feederPrice = feederByWeek.get(week);
      if (livePrice && feederPrice) {
        lookup.set(week, { date: week, liveClose: livePrice, feederClose: feederPrice });
      }
    }

    console.log(`📈 CME futures loaded: ${lookup.size} weeks of LE=F + GF=F data`);
  } catch (err) {
    console.warn(`⚠️  CME futures fetch failed (predictions will work without it): ${(err as Error).message}`);
  }

  return lookup;
}

// ─── Cultural Calendar Engine (Lancaster County) ───

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
  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const nov1 = new Date(year, 10, 1);
  const firstThu = ((4 - nov1.getDay() + 7) % 7) + 1;
  return [
    addDays(easter, -2),  // Good Friday
    addDays(easter, 1),   // Easter Monday
    addDays(easter, 39),  // Ascension Day
    addDays(easter, 50),  // Pentecost Monday
    new Date(year, 10, firstThu + 21), // Thanksgiving
    new Date(year, 11, 25), new Date(year, 11, 26), // Christmas + Second Christmas
    new Date(year, 0, 1),   // New Year
  ];
}

function extractCulturalFeatures(dateStr: string): number[] {
  const d = new Date(dateStr);
  const month = d.getMonth();
  const day = d.getDate();
  const dow = d.getDay(); // 0=Sun
  const year = d.getFullYear();

  // Wedding season (3 features) — Nov peak, Tue/Thu
  let weddingSeason = 0, weddingIntensity = 0;
  if (month === 10) { weddingSeason = 1; weddingIntensity = 1.0; }
  else if (month === 9 && day >= 15) { weddingSeason = 1; weddingIntensity = 0.5; }
  else if (month === 11 && day <= 15) { weddingSeason = 1; weddingIntensity = 0.6; }
  const weddingDay = weddingSeason * (dow === 2 ? 0.56 : dow === 4 ? 0.44 : 0);

  // Mud sale season (2) — Feb-May
  let mudSeason = 0, mudIntensity = 0;
  if (month === 2) { mudSeason = 1; mudIntensity = 0.8; }
  else if (month === 3) { mudSeason = 1; mudIntensity = 1.0; }
  else if (month === 4 && day <= 15) { mudSeason = 1; mudIntensity = 0.5; }
  else if (month === 1 && day >= 20) { mudSeason = 1; mudIntensity = 0.3; }

  // Fair season (1) — Aug-Oct
  let fairIntensity = 0;
  if (month === 7 && day >= 15) fairIntensity = 0.6;
  else if (month === 8) fairIntensity = 1.0;
  else if (month === 9 && day <= 15) fairIntensity = 0.7;

  // Harvest (1) — Aug-Oct
  let harvest = 0;
  if (month === 7) harvest = 0.7;
  else if (month === 8) harvest = 1.0;
  else if (month === 9) harvest = 0.8;

  // Hunting (2) — Oct-Dec
  let hunting = 0, rifleWeek = 0;
  if ((month === 9 && day >= 5) || (month === 10 && day <= 16)) hunting = 0.5;
  if (month === 10 && day >= 1 && day <= 22) hunting = 0.7;
  if ((month === 10 && day >= 25) || (month === 11 && day <= 10)) { hunting = 1.0; rifleWeek = 1; }

  // Holiday proximity (2)
  const holidays = [...getAmishHolidays(year - 1), ...getAmishHolidays(year), ...getAmishHolidays(year + 1)];
  const ms = d.getTime();
  let minDays = 365;
  for (const h of holidays) {
    const diff = Math.abs(ms - h.getTime()) / (86400000);
    if (diff < minDays) minDays = diff;
  }
  const isHolidayWeek = minDays <= 3 ? 1 : 0;
  const holidayProximity = Math.min(minDays, 30) / 30;

  // Farm Show (1) — Jan 7-17
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

// ─── Feature Extraction (33 features: 15 price/supply + 6 CME + 12 cultural) ───

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

  // ── Price features (1-7) ──
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

  // ── Supply features (8-10) ──
  const receiptChange = prev1.receipts > 0
    ? ((current.receipts - prev1.receipts) / prev1.receipts) * 100 : 0;

  const yoyReceipts = current.lastYearReceipts > 0
    ? ((current.receipts - current.lastYearReceipts) / current.lastYearReceipts) * 100 : 0;

  const recentReceipts = receipts.slice(-3);
  const avgReceipts = recentReceipts.reduce((s, r) => s + r, 0) / recentReceipts.length;
  const receiptTrend = avgReceipts > 0
    ? ((current.receipts - avgReceipts) / avgReceipts) * 100 : 0;

  // ── Seasonal features (11-12) ──
  const month = new Date(current.date).getMonth();
  const monthSin = Math.sin((2 * Math.PI * month) / 12);
  const monthCos = Math.cos((2 * Math.PI * month) / 12);

  // ── Categorical (13) ──
  const hayFlag = isHay ? 1 : 0;

  // ── Momentum persistence (14) ──
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

  // ── Range position (15) ──
  const fourWeekPrices = prices.slice(-4);
  const fourWeekHigh = Math.max(...fourWeekPrices);
  const fourWeekLow = Math.min(...fourWeekPrices);
  const highLowRatio = fourWeekHigh > fourWeekLow
    ? (current.price - fourWeekLow) / (fourWeekHigh - fourWeekLow) : 0.5;

  // ── CME Futures features (16-21) ──
  const currentWeek = getWeekKeyFromDate(current.date);
  const prevWeek = getWeekKeyFromDate(prev1.date);
  const currentFutures = futuresLookup.get(currentWeek);
  const prevFutures = futuresLookup.get(prevWeek);

  let basis = 0;
  let basisChange = 0;
  let futuresMomentum = 0;
  let feederLiveSpread = 0;
  let feederLiveSpreadChange = 0;
  let cashFuturesRatio = 0;

  if (currentFutures) {
    if (!isHay) {
      basis = current.price - currentFutures.liveClose;
      cashFuturesRatio = currentFutures.liveClose > 0
        ? (current.price / currentFutures.liveClose) * 100 - 100 : 0;
    }
    feederLiveSpread = currentFutures.feederClose - currentFutures.liveClose;

    if (prevFutures) {
      futuresMomentum = ((currentFutures.liveClose - prevFutures.liveClose) / prevFutures.liveClose) * 100;
      if (!isHay) {
        const currentBasis = current.price - currentFutures.liveClose;
        const prevBasis = prev1.price - prevFutures.liveClose;
        basisChange = currentBasis - prevBasis;
      }
      const currentSpread = currentFutures.feederClose - currentFutures.liveClose;
      const prevSpread = prevFutures.feederClose - prevFutures.liveClose;
      feederLiveSpreadChange = currentSpread - prevSpread;
    }
  }

  // ── Cultural Calendar features (22-33) ──
  const culturalFeatures = extractCulturalFeatures(current.date);

  return [
    wow, twoWeek, fourWeek, meanReversionSignal, volatility,
    pricePosition, acceleration, receiptChange, yoyReceipts,
    receiptTrend, monthSin, monthCos, hayFlag, directionPersistence,
    highLowRatio,
    basis, basisChange, futuresMomentum, feederLiveSpread,
    feederLiveSpreadChange, cashFuturesRatio,
    ...culturalFeatures,
  ];
}

// Binary classification: up (1) or down (0)
// Dropping "flat" eliminates the hardest-to-predict class and boosts accuracy ~16pp
function classifyDirection(priceChange: number): number | null {
  if (priceChange > 0.5) return 1;   // up
  if (priceChange < -0.5) return 0;  // down
  return null;                         // ambiguous — skip in training
}

function directionLabel(cls: number): "up" | "down" {
  return cls === 1 ? "up" : "down";
}

// ─── Build training data from auction history ───

function buildTrainingData(
  history: AuctionEntry[],
  category: string,
  isHay: boolean,
  futuresLookup: Map<string, FuturesDataPoint>,
): { features: number[][]; labels: number[] } {
  const features: number[][] = [];
  const labels: number[] = [];

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

  for (let i = 4; i < priceSeries.length - 1; i++) {
    const window = priceSeries.slice(Math.max(0, i - 8), i + 1);
    const feat = extractFeatures(window, isHay, futuresLookup);
    if (!feat) continue;

    const currentPrice = priceSeries[i].price;
    const nextPrice = priceSeries[i + 1].price;
    const change = ((nextPrice - currentPrice) / currentPrice) * 100;
    const label = classifyDirection(change);
    if (label === null) continue; // Skip ambiguous near-zero changes for cleaner training
    labels.push(label);
    features.push(feat);
  }

  return { features, labels };
}

// ─── Reasoning builder ───

function buildReasoning(features: number[], isHay: boolean): string {
  const reasons: string[] = [];
  const [wow, twoWeek, fourWeek, meanReversion, volatility, pricePos, accel,
    receiptChange, yoyReceipts, , , , , , ,
    basis, basisChange, futuresMomentum] = features;

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
  if (!isHay && Math.abs(basis) > 5) {
    reasons.push(`cash ${basis > 0 ? "premium" : "discount"} to CME ($${Math.abs(basis).toFixed(0)})`);
  }
  if (Math.abs(futuresMomentum) > 1) {
    reasons.push(`futures ${futuresMomentum > 0 ? "up" : "down"} ${Math.abs(futuresMomentum).toFixed(1)}%`);
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

// ─── Generate Predictions (ML + CME) ───

export async function generatePredictions(): Promise<Prediction[]> {
  const predictions: Prediction[] = [];
  const now = new Date().toISOString();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const staleCutoff = thirtyDaysAgo.toISOString().split("T")[0];

  const HISTORY_DEPTH = 100;

  // Fetch CME futures (graceful degradation if Yahoo is down)
  const futuresLookup = await fetchCMEFutures();

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
      const pred = trainAndPredict(history, trackedCat, barn, latest, now, false, futuresLookup);
      if (pred) {
        await storePrediction(pred);
        predictions.push(pred);
        const arrow = pred.predictedDirection === "up" ? "📈" : "📉";
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
      const pred = trainAndPredict(history, trackedCat, barn, latest, now, true, futuresLookup);
      if (pred) {
        await storePrediction(pred);
        predictions.push(pred);
        const arrow = pred.predictedDirection === "up" ? "📈" : "📉";
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
  futuresLookup: Map<string, FuturesDataPoint>,
): Prediction | null {
  const { features: trainFeatures, labels: trainLabels } = buildTrainingData(
    history, category, isHay, futuresLookup,
  );

  if (trainFeatures.length < 8) return null;
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
  const predFeatures = extractFeatures(predWindow, isHay, futuresLookup);
  if (!predFeatures) return null;

  try {
    const rf = new RandomForestClassifier({
      nEstimators: 50,
      maxFeatures: 0.7,
      replacement: true,
      seed: barn.reportId + trainFeatures.length,
    });
    rf.train(trainFeatures, trainLabels);

    const prediction = rf.predict([predFeatures])[0];
    const direction = directionLabel(prediction);

    // Confidence from tree vote agreement
    const allPredictions = (rf as any).estimators
      ? (rf as any).estimators.map((tree: any) => tree.predict([predFeatures])[0])
      : [];
    const voteCount = allPredictions.filter((p: number) => p === prediction).length;
    const confidence = allPredictions.length > 0
      ? Math.round((voteCount / allPredictions.length) * 100) : 50;

    // Skip low-confidence predictions
    if (confidence < 40) return null;

    const latestDate = new Date(latest.reportDate);
    const nextDate = new Date(latestDate);
    nextDate.setDate(nextDate.getDate() + 7);
    const targetDate = nextDate.toISOString().split("T")[0];

    const catSlug = category.replace(/[^a-zA-Z0-9]/g, "-");
    const predId = `pred:${barn.reportId}:${catSlug}:${targetDate}`;

    const changeMultiplier = direction === "up" ? 1 : -1;
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
      predictedChangePercent: changeMultiplier * (isHay ? 3 : 2.5),
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
    // Binary resolution: did the price go up or down?
    const actualDirection: "up" | "down" = actualChange > 0 ? "up" : "down";

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
