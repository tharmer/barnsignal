import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) throw new Error("Missing UPSTASH_REDIS_REST_URL or TOKEN");
    redis = new Redis({ url, token });
  }
  return redis;
}

// ─── Auction Data Storage ───

export interface AuctionEntry {
  reportId: number;
  barnName: string;
  location: string;
  reportDate: string;        // ISO date
  fetchedAt: string;         // ISO timestamp
  totalReceipts: number;
  lastWeekReceipts: number;
  lastYearReceipts: number;
  categories: CategoryData[];
  marketCommentary: string;  // the "Compared to last week..." text
}

export interface CategoryData {
  category: string;          // e.g. "STEERS - Choice 2-3"
  section: string;           // e.g. "SLAUGHTER CATTLE" or "FEEDER DAIRY CALVES"
  head: number;
  wtRange: string;
  avgWt: number;
  priceRange: string;
  avgPrice: number;
  dressing: string;          // Average, High, Low, Very Low
}

export async function storeAuctionData(entry: AuctionEntry): Promise<void> {
  const r = getRedis();
  const key = `auction:${entry.reportId}:${entry.reportDate}`;

  await r.set(key, JSON.stringify(entry)); // No TTL — this data is the asset

  // Also maintain a sorted set of dates per barn for history queries
  await r.zadd(`auction:${entry.reportId}:dates`, {
    score: new Date(entry.reportDate).getTime(),
    member: entry.reportDate,
  });

  // Latest pointer
  await r.set(`auction:${entry.reportId}:latest`, entry.reportDate);

  // ─── Durable Archive ───
  // Append to a per-barn archive list that never expires.
  // Each entry is a complete snapshot — the raw material for the dataset.
  // This is the insurance policy: even if hot keys get cleared, the archive survives.
  await r.lpush(
    `archive:${entry.reportId}`,
    JSON.stringify({ archivedAt: new Date().toISOString(), ...entry })
  );
}

export async function getLatestAuction(reportId: number): Promise<AuctionEntry | null> {
  const r = getRedis();
  const latestDate = await r.get<string>(`auction:${reportId}:latest`);
  if (!latestDate) return null;
  const data = await r.get<string>(`auction:${reportId}:${latestDate}`);
  return data ? JSON.parse(typeof data === "string" ? data : JSON.stringify(data)) : null;
}

export async function getAuctionHistory(
  reportId: number,
  weeks: number = 8
): Promise<AuctionEntry[]> {
  const r = getRedis();
  // Get last N dates
  const dates = await r.zrange<string[]>(
    `auction:${reportId}:dates`,
    "+inf",
    "-inf",
    { byScore: true, rev: true, offset: 0, count: weeks }
  );

  const entries: AuctionEntry[] = [];
  for (const date of dates) {
    const data = await r.get<string>(`auction:${reportId}:${date}`);
    if (data) {
      entries.push(typeof data === "string" ? JSON.parse(data) : data as unknown as AuctionEntry);
    }
  }
  return entries;
}

// ─── Prediction Storage ───

export interface Prediction {
  id: string;                // e.g. "pred:1908:STEERS-Choice-2-3:2026-03-30"
  reportId: number;
  barnName: string;
  category: string;
  predictionDate: string;    // when prediction was made
  targetDate: string;        // the auction date we're predicting for
  currentAvgPrice: number;   // price when prediction was made
  predictedDirection: "up" | "down" | "flat";
  predictedChangePercent: number;
  predictedPriceRange: string;
  confidence: number;        // 0-100
  reasoning: string;
  // Resolution fields (filled when actual data comes in)
  resolved: boolean;
  actualAvgPrice?: number;
  actualDirection?: "up" | "down" | "flat";
  actualChangePercent?: number;
  correct?: boolean;
  resolvedAt?: string;
}

export async function storePrediction(pred: Prediction): Promise<void> {
  const r = getRedis();
  await r.set(pred.id, JSON.stringify(pred)); // No TTL — prediction track record is permanent

  // Unresolved predictions set
  if (!pred.resolved) {
    await r.sadd("predictions:unresolved", pred.id);
  }

  // All predictions for accuracy tracking
  await r.zadd("predictions:all", {
    score: new Date(pred.predictionDate).getTime(),
    member: pred.id,
  });

  // Per-barn predictions
  await r.zadd(`predictions:barn:${pred.reportId}`, {
    score: new Date(pred.predictionDate).getTime(),
    member: pred.id,
  });
}

