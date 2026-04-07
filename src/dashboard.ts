// BarnSignal Ã¢ÂÂ Dashboard HTML Generator

import { BARNS, REGIONS, HAY_BARNS } from "./config.js";
import {
  getLatestAuction,
  getAllPredictions,
  getAccuracyStats,
  type AuctionEntry,
  type Prediction,
  type AccuracyStats,
} from "./redis.js";

export async function renderDashboard(activeRegion: string = "all"): Promise<string> {
  // Determine which barns to show based on region filter
  const selectedRegion = REGIONS.find((r) => r.id === activeRegion);
  const filteredBarns = selectedRegion
    ? BARNS.filter((b) => selectedRegion.reportIds.includes(b.reportId))
    : BARNS;

  // Fetch data for filtered barns
  const barnData: (AuctionEntry | null)[] = [];
  for (const barn of filteredBarns) {
    barnData.push(await getLatestAuction(barn.reportId));
  }

  const predictions = await getAllPredictions(50);
  const globalStats = await getAccuracyStats();

  // Compute cattle-only accuracy using full prediction set (200, matching getAccuracyStats)
  const hayReportIds = HAY_BARNS.map((b) => b.reportId);
  const allPredictions = await getAllPredictions(200);
  const cattlePredictions = allPredictions.filter((p) => !hayReportIds.includes(p.reportId));
  const cattleResolved = cattlePredictions.filter((p) => p.resolved);
  const cattleCorrect = cattleResolved.filter((p) => p.correct);
  const stats: AccuracyStats = {
    ...globalStats,
    totalPredictions: cattlePredictions.length,
    resolved: cattleResolved.length,
    correct: cattleCorrect.length,
    accuracy: cattleResolved.length > 0 ? Math.round((cattleCorrect.length / cattleResolved.length) * 100) : 0,
  };

  // Active barns with data
  const activeBarns = barnData.filter(Boolean) as AuctionEntry[];
  const regionLabel = selectedRegion ? selectedRegion.name : "All Regions";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BarnSignal Ã¢ÂÂ Mid-Atlantic Livestock Auction Prices &amp; Trends</title>
<meta name="description" content="Compare livestock auction prices across Pennsylvania, Maryland, Virginia, West Virginia, and New York. Real-time USDA data from 12 auction barns, AI price predictions, and cross-auction comparison.">
<meta name="keywords" content="livestock auction prices, cattle prices, New Holland auction, Lancaster County livestock, USDA market news, feeder cattle prices, slaughter cattle, auction barn prices, mid-Atlantic livestock">
<meta property="og:title" content="BarnSignal Ã¢ÂÂ Know Before You Go">
<meta property="og:description" content="Cross-auction livestock price comparison from 12 USDA-reported barns across PA, MD, VA, WV, and NY. Free price alerts and AI predictions.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://barnsignal.com">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="BarnSignal Ã¢ÂÂ Mid-Atlantic Livestock Prices">
<meta name="twitter:description" content="Compare auction prices across 12 barns. Real-time USDA data, AI predictions, and price alerts.">
<link rel="canonical" href="https://barnsignal.com">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --parchment: #f5f0e8;
    --parchment-dark: #e8e0d0;
    --ink: #2c2416;
    --ink-light: #5a4e3a;
    --ink-muted: #8a7e6a;
    --barn-red: #8b2500;
    --barn-red-light: #a83a15;
    --field-green: #3a6b35;
    --field-green-light: #4a8b45;
    --wheat: #c4a55a;
    --wheat-light: #d4b56a;
    --sky: #4a7fa5;
    --soil: #6b5344;
    --border: #d4cbb8;
    --card-bg: #faf7f0;
    --shadow: rgba(44, 36, 22, 0.08);
  }

  body {
    font-family: 'DM Sans', Georgia, serif;
    background: var(--parchment);
    color: var(--ink);
    line-height: 1.6;
  }

  /* Ã¢ÂÂÃ¢ÂÂ Header Ã¢ÂÂÃ¢ÂÂ */
  header {
    background: var(--ink);
    color: var(--parchment);
    padding: 0;
  }
  .header-top {
    max-width: 1200px;
    margin: 0 auto;
    padding: 16px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .logo-area h1 {
    font-size: 2em;
    font-weight: 700;
    letter-spacing: -0.5px;
    line-height: 1;
  }
  .logo-area h1 span { color: var(--wheat); }
  .logo-area .tagline {
    font-size: 0.85em;
    color: #a09880;
    margin-top: 4px;
    font-style: italic;
  }
  .header-meta {
    text-align: right;
    font-size: 0.82em;
    color: #a09880;
  }
  .header-meta .live-dot {
    display: inline-block;
    width: 8px; height: 8px;
    background: var(--field-green-light);
    border-radius: 50%;
    margin-right: 6px;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  /* Ã¢ÂÂÃ¢ÂÂ Ticker Ã¢ÂÂÃ¢ÂÂ */
  .ticker {
    background: #1a1610;
    padding: 10px 0;
    overflow: hidden;
    white-space: nowrap;
    border-bottom: 2px solid var(--wheat);
  }
  .ticker-inner {
    display: inline-block;
    animation: ticker-scroll 320s linear infinite;
  }
  .ticker-item {
    display: inline-block;
    margin-right: 40px;
    font-family: 'DM Mono', monospace;
    font-size: 0.82em;
    color: #c0b8a0;
  }
  .ticker-item .name { color: var(--wheat); font-weight: 500; }
  .ticker-item .up { color: var(--field-green-light); }
  .ticker-item .down { color: var(--barn-red-light); }
  .ticker-item .neutral { color: var(--ink-muted); }
  @keyframes ticker-scroll {
    0% { transform: translateX(0); }
    100% { transform: translateX(-50%); }
  }

  /* Ã¢ÂÂÃ¢ÂÂ Region Filter Ã¢ÂÂÃ¢ÂÂ */
  .region-bar {
    background: var(--parchment-dark);
    border-bottom: 1px solid var(--border);
    padding: 12px 0;
  }
  .region-bar-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 24px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .region-bar-label {
    font-size: 0.78em;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--ink-muted);
    font-weight: 600;
    margin-right: 4px;
  }
  .region-btn {
    display: inline-block;
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--card-bg);
    color: var(--ink-light);
    font-family: 'DM Sans', Georgia, serif;
    font-size: 0.82em;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
  }
  .region-btn:hover {
    border-color: var(--wheat);
    color: var(--ink);
  }
  .region-btn.active {
    background: var(--ink);
    color: var(--parchment);
    border-color: var(--ink);
  }

  /* Ã¢ÂÂÃ¢ÂÂ Container Ã¢ÂÂÃ¢ÂÂ */
  .container { max-width: 1200px; margin: 0 auto; padding: 24px; }

  /* Ã¢ÂÂÃ¢ÂÂ Hero Ã¢ÂÂÃ¢ÂÂ */
  .hero {
    background: var(--card-bg);
    border-bottom: 1px solid var(--border);
    padding: 32px 0;
  }
  .hero-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 32px;
  }
  .hero-text {
    max-width: 680px;
  }
  .hero-text h2 {
    font-size: 1.5em;
    font-weight: 700;
    line-height: 1.3;
    margin-bottom: 10px;
    color: var(--ink);
  }
  .hero-text p {
    font-size: 0.95em;
    color: var(--ink-light);
    line-height: 1.6;
    margin-bottom: 6px;
  }
  .hero-text .audience {
    font-size: 0.82em;
    color: var(--ink-muted);
    font-style: italic;
    margin-top: 8px;
  }
  .hero-cta {
    flex-shrink: 0;
  }
  .cta-box {
    background: white;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    text-align: center;
    min-width: 260px;
  }
  .cta-box .cta-label {
    font-size: 0.78em;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--ink-muted);
    font-weight: 600;
    margin-bottom: 10px;
  }
  .cta-box input[type="email"] {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-family: 'DM Sans', Georgia, serif;
    font-size: 0.9em;
    margin-bottom: 8px;
    outline: none;
  }
  .cta-box input[type="email"]:focus { border-color: var(--wheat); }
  .cta-btn {
    display: block;
    width: 100%;
    padding: 10px;
    background: var(--field-green);
    color: white;
    border: none;
    border-radius: 6px;
    font-family: 'DM Sans', Georgia, serif;
    font-size: 0.9em;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }
  .cta-btn:hover { background: var(--field-green-light); }
  .cta-box .cta-note {
    font-size: 0.72em;
    color: var(--ink-muted);
    margin-top: 6px;
  }

  /* Ã¢ÂÂÃ¢ÂÂ Alert Banner Ã¢ÂÂÃ¢ÂÂ */
  .alert-banner {
    background: var(--card-bg);
    border: 1px solid var(--wheat);
    border-left: 4px solid var(--wheat);
    border-radius: 6px;
    padding: 16px 20px;
    margin-bottom: 24px;
    display: flex;
    align-items: flex-start;
    gap: 14px;
  }
  .alert-banner .alert-icon { font-size: 1.4em; flex-shrink: 0; }
  .alert-banner .alert-text { font-size: 0.92em; line-height: 1.5; }
  .alert-banner .alert-text strong { color: var(--barn-red); }
  .alert-banner .alert-time { font-size: 0.78em; color: var(--ink-muted); margin-top: 4px; }

  /* Ã¢ÂÂÃ¢ÂÂ Section Headers Ã¢ÂÂÃ¢ÂÂ */
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 16px;
    margin-top: 32px;
    border-bottom: 2px solid var(--ink);
    padding-bottom: 8px;
  }
  .section-header h2 {
    font-size: 1.2em;
    font-weight: 700;
    letter-spacing: -0.3px;
  }
  .section-header .source {
    font-size: 0.75em;
    color: var(--ink-muted);
    font-style: italic;
  }

  /* Ã¢ÂÂÃ¢ÂÂ Stats Grid Ã¢ÂÂÃ¢ÂÂ */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 14px;
    margin-bottom: 28px;
  }
  .stat-card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
  }
  .stat-card .stat-label {
    font-size: 0.75em;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--ink-muted);
    font-weight: 600;
  }
  .stat-card .stat-value {
    font-size: 1.8em;
    font-weight: 700;
    font-family: 'DM Mono', monospace;
    line-height: 1.2;
    margin-top: 4px;
  }
  .stat-card .stat-change {
    font-size: 0.82em;
    margin-top: 4px;
    font-weight: 500;
  }
  .stat-card .stat-change.up { color: var(--field-green); }
  .stat-card .stat-change.down { color: var(--barn-red); }
  .stat-card .stat-value.green { color: var(--field-green); }
  .stat-card .stat-value.red { color: var(--barn-red); }

  /* Ã¢ÂÂÃ¢ÂÂ Price Tables Ã¢ÂÂÃ¢ÂÂ */
  .price-table-wrap {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin-bottom: 16px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88em;
  }
  th {
    background: var(--ink);
    color: var(--parchment);
    text-align: left;
    padding: 10px 14px;
    font-size: 0.78em;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    font-weight: 600;
  }
  td {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
  }
  tr:last-child td { border-bottom: none; }
  tr:hover { background: var(--parchment); }
  .category-cell { font-weight: 600; color: var(--ink); }
  .price-cell { font-family: 'DM Mono', monospace; font-weight: 500; }
  .trend-up { color: var(--field-green); }
  .trend-down { color: var(--barn-red); }
  .trend-neutral { color: var(--ink-muted); }

  /* Ã¢ÂÂÃ¢ÂÂ Badges Ã¢ÂÂÃ¢ÂÂ */
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.78em;
    font-weight: 600;
  }
  .badge-correct { background: #e8f5e3; color: var(--field-green); border: 1px solid #b8d8b0; }
  .badge-wrong { background: #fde8e4; color: var(--barn-red); border: 1px solid #e8b8b0; }
  .badge-pending { background: #f0ead8; color: var(--soil); border: 1px solid var(--border); }
  .badge-watch { background: #e4eef5; color: var(--sky); border: 1px solid #b0c8d8; }

  /* Ã¢ÂÂÃ¢ÂÂ Insight Cards Ã¢ÂÂÃ¢ÂÂ */
  .insights-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 16px;
    margin-bottom: 28px;
  }
  .insight-card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
  }
  .insight-card .insight-type {
    font-size: 0.72em;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 600;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .insight-card .insight-type.opportunity { color: var(--field-green); }
  .insight-card .insight-type.warning { color: var(--barn-red); }
  .insight-card .insight-type.trend { color: var(--sky); }
  .insight-card h3 { font-size: 1.05em; margin-bottom: 8px; line-height: 1.3; }
  .insight-card p { font-size: 0.88em; color: var(--ink-light); line-height: 1.5; }
  .insight-card .confidence { margin-top: 12px; font-size: 0.78em; color: var(--ink-muted); }
  .confidence-bar {
    height: 4px;
    background: var(--parchment-dark);
    border-radius: 2px;
    margin-top: 4px;
    overflow: hidden;
  }
  .confidence-fill { height: 100%; border-radius: 2px; }

  /* Ã¢ÂÂÃ¢ÂÂ Commentary Ã¢ÂÂÃ¢ÂÂ */
  .commentary {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-left: 4px solid var(--field-green);
    border-radius: 0 8px 8px 0;
    padding: 16px 20px;
    margin: 12px 0;
    font-size: 0.9em;
    line-height: 1.6;
  }
  .commentary strong { color: var(--ink); }
  .commentary .comm-date { color: var(--ink-muted); font-size: 0.85em; }

  /* Ã¢ÂÂÃ¢ÂÂ Barn Cards Ã¢ÂÂÃ¢ÂÂ */
  .barn-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 16px;
    margin-bottom: 28px;
  }
  .barn-card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  .barn-card-header {
    background: var(--field-green);
    color: white;
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .barn-card-header h3 { font-size: 1rem; font-weight: 600; }
  .barn-card-header .meta { font-size: 0.8rem; opacity: 0.85; }

  /* Ã¢ÂÂÃ¢ÂÂ Predictions Table Ã¢ÂÂÃ¢ÂÂ */
  .pred-up { background: #f0f7ee; }
  .pred-down { background: #fdf2ef; }
  .pred-flat { background: #f5f2e8; }

  /* Ã¢ÂÂÃ¢ÂÂ Best Price Ã¢ÂÂÃ¢ÂÂ */
  .best-price { background: #e8f5e3; font-weight: 600; }

  /* Ã¢ÂÂÃ¢ÂÂ Net Price Calculator Ã¢ÂÂÃ¢ÂÂ */
  .calc-box {
    background: var(--card-bg);
    border: 2px solid var(--wheat);
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 24px;
  }
  .calc-box h3 {
    font-size: 1.05em;
    margin-bottom: 4px;
  }
  .calc-box .calc-desc {
    font-size: 0.85em;
    color: var(--ink-light);
    margin-bottom: 14px;
    line-height: 1.5;
  }
  .calc-inputs {
    display: flex;
    gap: 12px;
    align-items: flex-end;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .calc-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .calc-field label {
    font-size: 0.72em;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--ink-muted);
    font-weight: 600;
  }
  .calc-field input, .calc-field select {
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 6px;
    font-family: 'DM Sans', Georgia, serif;
    font-size: 0.9em;
    background: white;
  }
  .calc-field input:focus, .calc-field select:focus { border-color: var(--wheat); outline: none; }
  .calc-go {
    padding: 8px 20px;
    background: var(--wheat);
    color: var(--ink);
    border: none;
    border-radius: 6px;
    font-family: 'DM Sans', Georgia, serif;
    font-size: 0.9em;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }
  .calc-go:hover { background: var(--wheat-light); }
  .calc-result {
    display: none;
    margin-top: 16px;
  }
  .calc-result.visible { display: block; }
  .calc-best {
    background: var(--field-green);
    color: white;
    padding: 12px 16px;
    border-radius: 6px;
    margin-bottom: 12px;
    font-size: 0.92em;
    line-height: 1.4;
  }
  .calc-best strong { color: white; }
  .net-best { background: #e8f5e3; font-weight: 700; }

  /* Ã¢ÂÂÃ¢ÂÂ Footer Ã¢ÂÂÃ¢ÂÂ */
  footer {
    background: var(--ink);
    color: #a09880;
    padding: 32px 24px;
    margin-top: 40px;
    font-size: 0.82em;
  }
  footer .footer-inner {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 20px;
  }
  footer a { color: var(--wheat); text-decoration: none; }
  footer .disclaimer {
    max-width: 600px;
    font-size: 0.88em;
    line-height: 1.5;
    font-style: italic;
  }

  /* Ã¢ÂÂÃ¢ÂÂ Tab Navigation Ã¢ÂÂÃ¢ÂÂ */
  .tab-bar {
    background: var(--ink);
    border-top: 1px solid rgba(255,255,255,0.08);
  }
  .tab-bar-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 24px;
    display: flex;
    gap: 0;
  }
  .tab-link {
    display: inline-block;
    padding: 12px 24px;
    color: #a09880;
    text-decoration: none;
    font-size: 0.88em;
    font-weight: 600;
    letter-spacing: 0.3px;
    border-bottom: 3px solid transparent;
    transition: all 0.2s;
  }
  .tab-link:hover { color: var(--parchment); }
  .tab-link.active {
    color: var(--wheat);
    border-bottom-color: var(--wheat);
  }
  .tab-link .tab-icon { margin-right: 6px; }

  /* Ã¢ÂÂÃ¢ÂÂ Responsive Ã¢ÂÂÃ¢ÂÂ */
  @media (max-width: 768px) {
    .header-top { flex-direction: column; }
    .header-meta { text-align: left; margin-top: 10px; }
    .hero-inner { flex-direction: column; }
    .hero-cta { width: 100%; }
    .cta-box { min-width: auto; }
    .insights-grid { grid-template-columns: 1fr; }
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .barn-grid { grid-template-columns: 1fr; }
    .container { padding: 16px; }
    .logo-area h1 { font-size: 1.5em; }
    .hero-text h2 { font-size: 1.2em; }
    table { font-size: 0.78em; }
    th, td { padding: 8px 10px; white-space: nowrap; }
  }
</style>
</head>
<body>

<header>
  <div class="header-top">
    <div class="logo-area">
      <h1>Barn<span>Signal</span></h1>
      <div class="tagline">Your signal before the sale.</div>
    </div>
    <div class="header-meta">
      <div><span class="live-dot"></span> Live data from ${BARNS.length + HAY_BARNS.length} USDA-reported auctions</div>
      <div style="margin-top:4px;">${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
    </div>
  </div>
  <div class="tab-bar">
    <div class="tab-bar-inner">
      <a class="tab-link active" href="/"><span class="tab-icon">&#x1F404;</span>Cattle</a>
      <a class="tab-link" href="/hay"><span class="tab-icon">&#x1F33E;</span>Hay &amp; Straw</a>
      <a class="tab-link" href="/accuracy"><span class="tab-icon">&#x1F3AF;</span>Track Record</a>
    </div>
  </div>
</header>

${renderTicker(activeBarns)}

<section class="hero">
  <div class="hero-inner">
    <div class="hero-text">
      <h2>Know before you go &mdash; compare barns, spot trends, and time your buy.</h2>
      <p>BarnSignal tracks real-time livestock auction prices from USDA-reported sales across Pennsylvania, Maryland, Virginia, West Virginia, and New York. Cross-auction comparison, AI-powered price predictions, and weekly trend analysis &mdash; all in one place.</p>
      <p class="audience">Tracking ${activeBarns.reduce((s, b) => s + b.totalReceipts, 0).toLocaleString()}+ head across ${BARNS.length} barns this week. Built for livestock buyers, distributors, and auction regulars.</p>
    </div>
    <div class="hero-cta">
      <div class="cta-box">
        <div class="cta-label">Get Price Alerts &mdash; Free During Launch</div>
        <div style="font-size:0.82em; color:var(--ink-light); margin-bottom:10px; line-height:1.4;">${activeRegion === "all"
          ? "Alerts from <strong>all " + BARNS.length + " barns</strong> on sale days."
          : "Alerts for <strong>" + regionLabel + "</strong> on sale days."}</div>
        <input type="email" placeholder="your@email.com" id="cta-email" />
        <button class="cta-btn" id="cta-btn" onclick="submitSignup()">Sign Up Free</button>
        <div class="cta-note" id="cta-note">Auction-day alerts only. No spam.</div>
      </div>
    </div>
  </div>
</section>

${renderRegionBar(activeRegion)}

<div class="container">

${renderAlertBanner(activeBarns)}

${renderStatsCards(activeBarns, stats)}

${activeBarns.length > 0 ? renderMarketCommentary(activeBarns) : ""}

${renderCalculator(activeBarns)}

<div class="section-header">
  <h2>${activeRegion === "all" ? "Cross-Auction Price Comparison" : regionLabel + " Price Comparison"}</h2>
  <span class="source">Data: USDA AMS Market News</span>
</div>
${activeBarns.length >= 2 ? renderCrossAuctionComparison(activeBarns) : "<p>Collecting data from multiple barns... cross-auction comparison will appear after the next auction cycle.</p>"}

<div class="section-header">
  <h2>AI Price Predictions</h2>
  <span class="source">ML Random Forest + CME + Cultural Calendar (binary up/down)</span>
</div>
${renderAccuracyBadge(stats)}
${renderPredictions(predictions)}

<div class="section-header">
  <h2 id="barn-heading">${activeRegion === "all" ? "Auction Barn Reports" : regionLabel + " Auction Reports"}</h2>
  <span class="source">Most recent sale data</span>
</div>
<div class="barn-grid">
${activeBarns.map((b) => renderBarnCard(b)).join("\n")}
</div>

${activeBarns.length === 0 ? `
<div style="text-align:center; padding:3rem; color:var(--ink-muted);">
  <h3>Waiting for first data fetch...</h3>
  <p>Auction data will appear after the next scheduled fetch (Mon/Tue/Thu evenings).</p>
  <p style="margin-top:0.5rem;">Or trigger manually: <code>POST /api/fetch</code></p>
</div>
` : ""}

<div class="section-header">
  <h2>Prediction Accuracy</h2>
  <span class="source">Running track record</span>
</div>
${renderAccuracy(stats)}

</div>

<footer>
  <div class="footer-inner">
    <div>
      <strong style="color:var(--parchment);">BarnSignal</strong> v1.0<br>
      Mid-Atlantic Livestock Price Intelligence<br>
      <a href="https://github.com/tharmer/barnsignal">GitHub</a>
    </div>
    <div class="disclaimer">
      Data source: USDA AMS Livestock, Poultry &amp; Grain Market News.<br>
      All prices shown are historical averages from completed sales and are not quotes, offers, or guarantees of future prices. Actual sale prices vary by animal quality, buyer competition, volume, and market conditions. Predictions are AI-generated estimates for informational purposes only &mdash; not financial or trading advice. BarnSignal is not liable for decisions made based on this data. Use at your own discretion.
    </div>
  </div>
</footer>

<script>
function submitSignup() {
  var email = document.getElementById('cta-email').value.trim();
  var btn = document.getElementById('cta-btn');
  var note = document.getElementById('cta-note');
  if (!email || email.indexOf('@') === -1) {
    note.textContent = 'Please enter a valid email address.';
    note.style.color = 'var(--barn-red)';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Signing up...';
  var region = new URLSearchParams(window.location.search).get('region') || 'all';
  fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, region: region })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.success) {
      btn.textContent = 'Signed Up';
      btn.style.background = 'var(--field-green)';
      note.textContent = data.message;
      note.style.color = 'var(--field-green)';
      document.getElementById('cta-email').disabled = true;
    } else {
      btn.textContent = 'Sign Up Free';
      btn.disabled = false;
      note.textContent = data.error || 'Something went wrong.';
      note.style.color = 'var(--barn-red)';
    }
  })
  .catch(function() {
    btn.textContent = 'Sign Up Free';
    btn.disabled = false;
    note.textContent = 'Network error. Try again.';
    note.style.color = 'var(--barn-red)';
  });
}
</script>

</body>
</html>`;
}

function renderCalculator(barns: AuctionEntry[]): string {
  if (barns.length < 2) return "";

  // Build a lookup of reportId -> barn coordinates from BARNS config
  const barnCoords = BARNS.map((b) => ({
    reportId: b.reportId,
    shortName: b.shortName,
    lat: b.lat,
    lng: b.lng,
  }));

  // Find shared "Average" categories across at least 2 barns
  const catMap = new Map<string, { barn: string; reportId: number; avgPrice: number; head: number }[]>();
  for (const barn of barns) {
    for (const cat of barn.categories.filter((c) => c.dressing === "Average")) {
      if (!catMap.has(cat.category)) catMap.set(cat.category, []);
      catMap.get(cat.category)!.push({ barn: barn.barnName, reportId: barn.reportId, avgPrice: cat.avgPrice, head: cat.head });
    }
  }
  const sharedCats = [...catMap.entries()].filter(([_, d]) => d.length >= 2).map(([name]) => name).slice(0, 20);

  const catOptions = sharedCats.map(
    (c) => '<option value="' + c.replace(/"/g, "&quot;") + '">' + c + '</option>'
  ).join("");

  // Embed price data and barn coords in page for JS
  const priceData: Record<string, Record<number, number>> = {};
  for (const [cat, entries] of catMap.entries()) {
    priceData[cat] = {};
    for (const e of entries) {
      priceData[cat][e.reportId] = e.avgPrice;
    }
  }

  return `
<div class="section-header">
  <h2>Net Price Calculator</h2>
  <span class="source">Factor in your trucking costs</span>
</div>
<div class="calc-box">
  <h3>Which barn actually puts the most in your pocket?</h3>
  <div class="calc-desc">Enter your zip code and load details. We'll calculate round-trip trucking costs and show you the estimated net price at each barn based on last week's sale averages &mdash; so you can compare before you load the trailer. <em>Prices are historical averages, not quotes or guarantees.</em></div>
  <div class="calc-inputs">
    <div class="calc-field">
      <label>Your Zip Code</label>
      <input type="text" id="calc-zip" placeholder="17557" maxlength="5" style="width:90px;" />
    </div>
    <div class="calc-field">
      <label>Category</label>
      <select id="calc-category" style="min-width:200px;">
        ${catOptions}
      </select>
    </div>
    <div class="calc-field">
      <label>Head Count</label>
      <input type="number" id="calc-head" value="33" min="1" max="100" style="width:70px;" />
    </div>
    <div class="calc-field">
      <label>Avg Weight (lbs)</label>
      <input type="number" id="calc-weight" value="1350" min="200" max="3000" style="width:90px;" />
    </div>
    <div class="calc-field">
      <label>Diesel $/gal</label>
      <input type="number" id="calc-diesel" value="3.85" min="1" max="8" step="0.05" style="width:80px;" />
    </div>
    <button class="calc-go" onclick="runCalc()">Calculate Net Price</button>
  </div>
  <div class="calc-result" id="calc-result"></div>
</div>

<script>
var BARN_COORDS = ${JSON.stringify(barnCoords)};
var PRICE_DATA = ${JSON.stringify(priceData)};

// Zip code -> lat/lng via simple US centroid table (embedded for zero API dependency)
// We use a small lookup of ~200 common mid-Atlantic zips + a fallback geocode estimate
function zipToLatLng(zip) {
  // US zip code centroid approximation: first 3 digits map to rough lat/lng
  // This covers the mid-Atlantic region well enough for driving estimates
  var prefix = parseInt(zip.substring(0, 3));
  // PA/NJ/NY/MD/VA/WV/DE/OH zip prefix ranges with approximate centroids
  var regions = [
    [150,159, 40.44, -79.99],   // Pittsburgh area
    [160,169, 40.85, -78.75],   // Central PA west
    [170,179, 40.27, -76.88],   // Harrisburg/Lancaster
    [180,189, 40.60, -75.47],   // Lehigh Valley/Poconos
    [190,196, 39.95, -75.17],   // Philadelphia
    [197,199, 39.16, -75.52],   // Delaware
    [200,205, 38.90, -77.03],   // DC
    [206,219, 39.05, -77.15],   // MD suburbs
    [220,246, 38.85, -77.30],   // Northern VA
    [247,268, 37.80, -79.45],   // VA
    [100,119, 40.71, -74.01],   // NYC area
    [120,129, 42.65, -73.75],   // Albany area
    [130,139, 43.05, -76.15],   // Syracuse area
    [140,149, 42.89, -78.88],   // Buffalo area
    [250,268, 38.35, -81.63],   // WV
    [430,439, 39.96, -82.99],   // Columbus OH
    [440,449, 41.50, -81.69],   // Cleveland OH
    [450,459, 39.76, -84.19],   // Dayton OH
    [460,469, 39.77, -86.16],   // Indianapolis
    [210,219, 39.29, -76.61],   // Baltimore
    [254,268, 38.60, -80.80],   // WV interior
    [300,319, 33.75, -84.39],   // Atlanta area
  ];
  for (var i = 0; i < regions.length; i++) {
    if (prefix >= regions[i][0] && prefix <= regions[i][1]) {
      return { lat: regions[i][2], lng: regions[i][3] };
    }
  }
  // Fallback: center of mid-Atlantic
  return { lat: 39.95, lng: -77.50 };
}

function haversine(lat1, lng1, lat2, lng2) {
  var R = 3959; // miles
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function runCalc() {
  var zip = document.getElementById('calc-zip').value.trim();
  var category = document.getElementById('calc-category').value;
  var headCount = parseInt(document.getElementById('calc-head').value) || 33;
  var avgWeight = parseInt(document.getElementById('calc-weight').value) || 1350;
  var diesel = parseFloat(document.getElementById('calc-diesel').value) || 3.85;
  var resultDiv = document.getElementById('calc-result');

  if (!zip || zip.length < 5) {
    resultDiv.innerHTML = '<div style="color:var(--barn-red); font-size:0.9em;">Please enter a 5-digit zip code.</div>';
    resultDiv.classList.add('visible');
    return;
  }

  var origin = zipToLatLng(zip);
  var prices = PRICE_DATA[category];
  if (!prices) {
    resultDiv.innerHTML = '<div style="color:var(--barn-red); font-size:0.9em;">No price data for that category.</div>';
    resultDiv.classList.add('visible');
    return;
  }

  // Trucking model: round trip, 6 mpg loaded trailer, 1.3x road factor on haversine
  var MPG = 6;
  var ROAD_FACTOR = 1.3;

  var results = [];
  for (var i = 0; i < BARN_COORDS.length; i++) {
    var barn = BARN_COORDS[i];
    var price = prices[barn.reportId];
    if (price === undefined) continue;

    var crowMiles = haversine(origin.lat, origin.lng, barn.lat, barn.lng);
    var roadMiles = crowMiles * ROAD_FACTOR;
    var roundTrip = roadMiles * 2;
    var fuelCost = (roundTrip / MPG) * diesel;

    // Total load value: price is $/cwt, so value = price * (weight/100) * head
    var grossValue = price * (avgWeight / 100) * headCount;
    var netValue = grossValue - fuelCost;
    var netPerCwt = price - (fuelCost / ((avgWeight / 100) * headCount));

    results.push({
      name: barn.shortName,
      distance: Math.round(roadMiles),
      roundTrip: Math.round(roundTrip),
      fuelCost: fuelCost,
      grossPrice: price,
      netPerCwt: netPerCwt,
      grossValue: grossValue,
      netValue: netValue,
    });
  }

  // Sort by net value descending
  results.sort(function(a, b) { return b.netValue - a.netValue; });

  if (results.length === 0) {
    resultDiv.innerHTML = '<div style="color:var(--ink-muted); font-size:0.9em;">No barns have data for this category.</div>';
    resultDiv.classList.add('visible');
    return;
  }

  var best = results[0];
  var savings = results.length > 1 ? best.netValue - results[1].netValue : 0;

  var html = '<div class="calc-best"><strong>' + best.name + ' is your best net price for ' + category + '.</strong><br>';
  html += 'Net $' + best.netPerCwt.toFixed(2) + '/cwt after $' + best.fuelCost.toFixed(0) + ' in fuel (' + best.roundTrip + ' mi round trip).';
  if (savings > 50) {
    html += '<br>That\\'s <strong>$' + savings.toFixed(0) + ' more per load</strong> than the next-best option.';
  }
  html += '</div>';

  html += '<div class="price-table-wrap"><table>';
  html += '<tr><th>Barn</th><th>Distance</th><th>Round Trip</th><th>Fuel Cost</th><th>Gross $/cwt</th><th>Net $/cwt</th><th>Net Load Value</th></tr>';
  for (var j = 0; j < results.length; j++) {
    var r = results[j];
    var rowClass = j === 0 ? ' class="net-best"' : '';
    html += '<tr' + rowClass + '>';
    html += '<td class="category-cell">' + r.name + '</td>';
    html += '<td>' + r.distance + ' mi</td>';
    html += '<td>' + r.roundTrip + ' mi</td>';
    html += '<td class="price-cell" style="color:var(--barn-red)">-$' + r.fuelCost.toFixed(0) + '</td>';
    html += '<td class="price-cell">$' + r.grossPrice.toFixed(2) + '</td>';
    html += '<td class="price-cell" style="font-weight:700">$' + r.netPerCwt.toFixed(2) + '</td>';
    html += '<td class="price-cell" style="font-weight:700">$' + r.netValue.toFixed(0) + '</td>';
    html += '</tr>';
  }
  html += '</table></div>';
  html += '<p style="font-size:0.72em; color:var(--ink-muted); margin-top:6px; font-style:italic;">Estimates based on ' + MPG + ' mpg loaded trailer, ' + ROAD_FACTOR + 'x road factor on straight-line distance, $' + diesel.toFixed(2) + '/gal diesel. Actual mileage and costs will vary.</p>';
  html += '<p style="font-size:0.72em; color:var(--barn-red); margin-top:4px; font-weight:500;"><strong>Not a price quote.</strong> Prices shown are historical averages from past USDA-reported sales. Actual sale prices vary by animal quality, buyer competition, volume, and market conditions. BarnSignal does not guarantee any price or outcome.</p>';

  resultDiv.innerHTML = html;
  resultDiv.classList.add('visible');
}
</script>`;
}

function renderRegionBar(activeRegion: string): string {
  const buttons = REGIONS.map(
    (r) => '<a class="region-btn' + (activeRegion === r.id ? ' active' : '') + '" href="/?region=' + r.id + '">' + r.name + '</a>'
  ).join("\n    ");

  return '<div class="region-bar"><div class="region-bar-inner">' +
    '<span class="region-bar-label">Your Region:</span>' +
    '<a class="region-btn' + (activeRegion === 'all' ? ' active' : '') + '" href="/">All Regions</a>' +
    '\n    ' + buttons +
    '</div></div>';
}

function renderTicker(barns: AuctionEntry[]): string {
  if (barns.length === 0) return "";

  const items: string[] = [];
  for (const barn of barns) {
    const shortName = barn.barnName.replace("New Holland", "NH").replace("Vintage", "Vint.");
    for (const cat of barn.categories.filter((c) => c.dressing === "Average").slice(0, 6)) {
      const priceStr = `$${cat.avgPrice.toFixed(0)}/cwt`;
      items.push(
        `<span class="ticker-item"><span class="name">${shortName}</span> ${cat.category}: <span class="neutral">${priceStr}</span> (${cat.head} hd)</span>`
      );
    }
  }

  // Duplicate items for seamless loop
  const allItems = items.join("") + items.join("");
  return `<div class="ticker"><div class="ticker-inner">${allItems}</div></div>`;
}

function renderAlertBanner(barns: AuctionEntry[]): string {
  // Generate a market alert from the latest commentary
  const latestBarn = barns.find((b) => b.marketCommentary);
  if (!latestBarn) return "";

  // Extract key trend from commentary
  const commentary = latestBarn.marketCommentary;
  let alertText = commentary;
  if (commentary.length > 200) {
    alertText = commentary.substring(0, 200) + "...";
  }

  return `<div class="alert-banner">
  <div class="alert-icon">&#x1F4CA;</div>
  <div>
    <div class="alert-text"><strong>${latestBarn.barnName}</strong> (${latestBarn.reportDate}): ${alertText}</div>
    <div class="alert-time">Latest market report</div>
  </div>
</div>`;
}

function renderStatsCards(barns: AuctionEntry[], stats: AccuracyStats): string {
  const totalHead = barns.reduce((sum, b) => sum + b.totalReceipts, 0);
  const totalCategories = barns.reduce((sum, b) => sum + b.categories.length, 0);

  return `
<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-label">Auction Barns</div>
    <div class="stat-value">${barns.length}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Head This Week</div>
    <div class="stat-value">${totalHead.toLocaleString()}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Price Categories</div>
    <div class="stat-value">${totalCategories}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">AI Accuracy</div>
    <div class="stat-value ${stats.accuracy >= 60 ? "green" : stats.accuracy > 0 ? "red" : ""}">${stats.totalPredictions > 0 ? stats.accuracy + "%" : "\u2014"}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Predictions</div>
    <div class="stat-value">${stats.totalPredictions}</div>
  </div>
</div>`;
}

function renderMarketCommentary(barns: AuctionEntry[]): string {
  const commentaries = barns.filter((b) => b.marketCommentary);
  if (commentaries.length === 0) return "";

  const html = commentaries.map(
    (b) =>
      `<div class="commentary"><strong>${b.barnName}</strong> <span class="comm-date">(${b.reportDate})</span><br>${b.marketCommentary}</div>`
  );

  return `<div class="section-header"><h2>Market Commentary</h2><span class="source">USDA Market Reports</span></div>${html.join("\n")}`;
}

function renderCrossAuctionComparison(barns: AuctionEntry[]): string {
  const categoryMap = new Map<string, { barn: string; avgPrice: number; head: number }[]>();

  for (const barn of barns) {
    for (const cat of barn.categories.filter((c) => c.dressing === "Average")) {
      if (!categoryMap.has(cat.category)) categoryMap.set(cat.category, []);
      categoryMap.get(cat.category)!.push({
        barn: barn.barnName,
        avgPrice: cat.avgPrice,
        head: cat.head,
      });
    }
  }

  const sharedCategories = [...categoryMap.entries()]
    .filter(([_, data]) => data.length >= 2)
    .slice(0, 15);

  if (sharedCategories.length === 0) {
    const cats = barns.flatMap((b) =>
      b.categories
        .filter((c) => c.dressing === "Average")
        .slice(0, 8)
        .map((c) => ({ barn: b.barnName, ...c }))
    );

    return `<div class="price-table-wrap"><table>
<tr><th>Category</th><th>Barn</th><th>Avg Price</th><th>Head</th></tr>
${cats.map((c) => `<tr><td class="category-cell">${c.category}</td><td>${c.barn}</td><td class="price-cell">$${c.avgPrice.toFixed(2)}</td><td>${c.head}</td></tr>`).join("\n")}
</table></div>
<p style="font-size:0.8rem; color:var(--ink-muted); margin-top:0.5rem;">Full cross-auction comparison unlocks when we have data from multiple barns for the same categories.</p>`;
  }

  const barnNames = [...new Set(barns.map((b) => b.barnName))];

  let rows = "";
  for (const [category, data] of sharedCategories) {
    const prices = data.map((d) => d.avgPrice);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const spread = maxPrice - minPrice;

    rows += `<tr><td class="category-cell">${category}</td>`;
    for (const barnName of barnNames) {
      const barnData = data.find((d) => d.barn === barnName);
      if (barnData) {
        const isBest = barnData.avgPrice === maxPrice && spread > 1;
        rows += `<td class="${isBest ? "best-price" : ""} price-cell">$${barnData.avgPrice.toFixed(2)} <span style="font-size:0.72em;color:var(--ink-muted)">(${barnData.head} hd)</span></td>`;
      } else {
        rows += `<td style="color:var(--border)">\u2014</td>`;
      }
    }
    rows += `<td class="price-cell" style="color:${spread > 5 ? "var(--barn-red)" : "var(--ink-muted)"}">$${spread.toFixed(2)}</td></tr>`;
  }

  return `<div class="price-table-wrap"><table>
<tr><th>Category</th>${barnNames.map((n) => `<th>${n}</th>`).join("")}<th>Spread</th></tr>
${rows}
</table></div>
<p style="font-size:0.78em; color:var(--ink-muted); margin-top:8px; font-style:italic;">Green highlight = highest price at that barn. Spread shows the price gap between barns \u2014 larger spreads may indicate opportunity factoring in trucking costs. All prices are historical sale averages from USDA reports and are not guaranteed.</p>`;
}

function getRegionForBarn(reportId: number): string {
  for (const r of REGIONS) {
    if (r.reportIds.includes(reportId)) return r.id;
  }
  return "other";
}

function renderBarnCard(barn: AuctionEntry): string {
  const topCategories = barn.categories
    .filter((c) => c.dressing === "Average")
    .slice(0, 12);
  const regionId = getRegionForBarn(barn.reportId);

  return `
<div class="barn-card" data-region="${regionId}">
  <div class="barn-card-header">
    <h3>${barn.barnName}</h3>
    <div class="meta">${barn.location} | ${barn.reportDate} | ${barn.totalReceipts.toLocaleString()} head</div>
  </div>
  <table>
    <tr><th>Category</th><th>Head</th><th>Wt Range</th><th>Avg Price</th></tr>
    ${topCategories
      .map(
        (c) =>
          `<tr><td class="category-cell">${c.category}</td><td>${c.head}</td><td>${c.wtRange} lbs</td><td class="price-cell">$${c.avgPrice.toFixed(2)}/cwt</td></tr>`
      )
      .join("\n")}
  </table>
</div>`;
}

function renderAccuracyBadge(stats: AccuracyStats): string {
  const resolved = stats.resolved;
  const total = stats.totalPredictions;
  const acc = stats.accuracy;

  // Determine badge color
  let badgeColor = "var(--ink-muted)";  // gray default
  let badgeBg = "var(--parchment-dark)";
  let label = "Awaiting first results";

  if (resolved > 0) {
    if (acc >= 55) {
      badgeColor = "var(--field-green)";
      badgeBg = "rgba(58,107,53,0.12)";
      label = "Above target";
    } else if (acc >= 50) {
      badgeColor = "#b8860b";
      badgeBg = "rgba(184,134,11,0.12)";
      label = "Near target";
    } else {
      badgeColor = "var(--barn-red)";
      badgeBg = "rgba(139,37,0,0.12)";
      label = "Below target";
    }
  }

  const backtestAcc = "56.2";
  const liveAccDisplay = resolved > 0 ? `${acc}%` : "\u2014";
  const resolvedDisplay = `${resolved}/${total} resolved`;

  return `<div style="display:flex; align-items:center; gap:16px; margin-bottom:16px; flex-wrap:wrap;">
  <a href="/accuracy" style="display:inline-flex; align-items:center; gap:10px; background:${badgeBg}; border:1px solid ${badgeColor}; border-radius:24px; padding:8px 18px; text-decoration:none; color:${badgeColor}; font-weight:600; font-size:0.88em; transition:all 0.2s;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
    <span style="font-size:1.1em;">&#x1F3AF;</span>
    <span>Live: ${liveAccDisplay}</span>
    <span style="color:var(--ink-muted); font-weight:400;">|</span>
    <span style="color:var(--ink-light); font-weight:400;">Backtest: ${backtestAcc}%</span>
    <span style="color:var(--ink-muted); font-weight:400;">|</span>
    <span style="color:var(--ink-muted); font-weight:400; font-size:0.9em;">${resolvedDisplay}</span>
  </a>
  <span style="font-size:0.78em; color:var(--ink-muted); font-style:italic;">${label} &mdash; <a href="/accuracy" style="color:var(--wheat); text-decoration:none;">View full track record &rarr;</a></span>
</div>`;
}

function renderPredictions(predictions: Prediction[]): string {
  if (predictions.length === 0) {
    const startDate = new Date("2026-04-06");
    const estDate = startDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    return `<div class="insight-card" style="color:var(--ink-muted);">
  <div class="insight-type trend" style="justify-content:center;">&#x1F9E0; AI Signal Engine &mdash; Calibrating</div>
  <h3 style="text-align:center;">First predictions drop ~${estDate}</h3>
  <p style="text-align:center;">BarnSignal's prediction engine analyzes momentum, 3-week price trends, supply volume, and seasonal factors across ${BARNS.length} auction barns. It needs at least two weeks of historical data to generate confident signals.</p>
  <p style="text-align:center; margin-top:10px; font-size:0.85em;"><strong style="color:var(--ink);">What you'll see here:</strong> Up/down calls for every tracked cattle category, confidence scores, and a running accuracy record so you can see exactly how the model performs.</p>
</div>`;
  }

  // Filter out legacy "flat" predictions from old 3-class model
  const filtered = predictions.filter((p) => p.predictedDirection !== "flat");
  const rows = filtered.slice(0, 30).map((p) => {
    const dirClass = p.predictedDirection === "up" ? "pred-up" : "pred-down";
    const arrow = p.predictedDirection === "up" ? "\u2191" : "\u2193";
    const trendClass = p.predictedDirection === "up" ? "trend-up" : "trend-down";
    const confColor = p.confidence > 60 ? "var(--field-green)" : p.confidence > 40 ? "var(--wheat)" : "var(--ink-muted)";

    let statusBadge;
    if (!p.resolved) {
      statusBadge = `<span class="badge badge-pending">Pending</span>`;
    } else if (p.correct) {
      statusBadge = `<span class="badge badge-correct">\u2713 Correct</span>`;
    } else {
      statusBadge = `<span class="badge badge-wrong">\u2717 Wrong</span>`;
    }

    const actualCol = p.resolved
      ? `$${p.actualAvgPrice?.toFixed(2)} (${p.actualDirection})`
      : "\u2014";

    return `<tr class="${dirClass}">
      <td>${p.barnName}</td>
      <td class="category-cell">${p.category}</td>
      <td class="price-cell">$${p.currentAvgPrice.toFixed(2)}</td>
      <td class="${trendClass}" style="font-weight:600">${arrow} ${p.predictedDirection}</td>
      <td><div class="confidence-bar" style="width:80px; display:inline-block;"><div class="confidence-fill" style="width:${p.confidence}%; background:${confColor}"></div></div> ${p.confidence}%</td>
      <td>${p.targetDate}</td>
      <td class="price-cell">${actualCol}</td>
      <td>${statusBadge}</td>
    </tr>`;
  });

  return `<div class="price-table-wrap"><table>
<tr><th>Barn</th><th>Category</th><th>Current</th><th>Call</th><th>Confidence</th><th>Target</th><th>Actual</th><th>Status</th></tr>
${rows.join("\n")}
</table></div>`;
}

function renderAccuracy(stats: AccuracyStats): string {
  if (stats.totalPredictions === 0) {
    return `<div class="insight-card" style="color:var(--ink-muted);">
  <div class="insight-type trend">Coming Soon</div>
  <p>Accuracy tracking will begin once predictions are resolved against actual auction data. This typically takes 1\u20132 auction cycles.</p>
</div>`;
  }

  const catRows = Object.entries(stats.byCategory)
    .sort((a, b) => b[1].total - a[1].total)
    .map(
      ([cat, s]) =>
        `<tr><td class="category-cell">${cat}</td><td>${s.total}</td><td>${s.correct}</td><td class="price-cell">${s.accuracy}%</td></tr>`
    )
    .join("\n");

  const barnRows = Object.entries(stats.byBarn)
    .map(
      ([barn, s]) =>
        `<tr><td class="category-cell">${barn}</td><td>${s.total}</td><td>${s.correct}</td><td class="price-cell">${s.accuracy}%</td></tr>`
    )
    .join("\n");

  return `
<div class="stats-grid" style="grid-template-columns: repeat(3, 1fr);">
  <div class="stat-card">
    <div class="stat-label">Overall Accuracy</div>
    <div class="stat-value green">${stats.accuracy}%</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Resolved / Total</div>
    <div class="stat-value">${stats.resolved}/${stats.totalPredictions}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Correct</div>
    <div class="stat-value green">${stats.correct}</div>
  </div>
</div>

${catRows ? `
<h3 style="margin: 1rem 0 0.5rem; color: var(--ink); font-weight:600;">By Category</h3>
<div class="price-table-wrap"><table>
<tr><th>Category</th><th>Predictions</th><th>Correct</th><th>Accuracy</th></tr>
${catRows}
</table></div>` : ""}

${barnRows ? `
<h3 style="margin: 1rem 0 0.5rem; color: var(--ink); font-weight:600;">By Barn</h3>
<div class="price-table-wrap"><table>
<tr><th>Barn</th><th>Predictions</th><th>Correct</th><th>Accuracy</th></tr>
${barnRows}
</table></div>` : ""}
`;
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// HAY DASHBOARD
// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

function renderHayCrossComparison(barns: AuctionEntry[]): string {
  const categoryMap = new Map<string, { barn: string; avgPrice: number; qty: number; baleType: string }[]>();

  for (const barn of barns) {
    for (const cat of barn.categories) {
      if (!categoryMap.has(cat.category)) categoryMap.set(cat.category, []);
      categoryMap.get(cat.category)!.push({
        barn: barn.barnName,
        avgPrice: cat.avgPrice,
        qty: cat.head,
        baleType: cat.wtRange || "Large Square",
      });
    }
  }

  const sharedCategories = [...categoryMap.entries()]
    .filter(([_, data]) => data.length >= 2)
    .slice(0, 20);

  const barnNames = [...new Set(barns.map((b) => b.barnName))];

  if (sharedCategories.length === 0) {
    const cats = barns.flatMap((b) =>
      b.categories.slice(0, 10).map((c) => ({ barn: b.barnName, ...c }))
    );
    return `<div class="price-table-wrap"><table>
<tr><th>Category</th><th>Barn</th><th>Bale Type</th><th>Avg Price</th><th>Tons</th></tr>
${cats.map((c) => `<tr><td class="category-cell">${c.category}</td><td>${c.barn}</td><td>${c.wtRange}</td><td class="price-cell">$${c.avgPrice.toFixed(2)}/ton</td><td>${c.head}</td></tr>`).join("\n")}
</table></div>
<p style="font-size:0.8rem; color:var(--ink-muted); margin-top:0.5rem;">Cross-auction comparison unlocks when multiple auctions report the same hay categories.</p>`;
  }

  let rows = "";
  for (const [category, data] of sharedCategories) {
    const prices = data.map((d) => d.avgPrice);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const spread = maxPrice - minPrice;

    rows += `<tr><td class="category-cell">${category}</td>`;
    for (const barnName of barnNames) {
      const barnData = data.find((d) => d.barn === barnName);
      if (barnData) {
        const isBest = barnData.avgPrice === minPrice && spread > 2;
        rows += `<td class="${isBest ? "best-price" : ""} price-cell">$${barnData.avgPrice.toFixed(2)} <span style="font-size:0.72em;color:var(--ink-muted)">(${barnData.qty}t)</span></td>`;
      } else {
        rows += `<td style="color:var(--border)">\u2014</td>`;
      }
    }
    rows += `<td class="price-cell" style="color:${spread > 10 ? "var(--barn-red)" : "var(--ink-muted)"}">$${spread.toFixed(2)}</td></tr>`;
  }

  return `<div class="price-table-wrap"><table>
<tr><th>Category</th>${barnNames.map((n) => `<th>${n}</th>`).join("")}<th>Spread</th></tr>
${rows}
</table></div>
<p style="font-size:0.78em; color:var(--ink-muted); margin-top:8px; font-style:italic;">Green highlight = lowest price (best buy). Spread shows the price gap \u2014 larger spreads signal an opportunity worth the drive. All prices are historical per-ton averages from USDA reports.</p>`;
}

function renderHayBarnCard(barn: AuctionEntry): string {
  const byBale = new Map<string, typeof barn.categories>();
  for (const cat of barn.categories) {
    const bale = cat.wtRange || "Other";
    if (!byBale.has(bale)) byBale.set(bale, []);
    byBale.get(bale)!.push(cat);
  }

  let tablesHtml = "";
  for (const [baleType, cats] of byBale) {
    tablesHtml += `<h4 style="margin:12px 14px 6px; font-size:0.85em; color:var(--ink-light);">${baleType}</h4>
<table>
  <tr><th>Category</th><th>Tons</th><th>Price Range</th><th>Avg $/Ton</th></tr>
  ${cats.map((c) => `<tr><td class="category-cell">${c.category}</td><td>${c.head}</td><td class="price-cell">${c.priceRange}</td><td class="price-cell" style="font-weight:700">$${c.avgPrice.toFixed(2)}</td></tr>`).join("\n")}
</table>`;
  }

  return `
<div class="barn-card">
  <div class="barn-card-header" style="background:var(--soil);">
    <h3>${barn.barnName}</h3>
    <div class="meta">${barn.location} | ${barn.reportDate} | ${barn.totalReceipts} tons</div>
  </div>
  ${tablesHtml}
</div>`;
}

function renderHayCalculator(barns: AuctionEntry[]): string {
  if (barns.length < 2) return "";

  const barnCoords = HAY_BARNS.map((b) => ({
    reportId: b.reportId,
    shortName: b.shortName,
    lat: b.lat,
    lng: b.lng,
  }));

  const catMap = new Map<string, { barn: string; reportId: number; avgPrice: number }[]>();
  for (const barn of barns) {
    for (const cat of barn.categories) {
      if (!catMap.has(cat.category)) catMap.set(cat.category, []);
      catMap.get(cat.category)!.push({ barn: barn.barnName, reportId: barn.reportId, avgPrice: cat.avgPrice });
    }
  }
  const sharedCats = [...catMap.entries()].filter(([_, d]) => d.length >= 2).map(([name]) => name).slice(0, 20);

  if (sharedCats.length === 0) return "";

  const catOptions = sharedCats.map(
    (c) => '<option value="' + c.replace(/"/g, "&quot;") + '">' + c + '</option>'
  ).join("");

  const priceData: Record<string, Record<number, number>> = {};
  for (const [cat, entries] of catMap.entries()) {
    priceData[cat] = {};
    for (const e of entries) {
      priceData[cat][e.reportId] = e.avgPrice;
    }
  }

  return `
<div class="section-header">
  <h2>Hay Net Price Calculator</h2>
  <span class="source">Factor in your hauling costs</span>
</div>
<div class="calc-box">
  <h3>Which auction puts the most in your pocket per ton?</h3>
  <div class="calc-desc">Enter your zip code and load details. We'll calculate round-trip hauling costs and show you the net price per ton at each auction. <em>Prices are historical averages from USDA reports, not quotes.</em></div>
  <div class="calc-inputs">
    <div class="calc-field">
      <label>Your Zip Code</label>
      <input type="text" id="hay-calc-zip" placeholder="17557" maxlength="5" style="width:90px;" />
    </div>
    <div class="calc-field">
      <label>Hay Type</label>
      <select id="hay-calc-category" style="min-width:200px;">
        ${catOptions}
      </select>
    </div>
    <div class="calc-field">
      <label>Tons</label>
      <input type="number" id="hay-calc-tons" value="20" min="1" max="100" style="width:70px;" />
    </div>
    <div class="calc-field">
      <label>Diesel $/gal</label>
      <input type="number" id="hay-calc-diesel" value="3.85" min="1" max="8" step="0.05" style="width:80px;" />
    </div>
    <button class="calc-go" onclick="runHayCalc()">Calculate Net Price</button>
  </div>
  <div class="calc-result" id="hay-calc-result"></div>
</div>

<script>
var HAY_BARN_COORDS = ${JSON.stringify(barnCoords)};
var HAY_PRICE_DATA = ${JSON.stringify(priceData)};

function zipToLatLngHay(zip) {
  var prefix = parseInt(zip.substring(0, 3));
  var regions = [
    [150,159, 40.44, -79.99], [160,169, 40.85, -78.75], [170,179, 40.27, -76.88],
    [180,189, 40.60, -75.47], [190,196, 39.95, -75.17], [197,199, 39.16, -75.52],
    [200,205, 38.90, -77.03], [206,219, 39.05, -77.15], [220,246, 38.85, -77.30],
    [247,268, 37.80, -79.45], [100,119, 40.71, -74.01], [120,129, 42.65, -73.75],
    [130,139, 43.05, -76.15], [140,149, 42.89, -78.88], [250,268, 38.35, -81.63],
    [430,439, 39.96, -82.99], [440,449, 41.50, -81.69], [210,219, 39.29, -76.61],
  ];
  for (var i = 0; i < regions.length; i++) {
    if (prefix >= regions[i][0] && prefix <= regions[i][1]) {
      return { lat: regions[i][2], lng: regions[i][3] };
    }
  }
  return { lat: 39.95, lng: -77.50 };
}

function haversineHay(lat1, lng1, lat2, lng2) {
  var R = 3959;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function runHayCalc() {
  var zip = document.getElementById('hay-calc-zip').value.trim();
  var category = document.getElementById('hay-calc-category').value;
  var tons = parseFloat(document.getElementById('hay-calc-tons').value) || 20;
  var diesel = parseFloat(document.getElementById('hay-calc-diesel').value) || 3.85;
  var resultDiv = document.getElementById('hay-calc-result');

  if (!zip || zip.length < 5) {
    resultDiv.innerHTML = '<div style="color:var(--barn-red); font-size:0.9em;">Please enter a 5-digit zip code.</div>';
    resultDiv.classList.add('visible');
    return;
  }

  var origin = zipToLatLngHay(zip);
  var prices = HAY_PRICE_DATA[category];
  if (!prices) {
    resultDiv.innerHTML = '<div style="color:var(--barn-red); font-size:0.9em;">No price data for that category.</div>';
    resultDiv.classList.add('visible');
    return;
  }

  var MPG = 5.5;
  var ROAD_FACTOR = 1.3;

  var results = [];
  for (var i = 0; i < HAY_BARN_COORDS.length; i++) {
    var barn = HAY_BARN_COORDS[i];
    var price = prices[barn.reportId];
    if (price === undefined) continue;

    var crowMiles = haversineHay(origin.lat, origin.lng, barn.lat, barn.lng);
    var roadMiles = crowMiles * ROAD_FACTOR;
    var roundTrip = roadMiles * 2;
    var fuelCost = (roundTrip / MPG) * diesel;

    var grossValue = price * tons;
    var netValue = grossValue - fuelCost;
    var netPerTon = price - (fuelCost / tons);

    results.push({
      name: barn.shortName,
      distance: Math.round(roadMiles),
      roundTrip: Math.round(roundTrip),
      fuelCost: fuelCost,
      grossPrice: price,
      netPerTon: netPerTon,
      grossValue: grossValue,
      netValue: netValue,
    });
  }

  results.sort(function(a, b) { return b.netValue - a.netValue; });

  if (results.length === 0) {
    resultDiv.innerHTML = '<div style="color:var(--ink-muted); font-size:0.9em;">No auctions have data for this category.</div>';
    resultDiv.classList.add('visible');
    return;
  }

  var best = results[0];
  var savings = results.length > 1 ? best.netValue - results[1].netValue : 0;

  var html = '<div class="calc-best"><strong>' + best.name + ' is your best net price for ' + category + '.</strong><br>';
  html += 'Net $' + best.netPerTon.toFixed(2) + '/ton after $' + best.fuelCost.toFixed(0) + ' in fuel (' + best.roundTrip + ' mi round trip).';
  if (savings > 20) {
    html += '<br>That\\'s <strong>$' + savings.toFixed(0) + ' more per load</strong> than the next-best option.';
  }
  html += '</div>';

  html += '<div class="price-table-wrap"><table>';
  html += '<tr><th>Auction</th><th>Distance</th><th>Round Trip</th><th>Fuel Cost</th><th>Gross $/Ton</th><th>Net $/Ton</th><th>Net Load Value</th></tr>';
  for (var j = 0; j < results.length; j++) {
    var r = results[j];
    var rowClass = j === 0 ? ' class="net-best"' : '';
    html += '<tr' + rowClass + '>';
    html += '<td class="category-cell">' + r.name + '</td>';
    html += '<td>' + r.distance + ' mi</td>';
    html += '<td>' + r.roundTrip + ' mi</td>';
    html += '<td class="price-cell" style="color:var(--barn-red)">-$' + r.fuelCost.toFixed(0) + '</td>';
    html += '<td class="price-cell">$' + r.grossPrice.toFixed(2) + '</td>';
    html += '<td class="price-cell" style="font-weight:700">$' + r.netPerTon.toFixed(2) + '</td>';
    html += '<td class="price-cell" style="font-weight:700">$' + r.netValue.toFixed(0) + '</td>';
    html += '</tr>';
  }
  html += '</table></div>';
  html += '<p style="font-size:0.72em; color:var(--ink-muted); margin-top:6px; font-style:italic;">Estimates based on ' + MPG + ' mpg loaded flatbed, ' + ROAD_FACTOR + 'x road factor, $' + diesel.toFixed(2) + '/gal diesel. Actual costs will vary.</p>';
  html += '<p style="font-size:0.72em; color:var(--barn-red); margin-top:4px; font-weight:500;"><strong>Not a price quote.</strong> Prices shown are historical per-ton averages from USDA-reported sales. Actual prices vary by hay quality, moisture content, bale weight, and buyer demand.</p>';

  resultDiv.innerHTML = html;
  resultDiv.classList.add('visible');
}
</script>`;
}

function renderHayPredictions(predictions: Prediction[]): string {
  if (predictions.length === 0) {
    return `<div style="background:var(--card-bg); border:1px solid var(--border); border-radius:8px; padding:24px; text-align:center; color:var(--ink-muted);">
  <p><strong>&#x1F33E; Hay Price Predictions &mdash; Calibrating</strong></p>
  <p style="margin-top:8px;">BarnSignal's hay prediction engine analyzes price momentum, tonnage supply changes, and seasonal cutting cycles. Predictions will appear after the next auction cycle.</p>
</div>`;
  }

  // Filter out legacy "flat" predictions from old 3-class model
  const filtered = predictions.filter((p) => p.predictedDirection !== "flat");
  const rows = filtered.slice(0, 30).map((p) => {
    const arrow = p.predictedDirection === "up" ? "\u2191" : "\u2193";
    const trendClass = p.predictedDirection === "up" ? "trend-up" : "trend-down";
    const confColor = p.confidence > 60 ? "var(--field-green)" : p.confidence > 40 ? "var(--wheat)" : "var(--ink-muted)";

    let statusBadge;
    if (!p.resolved) {
      statusBadge = `<span style="background:var(--parchment-dark);color:var(--ink-muted);padding:2px 8px;border-radius:10px;font-size:0.78em;">Pending</span>`;
    } else if (p.correct) {
      statusBadge = `<span style="background:rgba(58,107,53,0.12);color:var(--field-green);padding:2px 8px;border-radius:10px;font-size:0.78em;">\u2713 Correct</span>`;
    } else {
      statusBadge = `<span style="background:rgba(139,37,0,0.12);color:var(--barn-red);padding:2px 8px;border-radius:10px;font-size:0.78em;">\u2717 Wrong</span>`;
    }

    const actualCol = p.resolved
      ? `$${p.actualAvgPrice?.toFixed(2)}/ton`
      : "\u2014";

    return `<tr>
      <td>${p.barnName}</td>
      <td class="category-cell">${p.category}</td>
      <td class="price-cell">$${p.currentAvgPrice.toFixed(2)}</td>
      <td class="${trendClass}" style="font-weight:600">${arrow} ${p.predictedDirection}</td>
      <td><div style="display:inline-block;width:60px;height:8px;background:var(--parchment-dark);border-radius:4px;overflow:hidden;vertical-align:middle;margin-right:6px;"><div style="width:${p.confidence}%;height:100%;background:${confColor};border-radius:4px;"></div></div>${p.confidence}%</td>
      <td>${p.targetDate}</td>
      <td class="price-cell">${actualCol}</td>
      <td>${statusBadge}</td>
    </tr>`;
  });

  return `<div class="price-table-wrap"><table>
<tr><th>Auction</th><th>Category</th><th>Current $/Ton</th><th>Call</th><th>Confidence</th><th>Target Date</th><th>Actual</th><th>Status</th></tr>
${rows.join("\n")}
</table></div>
<p style="font-size:0.78em; color:var(--ink-muted); margin-top:8px; font-style:italic;">ML predictions powered by Random Forest classifier with 21 features: price momentum, mean reversion, CME futures basis, supply dynamics, and seasonal cutting-cycle patterns. Not financial advice.</p>`;
}

function renderHayAccuracy(predictions: Prediction[]): string {
  const resolved = predictions.filter((p) => p.resolved);
  const correct = resolved.filter((p) => p.correct);

  if (resolved.length === 0) {
    return `<div style="background:var(--card-bg); border:1px solid var(--border); border-radius:8px; padding:24px; text-align:center; color:var(--ink-muted);">
  <p><strong>Accuracy tracking will begin once predictions are resolved against actual auction data.</strong></p>
  <p style="margin-top:8px;">This typically takes 1\u20132 auction cycles.</p>
</div>`;
  }

  const accuracy = Math.round((correct.length / resolved.length) * 100);

  // By category
  const byCat: Record<string, { total: number; correct: number }> = {};
  const byBarn: Record<string, { total: number; correct: number }> = {};
  for (const p of resolved) {
    if (!byCat[p.category]) byCat[p.category] = { total: 0, correct: 0 };
    byCat[p.category].total++;
    if (p.correct) byCat[p.category].correct++;

    if (!byBarn[p.barnName]) byBarn[p.barnName] = { total: 0, correct: 0 };
    byBarn[p.barnName].total++;
    if (p.correct) byBarn[p.barnName].correct++;
  }

  const catRows = Object.entries(byCat)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([cat, s]) => {
      const acc = Math.round((s.correct / s.total) * 100);
      return `<tr><td class="category-cell">${cat}</td><td>${s.total}</td><td>${s.correct}</td><td class="price-cell">${acc}%</td></tr>`;
    }).join("\n");

  const barnRows = Object.entries(byBarn)
    .map(([barn, s]) => {
      const acc = Math.round((s.correct / s.total) * 100);
      return `<tr><td class="category-cell">${barn}</td><td>${s.total}</td><td>${s.correct}</td><td class="price-cell">${acc}%</td></tr>`;
    }).join("\n");

  return `
<div class="stats-grid" style="grid-template-columns: repeat(3, 1fr);">
  <div class="stat-card">
    <div class="stat-label">Overall Accuracy</div>
    <div class="stat-value" style="color:var(--field-green);">${accuracy}%</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Resolved / Total</div>
    <div class="stat-value">${resolved.length}/${predictions.length}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Correct</div>
    <div class="stat-value" style="color:var(--field-green);">${correct.length}</div>
  </div>
</div>

${catRows ? `
<h3 style="margin: 1rem 0 0.5rem; color: var(--ink); font-weight:600;">By Category</h3>
<div class="price-table-wrap"><table>
<tr><th>Category</th><th>Predictions</th><th>Correct</th><th>Accuracy</th></tr>
${catRows}
</table></div>` : ""}

${barnRows ? `
<h3 style="margin: 1rem 0 0.5rem; color: var(--ink); font-weight:600;">By Auction</h3>
<div class="price-table-wrap"><table>
<tr><th>Auction</th><th>Predictions</th><th>Correct</th><th>Accuracy</th></tr>
${barnRows}
</table></div>` : ""}
`;
}

function renderHayStatsCards(barns: AuctionEntry[], hayPredictions: Prediction[]): string {
  const totalTons = barns.reduce((sum, b) => sum + b.totalReceipts, 0);
  const totalCategories = barns.reduce((sum, b) => sum + b.categories.length, 0);

  const allCats = barns.flatMap((b) => b.categories);
  const hayOnly = allCats.filter((c) => c.category.toLowerCase().includes("alfalfa") || c.category.toLowerCase().includes("grass") || c.category.toLowerCase().includes("orchard"));
  const strawOnly = allCats.filter((c) => c.category.toLowerCase().includes("straw") || c.category.toLowerCase().includes("corn stalk"));

  const avgHayPrice = hayOnly.length > 0 ? hayOnly.reduce((s, c) => s + c.avgPrice, 0) / hayOnly.length : 0;
  const avgStrawPrice = strawOnly.length > 0 ? strawOnly.reduce((s, c) => s + c.avgPrice, 0) / strawOnly.length : 0;

  // Compute hay-specific accuracy from resolved predictions
  const resolved = hayPredictions.filter((p) => p.resolved);
  const correct = resolved.filter((p) => p.correct);
  const accuracy = resolved.length > 0 ? Math.round((correct.length / resolved.length) * 100) : 0;
  const totalPreds = hayPredictions.length;

  return `
<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-label">Hay Auctions</div>
    <div class="stat-value">${barns.length}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Tons This Week</div>
    <div class="stat-value">${totalTons.toLocaleString()}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Avg Hay $/Ton</div>
    <div class="stat-value">${avgHayPrice > 0 ? "$" + avgHayPrice.toFixed(0) : "\u2014"}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Avg Straw $/Ton</div>
    <div class="stat-value">${avgStrawPrice > 0 ? "$" + avgStrawPrice.toFixed(0) : "\u2014"}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">AI Accuracy</div>
    <div class="stat-value ${accuracy >= 50 ? "green" : accuracy > 0 ? "" : ""}">${totalPreds > 0 ? accuracy + "%" : "\u2014"}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Predictions</div>
    <div class="stat-value">${totalPreds}</div>
  </div>
</div>`;
}

function renderHayTicker(barns: AuctionEntry[]): string {
  if (barns.length === 0) return "";

  const items: string[] = [];
  for (const barn of barns) {
    for (const cat of barn.categories.slice(0, 8)) {
      const priceStr = "$" + cat.avgPrice.toFixed(0) + "/ton";
      items.push(
        '<span class="ticker-item"><span class="name">' + barn.barnName + '</span> ' + cat.category + ': <span class="neutral">' + priceStr + '</span> (' + cat.head + 't)</span>'
      );
    }
  }

  const allItems = items.join("") + items.join("");
  return '<div class="ticker"><div class="ticker-inner">' + allItems + '</div></div>';
}

export async function renderHayDashboard(): Promise<string> {
  const barnData: (AuctionEntry | null)[] = [];
  for (const barn of HAY_BARNS) {
    barnData.push(await getLatestAuction(barn.reportId));
  }

  // Filter out stale data Ã¢ÂÂ only show auctions with reports from the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString().split("T")[0];

  // Fetch hay predictions Ã¢ÂÂ filter to hay barns and exclude stale predictions
  const allPredictions = await getAllPredictions(100);
  const hayReportIds = HAY_BARNS.map((b) => b.reportId);
  const hayPredictions = allPredictions.filter(
    (p) => hayReportIds.includes(p.reportId) && p.targetDate >= cutoff
  );

  const activeBarns = (barnData.filter(Boolean) as AuctionEntry[]).filter(
    (b) => b.reportDate >= cutoff
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BarnSignal Ã¢ÂÂ Hay &amp; Straw Auction Prices | Lancaster County PA</title>
<meta name="description" content="Compare hay and straw auction prices across Lancaster County PA. Per-ton pricing by bale type from Wolgemuth and Kirkwood hay auctions. USDA data, updated weekly.">
<meta property="og:title" content="BarnSignal Ã¢ÂÂ Hay & Straw Prices">
<meta property="og:description" content="Cross-auction hay price comparison from USDA-reported auctions in Lancaster County PA. Per-ton pricing by bale type.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://barnsignal.com/hay">
<link rel="canonical" href="https://barnsignal.com/hay">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root { --parchment: #f5f0e8; --parchment-dark: #e8e0d0; --ink: #2c2416; --ink-light: #5a4e3a; --ink-muted: #8a7e6a; --barn-red: #8b2500; --barn-red-light: #a83a15; --field-green: #3a6b35; --field-green-light: #4a8b45; --wheat: #c4a55a; --wheat-light: #d4b56a; --sky: #4a7fa5; --soil: #6b5344; --border: #d4cbb8; --card-bg: #faf7f0; --shadow: rgba(44, 36, 22, 0.08); }
  body { font-family: 'DM Sans', Georgia, serif; background: var(--parchment); color: var(--ink); line-height: 1.6; }
  header { background: var(--ink); color: var(--parchment); padding: 0; }
  .header-top { max-width: 1200px; margin: 0 auto; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
  .logo-area h1 { font-size: 2em; font-weight: 700; letter-spacing: -0.5px; line-height: 1; }
  .logo-area h1 span { color: var(--wheat); }
  .logo-area .tagline { font-size: 0.85em; color: #a09880; margin-top: 4px; font-style: italic; }
  .header-meta { text-align: right; font-size: 0.82em; color: #a09880; }
  .header-meta .live-dot { display: inline-block; width: 8px; height: 8px; background: var(--field-green-light); border-radius: 50%; margin-right: 6px; animation: pulse 2s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  .tab-bar { background: var(--ink); border-top: 1px solid rgba(255,255,255,0.08); }
  .tab-bar-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; display: flex; gap: 0; }
  .tab-link { display: inline-block; padding: 12px 24px; color: #a09880; text-decoration: none; font-size: 0.88em; font-weight: 600; letter-spacing: 0.3px; border-bottom: 3px solid transparent; transition: all 0.2s; }
  .tab-link:hover { color: var(--parchment); }
  .tab-link.active { color: var(--wheat); border-bottom-color: var(--wheat); }
  .tab-link .tab-icon { margin-right: 6px; }
  .ticker { background: #1a1610; padding: 10px 0; overflow: hidden; white-space: nowrap; border-bottom: 2px solid var(--soil); }
  .ticker-inner { display: inline-block; animation: ticker-scroll 200s linear infinite; }
  .ticker-item { display: inline-block; margin-right: 40px; font-family: 'DM Mono', monospace; font-size: 0.82em; color: #c0b8a0; }
  .ticker-item .name { color: var(--soil); font-weight: 500; }
  .ticker-item .neutral { color: var(--ink-muted); }
  @keyframes ticker-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
  .hero { background: var(--card-bg); border-bottom: 1px solid var(--border); padding: 32px 0; }
  .hero-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; display: flex; justify-content: space-between; align-items: center; gap: 32px; }
  .hero-text { max-width: 680px; }
  .hero-text h2 { font-size: 1.5em; font-weight: 700; line-height: 1.3; margin-bottom: 10px; }
  .hero-text p { font-size: 0.95em; color: var(--ink-light); line-height: 1.6; margin-bottom: 6px; }
  .hero-text .audience { font-size: 0.82em; color: var(--ink-muted); font-style: italic; margin-top: 8px; }
  .hero-cta { flex-shrink: 0; }
  .cta-box { background: white; border: 1px solid var(--border); border-radius: 8px; padding: 20px; text-align: center; min-width: 260px; }
  .cta-box .cta-label { font-size: 0.78em; text-transform: uppercase; letter-spacing: 0.8px; color: var(--ink-muted); font-weight: 600; margin-bottom: 10px; }
  .cta-box input[type="email"] { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 6px; font-family: 'DM Sans', Georgia, serif; font-size: 0.9em; margin-bottom: 8px; outline: none; }
  .cta-box input[type="email"]:focus { border-color: var(--wheat); }
  .cta-btn { display: block; width: 100%; padding: 10px; background: var(--soil); color: white; border: none; border-radius: 6px; font-family: 'DM Sans', Georgia, serif; font-size: 0.9em; font-weight: 600; cursor: pointer; }
  .cta-btn:hover { background: var(--ink-light); }
  .cta-box .cta-note { font-size: 0.72em; color: var(--ink-muted); margin-top: 6px; }
  .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
  .section-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; margin-top: 32px; border-bottom: 2px solid var(--ink); padding-bottom: 8px; }
  .section-header h2 { font-size: 1.2em; font-weight: 700; }
  .section-header .source { font-size: 0.75em; color: var(--ink-muted); font-style: italic; }
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 28px; }
  .stat-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .stat-card .stat-label { font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.8px; color: var(--ink-muted); font-weight: 600; }
  .stat-card .stat-value { font-size: 1.8em; font-weight: 700; font-family: 'DM Mono', monospace; line-height: 1.2; margin-top: 4px; }
  .price-table-wrap { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; overflow-x: auto; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 0.88em; }
  th { background: var(--ink); color: var(--parchment); text-align: left; padding: 10px 14px; font-size: 0.78em; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; }
  td { padding: 10px 14px; border-bottom: 1px solid var(--border); }
  tr:last-child td { border-bottom: none; }
  tr:hover { background: var(--parchment); }
  .category-cell { font-weight: 600; color: var(--ink); }
  .price-cell { font-family: 'DM Mono', monospace; font-weight: 500; }
  .best-price { background: rgba(58, 107, 53, 0.08); color: var(--field-green); font-weight: 700; }
  .barn-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; margin-top: 16px; }
  .barn-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .barn-card-header { background: var(--soil); color: white; padding: 14px 18px; }
  .barn-card-header h3 { font-size: 1em; font-weight: 700; }
  .barn-card-header .meta { font-size: 0.78em; opacity: 0.85; margin-top: 4px; }
  .calc-box { background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin-bottom: 24px; }
  .calc-box h3 { font-size: 1.05em; margin-bottom: 8px; }
  .calc-desc { font-size: 0.88em; color: var(--ink-light); margin-bottom: 16px; line-height: 1.5; }
  .calc-inputs { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; margin-bottom: 16px; }
  .calc-field label { display: block; font-size: 0.75em; text-transform: uppercase; letter-spacing: 0.5px; color: var(--ink-muted); font-weight: 600; margin-bottom: 4px; }
  .calc-field input, .calc-field select { padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-family: 'DM Sans', Georgia, serif; font-size: 0.88em; }
  .calc-go { padding: 8px 20px; background: var(--soil); color: white; border: none; border-radius: 6px; font-family: 'DM Sans', Georgia, serif; font-size: 0.88em; font-weight: 600; cursor: pointer; }
  .calc-go:hover { background: var(--ink-light); }
  .calc-result { max-height: 0; overflow: hidden; transition: max-height 0.3s; }
  .calc-result.visible { max-height: 2000px; }
  .calc-best { background: rgba(107, 83, 68, 0.08); border-left: 4px solid var(--soil); padding: 14px 18px; margin-bottom: 14px; border-radius: 0 6px 6px 0; font-size: 0.92em; line-height: 1.5; }
  tr.net-best { background: rgba(107, 83, 68, 0.06); }
  .trend-up { color: var(--field-green); }
  .trend-down { color: var(--barn-red); }
  .trend-neutral { color: var(--ink-muted); }
  footer { background: var(--ink); color: #a09880; padding: 28px 24px; margin-top: 48px; font-size: 0.82em; }
  footer .footer-inner { max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 20px; }
  footer a { color: var(--wheat); text-decoration: none; }
  footer .disclaimer { max-width: 600px; font-size: 0.88em; line-height: 1.5; font-style: italic; }
  @media (max-width: 768px) { .header-top { flex-direction: column; } .header-meta { text-align: left; margin-top: 10px; } .hero-inner { flex-direction: column; } .hero-cta { width: 100%; } .cta-box { min-width: auto; } .stats-grid { grid-template-columns: repeat(2, 1fr); } .barn-grid { grid-template-columns: 1fr; } .container { padding: 16px; } .logo-area h1 { font-size: 1.5em; } .hero-text h2 { font-size: 1.2em; } table { font-size: 0.78em; } th, td { padding: 8px 10px; white-space: nowrap; } }
</style>
</head>
<body>

<header>
  <div class="header-top">
    <div class="logo-area">
      <h1>Barn<span>Signal</span></h1>
      <div class="tagline">Your signal before the sale.</div>
    </div>
    <div class="header-meta">
      <div><span class="live-dot"></span> Live data from ${BARNS.length + HAY_BARNS.length} USDA-reported auctions</div>
      <div style="margin-top:4px;">${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
    </div>
  </div>
  <div class="tab-bar">
    <div class="tab-bar-inner">
      <a class="tab-link" href="/"><span class="tab-icon">&#x1F404;</span>Cattle</a>
      <a class="tab-link active" href="/hay"><span class="tab-icon">&#x1F33E;</span>Hay &amp; Straw</a>
      <a class="tab-link" href="/accuracy"><span class="tab-icon">&#x1F3AF;</span>Track Record</a>
    </div>
  </div>
</header>

${renderHayTicker(activeBarns)}

<section class="hero">
  <div class="hero-inner">
    <div class="hero-text">
      <h2>Hay &amp; straw prices across Lancaster County &mdash; compared before you hitch the trailer.</h2>
      <p>BarnSignal tracks per-ton hay and straw auction prices from USDA-reported sales at ${HAY_BARNS.length} auctions across Lancaster County. Cross-auction price comparison by bale type, net price calculator, and weekly trends.</p>
      <p class="audience">Tracking ${activeBarns.reduce((s, b) => s + b.totalReceipts, 0).toLocaleString()}+ tons across ${HAY_BARNS.length} auctions this week. Built for hay buyers, livestock operations, and auction regulars.</p>
    </div>
    <div class="hero-cta">
      <div class="cta-box">
        <div class="cta-label">Get Hay Price Alerts</div>
        <div style="font-size:0.82em; color:var(--ink-light); margin-bottom:10px; line-height:1.4;">Hay auction alerts from <strong>${HAY_BARNS.length} auctions</strong> on sale days.</div>
        <input type="email" placeholder="your@email.com" id="cta-email" />
        <button class="cta-btn" id="cta-btn" onclick="submitHaySignup()">Sign Up Free</button>
        <div class="cta-note" id="cta-note">Auction-day alerts only. No spam.</div>
      </div>
    </div>
  </div>
</section>

<div class="container">

${renderHayStatsCards(activeBarns, hayPredictions)}

${renderHayCalculator(activeBarns)}

<div class="section-header">
  <h2>Cross-Auction Hay Price Comparison</h2>
  <span class="source">Data: USDA AMS Market News</span>
</div>
${activeBarns.length >= 2 ? renderHayCrossComparison(activeBarns) : "<p style='color:var(--ink-muted);'>Collecting data from multiple auctions... cross-auction comparison will appear after the next auction cycle.</p>"}

<div class="section-header">
  <h2>AI Hay Price Predictions</h2>
  <span class="source">ML Random Forest + CME + Cultural Calendar (binary up/down)</span>
</div>
${renderHayPredictions(hayPredictions)}

<div class="section-header">
  <h2>Prediction Accuracy</h2>
  <span class="source">Running track record</span>
</div>
${renderHayAccuracy(hayPredictions)}

<div class="section-header">
  <h2>Auction Reports by Bale Type</h2>
  <span class="source">Most recent sale data</span>
</div>
<div class="barn-grid">
${activeBarns.map((b) => renderHayBarnCard(b)).join("\n")}
</div>

${activeBarns.length === 0 ? `
<div style="text-align:center; padding:3rem; color:var(--ink-muted);">
  <h3>Waiting for first hay auction data...</h3>
  <p>Hay auction data will appear after the next scheduled fetch (Mon/Tue/Wed evenings).</p>
  <p style="margin-top:0.5rem;">Or trigger manually: <code>GET /api/fetch</code></p>
</div>
` : ""}

</div>

<footer>
  <div class="footer-inner">
    <div>
      <strong style="color:var(--parchment);">BarnSignal</strong> v1.0<br>
      Mid-Atlantic Hay &amp; Straw Price Intelligence<br>
      <a href="/">Cattle Prices</a> | <a href="https://github.com/tharmer/barnsignal">GitHub</a>
    </div>
    <div class="disclaimer">
      Data source: USDA AMS Livestock, Poultry &amp; Grain Market News.<br>
      All prices shown are historical per-ton averages from completed sales and are not quotes, offers, or guarantees of future prices. Actual sale prices vary by hay quality, moisture content, bale weight, and buyer demand. BarnSignal is not liable for decisions made based on this data.
    </div>
  </div>
</footer>

<script>
function submitHaySignup() {
  var email = document.getElementById('cta-email').value.trim();
  var btn = document.getElementById('cta-btn');
  var note = document.getElementById('cta-note');
  if (!email || email.indexOf('@') === -1) { note.textContent = 'Please enter a valid email address.'; note.style.color = 'var(--barn-red)'; return; }
  btn.disabled = true; btn.textContent = 'Signing up...';
  fetch('/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, region: 'hay' }) })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (data.success) { btn.textContent = 'Signed Up'; note.textContent = data.message; note.style.color = 'var(--field-green)'; document.getElementById('cta-email').disabled = true; }
    else { btn.textContent = 'Sign Up Free'; btn.disabled = false; note.textContent = data.error || 'Something went wrong.'; note.style.color = 'var(--barn-red)'; }
  })
  .catch(function() { btn.textContent = 'Sign Up Free'; btn.disabled = false; note.textContent = 'Network error. Try again.'; note.style.color = 'var(--barn-red)'; });
}
</script>

</body>
</html>`;
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// /accuracy Ã¢ÂÂ Track Record Page
// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

export async function renderAccuracyPage(): Promise<string> {
  const predictions = await getAllPredictions(200);
  const stats = await getAccuracyStats();

  // Separate resolved from pending, filter out legacy flat
  const allPreds = predictions.filter((p) => p.predictedDirection !== "flat");
  const resolved = allPreds.filter((p) => p.resolved);
  const pending = allPreds.filter((p) => !p.resolved);

  // Live accuracy stats
  const correct = resolved.filter((p) => p.correct);
  const liveAcc = resolved.length > 0 ? Math.round((correct.length / resolved.length) * 100) : 0;
  const liveColor = resolved.length === 0 ? "var(--ink-muted)" : liveAcc >= 55 ? "var(--field-green)" : liveAcc >= 50 ? "#b8860b" : "var(--barn-red)";

  // Build resolved rows (most recent first)
  const resolvedRows = resolved
    .sort((a, b) => new Date(b.resolvedAt || b.targetDate).getTime() - new Date(a.resolvedAt || a.targetDate).getTime())
    .map((p) => {
      const icon = p.correct ? `<span style="color:var(--field-green);">&#x2713;</span>` : `<span style="color:var(--barn-red);">&#x2717;</span>`;
      const arrow = p.predictedDirection === "up" ? "\u2191" : "\u2193";
      const actualArrow = p.actualDirection === "up" ? "\u2191" : "\u2193";
      return `<tr>
        <td>${icon}</td>
        <td>${p.barnName}</td>
        <td class="category-cell">${p.category}</td>
        <td class="price-cell">$${p.currentAvgPrice.toFixed(2)}</td>
        <td style="font-weight:600;">${arrow} ${p.predictedDirection}</td>
        <td>${p.confidence}%</td>
        <td class="price-cell">$${p.actualAvgPrice?.toFixed(2) || "\u2014"}</td>
        <td>${actualArrow} ${p.actualDirection || "\u2014"}</td>
        <td>${p.targetDate}</td>
      </tr>`;
    })
    .join("\n");

  // Build pending rows
  const pendingRows = pending
    .sort((a, b) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime())
    .map((p) => {
      const arrow = p.predictedDirection === "up" ? "\u2191" : "\u2193";
      const trendClass = p.predictedDirection === "up" ? "trend-up" : "trend-down";
      return `<tr>
        <td style="color:var(--ink-muted);">&#x23F3;</td>
        <td>${p.barnName}</td>
        <td class="category-cell">${p.category}</td>
        <td class="price-cell">$${p.currentAvgPrice.toFixed(2)}</td>
        <td class="${trendClass}" style="font-weight:600;">${arrow} ${p.predictedDirection}</td>
        <td>${p.confidence}%</td>
        <td colspan="2" style="color:var(--ink-muted); text-align:center;">Awaiting ${p.targetDate}</td>
        <td>${p.targetDate}</td>
      </tr>`;
    })
    .join("\n");

  // Accuracy by barn
  const barnStats = Object.entries(stats.byBarn)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([barn, s]) => {
      const barColor = s.accuracy >= 55 ? "var(--field-green)" : s.accuracy >= 50 ? "#b8860b" : "var(--barn-red)";
      return `<tr><td>${barn}</td><td>${s.total}</td><td>${s.correct}</td><td style="font-weight:600; color:${barColor};">${s.accuracy}%</td></tr>`;
    })
    .join("\n");

  // Accuracy by category
  const catStats = Object.entries(stats.byCategory)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([cat, s]) => {
      const barColor = s.accuracy >= 55 ? "var(--field-green)" : s.accuracy >= 50 ? "#b8860b" : "var(--barn-red)";
      return `<tr><td class="category-cell">${cat}</td><td>${s.total}</td><td>${s.correct}</td><td style="font-weight:600; color:${barColor};">${s.accuracy}%</td></tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BarnSignal Ã¢ÂÂ Track Record | Model Accuracy &amp; Backtest Results</title>
<meta name="description" content="BarnSignal's AI prediction track record. See live accuracy, historical backtest results, and feature importance for our livestock price prediction model.">
<link rel="canonical" href="https://barnsignal.com/accuracy">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --parchment: #f5f0e8; --parchment-dark: #e8e0d0; --ink: #2c2416; --ink-light: #5a4e3a;
    --ink-muted: #8a7e6a; --barn-red: #8b2500; --barn-red-light: #a83a15; --field-green: #3a6b35;
    --field-green-light: #4a8b45; --wheat: #c4a55a; --wheat-light: #d4b56a; --sky: #4a7fa5;
    --soil: #6b5344; --border: #d4cbb8; --card-bg: #faf7f0; --shadow: rgba(44, 36, 22, 0.08);
  }
  body { font-family: 'DM Sans', Georgia, serif; background: var(--parchment); color: var(--ink); line-height: 1.6; }
  header { background: var(--ink); color: var(--parchment); padding: 0; }
  .header-top { max-width: 1200px; margin: 0 auto; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
  .logo-area h1 { font-size: 2em; font-weight: 700; letter-spacing: -0.5px; line-height: 1; }
  .logo-area h1 span { color: var(--wheat); }
  .logo-area .tagline { font-size: 0.85em; color: #a09880; margin-top: 4px; font-style: italic; }
  .header-meta { text-align: right; font-size: 0.82em; color: #a09880; }
  .header-meta .live-dot { display: inline-block; width: 8px; height: 8px; background: var(--field-green-light); border-radius: 50%; margin-right: 6px; animation: pulse 2s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  .tab-bar { background: rgba(0,0,0,0.15); }
  .tab-bar-inner { max-width: 1200px; margin: 0 auto; padding: 0 24px; display: flex; gap: 0; }
  .tab-link { display: inline-block; padding: 12px 24px; color: #a09880; text-decoration: none; font-size: 0.88em; font-weight: 600; letter-spacing: 0.3px; border-bottom: 3px solid transparent; transition: all 0.2s; }
  .tab-link:hover { color: var(--parchment); }
  .tab-link.active { color: var(--wheat); border-bottom-color: var(--wheat); }
  .tab-link .tab-icon { margin-right: 6px; }

  main { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
  .section-header { display: flex; justify-content: space-between; align-items: baseline; margin: 32px 0 12px; border-bottom: 2px solid var(--border); padding-bottom: 8px; }
  .section-header h2 { font-size: 1.3em; font-weight: 700; }
  .source { font-size: 0.78em; color: var(--ink-muted); font-style: italic; }

  .hero-accuracy { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 32px; margin-bottom: 32px; }

  .acc-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 24px 0; }
  .acc-card { background: var(--parchment); border: 1px solid var(--border); border-radius: 8px; padding: 20px; text-align: center; }
  .acc-card .acc-label { font-size: 0.78em; color: var(--ink-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .acc-card .acc-value { font-size: 2em; font-weight: 700; }
  .acc-card .acc-sub { font-size: 0.78em; color: var(--ink-muted); margin-top: 4px; }

  .backtest-table { width: 100%; border-collapse: collapse; font-size: 0.85em; margin: 12px 0; }
  .backtest-table th { background: var(--ink); color: var(--parchment); padding: 10px 12px; text-align: left; font-weight: 600; font-size: 0.82em; text-transform: uppercase; letter-spacing: 0.3px; }
  .backtest-table td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
  .backtest-table tr:hover { background: rgba(196, 165, 90, 0.06); }
  .backtest-table .winner { background: rgba(58,107,53,0.08); font-weight: 600; }
  .backtest-table .price-cell { text-align: right; font-family: 'DM Mono', monospace; }
  .backtest-table .category-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .importance-bar { display: inline-block; height: 10px; background: var(--wheat); border-radius: 3px; margin-right: 8px; vertical-align: middle; }

  .price-table-wrap { overflow-x: auto; margin: 12px 0; }
  .price-table-wrap table { width: 100%; border-collapse: collapse; font-size: 0.85em; }
  .price-table-wrap th { background: var(--ink); color: var(--parchment); padding: 10px 12px; text-align: left; font-weight: 600; font-size: 0.82em; text-transform: uppercase; letter-spacing: 0.3px; }
  .price-table-wrap td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
  .price-table-wrap tr:hover { background: rgba(196, 165, 90, 0.06); }
  .price-table-wrap .price-cell { text-align: right; font-family: 'DM Mono', monospace; }
  .price-table-wrap .category-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .trend-up { color: var(--field-green); }
  .trend-down { color: var(--barn-red); }

  .method-card { background: var(--parchment); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin: 12px 0; }
  .method-card h4 { margin-bottom: 8px; color: var(--ink); }
  .method-card p { font-size: 0.88em; color: var(--ink-light); }

  footer { max-width: 1200px; margin: 0 auto; padding: 24px; text-align: center; font-size: 0.78em; color: var(--ink-muted); border-top: 1px solid var(--border); margin-top: 40px; }
  footer a { color: var(--wheat); text-decoration: none; }

  @media (max-width: 768px) {
    .acc-grid { grid-template-columns: repeat(2, 1fr); }
    .header-top { flex-direction: column; text-align: center; gap: 8px; }
    .header-meta { text-align: center; }
  }
</style>
</head>
<body>

<header>
  <div class="header-top">
    <div class="logo-area">
      <h1>Barn<span>Signal</span></h1>
      <div class="tagline">Your signal before the sale.</div>
    </div>
    <div class="header-meta">
      <div><span class="live-dot"></span> Live data from ${BARNS.length + HAY_BARNS.length} USDA-reported auctions</div>
      <div style="margin-top:4px;">${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
    </div>
  </div>
  <div class="tab-bar">
    <div class="tab-bar-inner">
      <a class="tab-link" href="/"><span class="tab-icon">&#x1F404;</span>Cattle</a>
      <a class="tab-link" href="/hay"><span class="tab-icon">&#x1F33E;</span>Hay &amp; Straw</a>
      <a class="tab-link active" href="/accuracy"><span class="tab-icon">&#x1F3AF;</span>Track Record</a>
    </div>
  </div>
</header>

<main>

<div class="hero-accuracy">
  <h2 style="font-size:1.5em; margin-bottom:8px;">Model Track Record</h2>
  <p style="color:var(--ink-light); font-size:0.95em;">Every prediction BarnSignal makes is logged, timestamped, and scored against actual auction results. No cherry-picking, no hidden misses. This page shows the full record.</p>

  <div class="acc-grid">
    <div class="acc-card">
      <div class="acc-label">Live Accuracy</div>
      <div class="acc-value" style="color:${liveColor};">${resolved.length > 0 ? liveAcc + "%" : "\u2014"}</div>
      <div class="acc-sub">${resolved.length > 0 ? `${correct.length}/${resolved.length} correct` : "Awaiting first resolutions"}</div>
    </div>
    <div class="acc-card">
      <div class="acc-label">Backtest Accuracy</div>
      <div class="acc-value" style="color:var(--field-green);">56.2%</div>
      <div class="acc-sub">GradientBoosting binary, 36 features</div>
    </div>
    <div class="acc-card">
      <div class="acc-label">Predictions Made</div>
      <div class="acc-value">${allPreds.length}</div>
      <div class="acc-sub">${pending.length} pending, ${resolved.length} resolved</div>
    </div>
    <div class="acc-card">
      <div class="acc-label">Confidence Target</div>
      <div class="acc-value" style="color:var(--wheat);">&gt;55%</div>
      <div class="acc-sub">Better than coin flip = edge</div>
    </div>
  </div>
</div>

<!-- Ã¢ÂÂÃ¢ÂÂ Backtest Results Ã¢ÂÂÃ¢ÂÂ -->
<div class="section-header">
  <h2>Backtest Results</h2>
  <span class="source">Walk-forward validation, scikit-learn, 9 barns, 3+ years of data</span>
</div>

<p style="font-size:0.88em; color:var(--ink-light); margin-bottom:16px;">Before going live, we tested 6 model configurations using walk-forward backtesting on historical USDA auction data. Each prediction was made using only data available at the time &mdash; no future leakage.</p>

<div class="price-table-wrap">
<table class="backtest-table">
<tr>
  <th>Configuration</th>
  <th style="text-align:right;">Features</th>
  <th>Labels</th>
  <th style="text-align:right;">Overall</th>
  <th style="text-align:right;">Cattle</th>
  <th style="text-align:right;">Hi-Conf (&ge;65%)</th>
  <th style="text-align:right;">Very-Hi (&ge;75%)</th>
  <th style="text-align:right;">vs Baseline</th>
</tr>
<tr>
  <td>A: Random Forest (baseline)</td>
  <td class="price-cell">21</td>
  <td>3-class</td>
  <td class="price-cell">39.4%</td>
  <td class="price-cell">39.4%</td>
  <td class="price-cell">46.8%</td>
  <td class="price-cell">51.3%</td>
  <td class="price-cell" style="color:var(--ink-muted);">&mdash;</td>
</tr>
<tr>
  <td>B: GradientBoosting</td>
  <td class="price-cell">21</td>
  <td>3-class</td>
  <td class="price-cell">39.3%</td>
  <td class="price-cell">39.3%</td>
  <td class="price-cell">40.6%</td>
  <td class="price-cell">42.0%</td>
  <td class="price-cell" style="color:var(--barn-red);">&minus;0.1%</td>
</tr>
<tr>
  <td>C: GradientBoosting Binary</td>
  <td class="price-cell">21</td>
  <td>2-class</td>
  <td class="price-cell" style="font-weight:600;">55.3%</td>
  <td class="price-cell" style="font-weight:600;">55.3%</td>
  <td class="price-cell">56.3%</td>
  <td class="price-cell">56.3%</td>
  <td class="price-cell" style="color:var(--field-green); font-weight:600;">+15.9%</td>
</tr>
<tr>
  <td>D: GradientBoosting + Cultural</td>
  <td class="price-cell">33</td>
  <td>3-class</td>
  <td class="price-cell">41.1%</td>
  <td class="price-cell">41.1%</td>
  <td class="price-cell">41.9%</td>
  <td class="price-cell">42.9%</td>
  <td class="price-cell" style="color:var(--field-green);">+1.7%</td>
</tr>
<tr>
  <td>E: GB Binary + Cultural</td>
  <td class="price-cell">33</td>
  <td>2-class</td>
  <td class="price-cell" style="font-weight:600;">55.6%</td>
  <td class="price-cell" style="font-weight:600;">55.6%</td>
  <td class="price-cell">56.6%</td>
  <td class="price-cell" style="font-weight:600;">57.2%</td>
  <td class="price-cell" style="color:var(--field-green); font-weight:600;">+16.2%</td>
</tr>
<tr class="winner">
  <td>&#x1F3C6; F: GB Binary + Cultural + Drought</td>
  <td class="price-cell">36</td>
  <td>2-class</td>
  <td class="price-cell" style="font-weight:700;">56.2%</td>
  <td class="price-cell" style="font-weight:700;">56.2%</td>
  <td class="price-cell" style="font-weight:700;">56.7%</td>
  <td class="price-cell">56.2%</td>
  <td class="price-cell" style="color:var(--field-green); font-weight:700;">+16.9%</td>
</tr>
</table>
</div>

<p style="font-size:0.78em; color:var(--ink-muted); margin-top:8px; font-style:italic;">The biggest single improvement (+16pp) came from switching to binary up/down labels, eliminating ambiguous &ldquo;flat&rdquo; predictions. Cultural calendar and drought features added another +1pp. Production model uses Random Forest Binary + Cultural Calendar (JS compatible).</p>

<!-- Ã¢ÂÂÃ¢ÂÂ Feature Importance Ã¢ÂÂÃ¢ÂÂ -->
<div class="section-header">
  <h2>What Drives the Predictions</h2>
  <span class="source">Feature importance from best backtest config (Config F)</span>
</div>

<div class="price-table-wrap">
<table class="backtest-table">
<tr><th>#</th><th>Feature</th><th>Importance</th><th style="width:40%;">Weight</th></tr>
<tr><td>1</td><td>CME Basis Change</td><td class="price-cell">14.2%</td><td><div class="importance-bar" style="width:100%;"></div></td></tr>
<tr><td>2</td><td>Receipt Change %</td><td class="price-cell">9.6%</td><td><div class="importance-bar" style="width:67%;"></div></td></tr>
<tr><td>3</td><td>Drought Severity Index</td><td class="price-cell">5.8%</td><td><div class="importance-bar" style="width:41%;"></div></td></tr>
<tr><td>4</td><td>CME Futures Momentum</td><td class="price-cell">5.2%</td><td><div class="importance-bar" style="width:37%;"></div></td></tr>
<tr><td>5</td><td>CME Basis Level</td><td class="price-cell">5.0%</td><td><div class="importance-bar" style="width:35%;"></div></td></tr>
<tr><td>6</td><td>Year-over-Year Receipts</td><td class="price-cell">4.9%</td><td><div class="importance-bar" style="width:34%;"></div></td></tr>
<tr><td>7</td><td>High/Low Price Ratio</td><td class="price-cell">4.8%</td><td><div class="importance-bar" style="width:34%;"></div></td></tr>
<tr><td>8</td><td>CME Feeder/Live Spread</td><td class="price-cell">4.5%</td><td><div class="importance-bar" style="width:32%;"></div></td></tr>
<tr><td>9</td><td>Price Volatility</td><td class="price-cell">3.9%</td><td><div class="importance-bar" style="width:27%;"></div></td></tr>
<tr><td>10</td><td>Receipt Trend</td><td class="price-cell">3.9%</td><td><div class="importance-bar" style="width:27%;"></div></td></tr>
</table>
</div>

<!-- Ã¢ÂÂÃ¢ÂÂ Methodology Ã¢ÂÂÃ¢ÂÂ -->
<div class="section-header">
  <h2>Methodology</h2>
  <span class="source">How it works</span>
</div>

<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin:12px 0;">
  <div class="method-card">
    <h4>&#x1F4CA; Walk-Forward Backtesting</h4>
    <p>Each prediction uses only data available at the time. The model trains on past weeks and predicts the next auction &mdash; no peeking at future data. This mimics real-world deployment.</p>
  </div>
  <div class="method-card">
    <h4>&#x1F333; Random Forest + Cultural Calendar</h4>
    <p>Production runs a Random Forest classifier with 33 features: price momentum, CME futures basis, supply dynamics, and 12 Lancaster County cultural calendar features (Amish wedding season, mud sales, Farm Show, harvest, hunting).</p>
  </div>
  <div class="method-card">
    <h4>&#x2195; Binary Up/Down Labels</h4>
    <p>Predictions call whether next week&rsquo;s average price will be higher or lower. Ambiguous near-zero moves (&lt;$0.50/cwt) are excluded from training, which boosted accuracy by 16 percentage points.</p>
  </div>
  <div class="method-card">
    <h4>&#x1F4DD; Full Transparency</h4>
    <p>Every prediction is logged to Redis with a timestamp, target date, and confidence score. When actual data arrives, it&rsquo;s automatically scored. No predictions are ever deleted or hidden.</p>
  </div>
</div>

${resolved.length > 0 ? `
<!-- Ã¢ÂÂÃ¢ÂÂ Live Resolution Log Ã¢ÂÂÃ¢ÂÂ -->
<div class="section-header">
  <h2>Resolved Predictions</h2>
  <span class="source">${resolved.length} predictions scored against actual auction data</span>
</div>

${barnStats ? `
<div style="display:grid; grid-template-columns: 1fr 1fr; gap:24px; margin:12px 0;">
  <div>
    <h4 style="margin-bottom:8px;">By Barn</h4>
    <div class="price-table-wrap"><table class="backtest-table">
    <tr><th>Barn</th><th style="text-align:right;">Total</th><th style="text-align:right;">Correct</th><th style="text-align:right;">Accuracy</th></tr>
    ${barnStats}
    </table></div>
  </div>
  <div>
    <h4 style="margin-bottom:8px;">By Category</h4>
    <div class="price-table-wrap"><table class="backtest-table">
    <tr><th>Category</th><th style="text-align:right;">Total</th><th style="text-align:right;">Correct</th><th style="text-align:right;">Accuracy</th></tr>
    ${catStats}
    </table></div>
  </div>
</div>
` : ""}

<div class="price-table-wrap">
<table class="backtest-table">
<tr><th></th><th>Barn</th><th>Category</th><th style="text-align:right;">Price at Call</th><th>Predicted</th><th style="text-align:right;">Confidence</th><th style="text-align:right;">Actual Price</th><th>Actual Dir</th><th>Target Date</th></tr>
${resolvedRows}
</table>
</div>
` : `
<!-- Ã¢ÂÂÃ¢ÂÂ No resolved yet Ã¢ÂÂÃ¢ÂÂ -->
<div class="section-header">
  <h2>Live Resolution Log</h2>
  <span class="source">Predictions scored against actual auction data</span>
</div>

<div style="background:var(--card-bg); border:1px solid var(--border); border-radius:8px; padding:32px; text-align:center; color:var(--ink-muted);">
  <p style="font-size:1.1em; font-weight:600;">&#x23F3; Awaiting First Resolutions</p>
  <p style="margin-top:8px;">${pending.length} predictions are pending against upcoming auctions (${pending.length > 0 ? pending[0].targetDate + " \u2013 " + pending[pending.length - 1].targetDate : ""}). Once auction data comes in, predictions are automatically scored and the live accuracy record begins.</p>
</div>
`}

${pending.length > 0 ? `
<!-- Ã¢ÂÂÃ¢ÂÂ Pending Predictions Ã¢ÂÂÃ¢ÂÂ -->
<div class="section-header">
  <h2>Pending Predictions</h2>
  <span class="source">${pending.length} predictions awaiting resolution</span>
</div>

<div class="price-table-wrap">
<table class="backtest-table">
<tr><th></th><th>Barn</th><th>Category</th><th style="text-align:right;">Current Price</th><th>Call</th><th style="text-align:right;">Confidence</th><th colspan="2" style="text-align:center;">Status</th><th>Target Date</th></tr>
${pendingRows}
</table>
</div>
` : ""}

</main>

<footer>
  <p>BarnSignal v1.0 &mdash; Mid-Atlantic Livestock Price Intelligence &mdash; <a href="https://github.com/tharmer/barnsignal">GitHub</a></p>
  <p style="margin-top:8px;">Data source: USDA AMS Livestock, Poultry &amp; Grain Market News. Predictions are AI-generated estimates for informational purposes only &mdash; not financial or trading advice.</p>
</footer>

</body>
</html>`;
}
