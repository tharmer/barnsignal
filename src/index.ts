// BarnSignal — Express Server
// Serves dashboard, API endpoints, and cron handlers

import express from "express";
import { renderDashboard } from "./dashboard.js";
import { fetchAllBarns } from "./fetcher.js";
import { generatePredictions, resolvePredictions } from "./predictor.js";
import {
  getLatestAuction,
  getAllPredictions,
  getAccuracyStats,
  getAuctionHistory,
} from "./redis.js";
import { BARNS } from "./config.js";

const app = express();

// ─── Dashboard ───

app.get("/", async (req, res) => {
  try {
    const region = (req.query.region as string) || "all";
    const html = await renderDashboard(region);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).send(`<h1>BarnSignal Error</h1><pre>${(err as Error).message}</pre>`);
  }
});

// ─── API: Fetch auction data ───

app.get("/api/fetch", async (_req, res) => {
  try {
    const entries = await fetchAllBarns();
    res.json({
      success: true,
      fetched: entries.length,
      barns: entries.map((e) => ({
        name: e.barnName,
        date: e.reportDate,
        receipts: e.totalReceipts,
        categories: e.categories.length,
      })),
    });
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Alias for POST
app.post("/api/fetch", async (_req, res) => {
  try {
    const entries = await fetchAllBarns();
    res.json({
      success: true,
      fetched: entries.length,
      barns: entries.map((e) => ({
        name: e.barnName,
        date: e.reportDate,
        receipts: e.totalReceipts,
        categories: e.categories.length,
      })),
    });
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── API: Generate predictions ───

app.get("/api/predict", async (_req, res) => {
  try {
    const predictions = await generatePredictions();
    res.json({
      success: true,
      predictions: predictions.length,
      summary: predictions.map((p) => ({
        barn: p.barnName,
        category: p.category,
        direction: p.predictedDirection,
        confidence: p.confidence,
        currentPrice: p.currentAvgPrice,
        targetDate: p.targetDate,
      })),
    });
  } catch (err) {
    console.error("Predict error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── API: Resolve predictions ───

app.get("/api/resolve", async (_req, res) => {
  try {
    const result = await resolvePredictions();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Resolve error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── API: Get accuracy stats ───

app.get("/api/stats", async (_req, res) => {
  try {
    const stats = await getAccuracyStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── API: Get latest auction data for a barn ───

app.get("/api/barn/:reportId", async (req, res) => {
  try {
    const reportId = parseInt(req.params.reportId);
    const latest = await getLatestAuction(reportId);
    if (!latest) {
      res.status(404).json({ error: "No data for this barn" });
      return;
    }
    res.json(latest);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── API: Get barn history ───

app.get("/api/barn/:reportId/history", async (req, res) => {
  try {
    const reportId = parseInt(req.params.reportId);
    const weeks = parseInt((req.query.weeks as string) || "8");
    const history = await getAuctionHistory(reportId, weeks);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── API: All predictions ───

app.get("/api/predictions", async (_req, res) => {
  try {
    const preds = await getAllPredictions(100);
    res.json(preds);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Cron endpoints (for Vercel cron) ───

app.get("/api/cron/fetch", async (_req, res) => {
  try {
    console.log("🕐 Cron: Fetching auction data...");
    const entries = await fetchAllBarns();
    // Also resolve any pending predictions with new data
    const resolved = await resolvePredictions();
    res.json({
      success: true,
      fetched: entries.length,
      resolved: resolved.resolved,
    });
  } catch (err) {
    console.error("Cron fetch error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/cron/predict", async (_req, res) => {
  try {
    console.log("🕐 Cron: Generating predictions...");
    const predictions = await generatePredictions();
    res.json({
      success: true,
      predictions: predictions.length,
    });
  } catch (err) {
    console.error("Cron predict error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Health check ───

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "barnsignal",
    version: "1.0.0",
    barns: BARNS.length,
    timestamp: new Date().toISOString(),
  });
});

// ─── Start ───

const PORT = process.env.PORT || 3001;

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🐄 BarnSignal running on http://localhost:${PORT}`);
  });
}

export default app;