export async function getUnresolvedPredictions(): Promise<Prediction[]> {
  const r = getRedis();
  const ids = await r.smembers<string[]>("predictions:unresolved");
  const preds: Prediction[] = [];
  for (const id of ids) {
    const data = await r.get<string>(id);
    if (data) {
      preds.push(typeof data === "string" ? JSON.parse(data) : data as unknown as Prediction);
    }
  }
  return preds;
}

export async function resolvePrediction(pred: Prediction): Promise<void> {
  const r = getRedis();
  await r.set(pred.id, JSON.stringify(pred));
  await r.srem("predictions:unresolved", pred.id);
}

export async function getAllPredictions(limit: number = 50): Promise<Prediction[]> {
  const r = getRedis();
  const ids = await r.zrange<string[]>("predictions:all", "+inf", "-inf", {
    byScore: true, rev: true, offset: 0, count: limit,
  });
  const preds: Prediction[] = [];
  for (const id of ids) {
    const data = await r.get<string>(id);
    if (data) {
      preds.push(typeof data === "string" ? JSON.parse(data) : data as unknown as Prediction);
    }
  }
  return preds;
}

// ─── Accuracy Stats ───

export interface AccuracyStats {
  totalPredictions: number;
  resolved: number;
  correct: number;
  accuracy: number;
  byCategory: Record<string, { total: number; correct: number; accuracy: number }>;
  byBarn: Record<string, { total: number; correct: number; accuracy: number }>;
}

export async function getAccuracyStats(): Promise<AccuracyStats> {
  const preds = await getAllPredictions(200);
  const resolved = preds.filter((p) => p.resolved);
  const correct = resolved.filter((p) => p.correct);

  const byCategory: AccuracyStats["byCategory"] = {};
  const byBarn: AccuracyStats["byBarn"] = {};

  for (const p of resolved) {
    // By category
    if (!byCategory[p.category]) byCategory[p.category] = { total: 0, correct: 0, accuracy: 0 };
    byCategory[p.category].total++;
    if (p.correct) byCategory[p.category].correct++;
    byCategory[p.category].accuracy = Math.round(
      (byCategory[p.category].correct / byCategory[p.category].total) * 100
    );

    // By barn
    if (!byBarn[p.barnName]) byBarn[p.barnName] = { total: 0, correct: 0, accuracy: 0 };
    byBarn[p.barnName].total++;
    if (p.correct) byBarn[p.barnName].correct++;
    byBarn[p.barnName].accuracy = Math.round(
      (byBarn[p.barnName].correct / byBarn[p.barnName].total) * 100
    );
  }

  return {
    totalPredictions: preds.length,
    resolved: resolved.length,
    correct: correct.length,
    accuracy: resolved.length > 0 ? Math.round((correct.length / resolved.length) * 100) : 0,
    byCategory,
    byBarn,
  };
}

// ─── Archive Export ───

export async function getArchive(reportId: number): Promise<AuctionEntry[]> {
  const r = getRedis();
  const raw = await r.lrange<string>(`archive:${reportId}`, 0, -1);
  return raw.map((item) => {
    const parsed = typeof item === "string" ? JSON.parse(item) : item;
    return parsed as AuctionEntry;
  });
}

export async function getFullArchive(): Promise<Record<number, AuctionEntry[]>> {
  const r = getRedis();
  const result: Record<number, AuctionEntry[]> = {};

  // Scan for all archive keys
  const allBarns = [1908, 1909, 1916, 1917, 1918, 1920, 1870, 1872, 1880, 1974, 1919, 1725, 1716];
  for (const id of allBarns) {
    const entries = await getArchive(id);
    if (entries.length > 0) {
      result[id] = entries;
    }
  }
  return result;
}

// ─── Email Signups ───

export async function storeEmailSignup(email: string, region: string): Promise<{ ok: boolean; alreadyExists: boolean }> {
  const r = getRedis();
  const key = `signup:${email.toLowerCase().trim()}`;
  const exists = await r.exists(key);
  if (exists) return { ok: true, alreadyExists: true };

  await r.set(key, JSON.stringify({
    email: email.toLowerCase().trim(),
    region,
    signedUpAt: new Date().toISOString(),
  }));
  // Also add to the signup list for easy enumeration
  await r.lpush("signups:list", email.toLowerCase().trim());
  return { ok: true, alreadyExists: false };
}

export async function getSignupCount(): Promise<number> {
  const r = getRedis();
  return await r.llen("signups:list");
}
