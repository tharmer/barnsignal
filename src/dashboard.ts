// BarnSignal — Dashboard HTML Generator

import { BARNS, REGIONS } from "./config.js";
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
  const stats = await getAccuracyStats();

  // Active barns with data
  const activeBarns = barnData.filter(Boolean) as AuctionEntry[];
  const regionLabel = selectedRegion ? selectedRegion.name : "All Regions";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BarnSignal — Mid-Atlantic Livestock Auction Prices &amp; Trends</title>
<meta name="description" content="Compare livestock auction prices across Pennsylvania, Maryland, Virginia, West Virginia, and New York. Real-time USDA data from 12 auction barns, AI price predictions, and cross-auction comparison.">
<meta name="keywords" content="livestock auction prices, cattle prices, New Holland auction, Lancaster County livestock, USDA market news, feeder cattle prices, slaughter cattle, auction barn prices, mid-Atlantic livestock">
<meta property="og:title" content="BarnSignal — Know Before You Go">
<meta property="og:description" content="Cross-auction livestock price comparison from 12 USDA-reported barns across PA, MD, VA, WV, and NY. Free price alerts and AI predictions.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://barnsignal.com">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="BarnSignal — Mid-Atlantic Livestock Prices">
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

  /* ── Header ── */
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
  /* ── Ticker ── */
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

  /* ── Region Filter ── */
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

  /* ── Container ── */
  .container { max-width: 1200px; margin: 0 auto; padding: 24px; }

  /* ── Hero ── */
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

  /* ── Alert Banner ── */
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

  /* ── Section Headers ── */
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

  /* ── Stats Grid ── */
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

  /* ── Price Tables ── */
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

  /* ── Badges ── */
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

  /* ── Insight Cards ── */
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

  /* ── Commentary ── */
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

  /* ── Barn Cards ── */
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

  /* ── Predictions Table ── */
  .pred-up { background: #f0f7ee; }
  .pred-down { background: #fdf2ef; }
  .pred-flat { background: #f5f2e8; }

  /* ── Best Price ── */
  .best-price { background: #e8f5e3; font-weight: 600; }

  /* ── Net Price Calculator ── */
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

  /* ── Footer ── */
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

  /* ── Responsive ── */
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
      <div><span class="live-dot"></span> Live data from ${BARNS.length} USDA-reported auction barns</div>
      <div style="margin-top:4px;">${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
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
  <span class="source">Rule-based signal engine</span>
</div>
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

function renderPredictions(predictions: Prediction[]): string {
  if (predictions.length === 0) {
    const startDate = new Date("2026-04-06");
    const estDate = startDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    return `<div class="insight-card" style="color:var(--ink-muted);">
  <div class="insight-type trend" style="justify-content:center;">&#x1F9E0; AI Signal Engine &mdash; Calibrating</div>
  <h3 style="text-align:center;">First predictions drop ~${estDate}</h3>
  <p style="text-align:center;">BarnSignal's prediction engine analyzes momentum, 3-week price trends, supply volume, and seasonal factors across ${BARNS.length} auction barns. It needs at least two weeks of historical data to generate confident signals.</p>
  <p style="text-align:center; margin-top:10px; font-size:0.85em;"><strong style="color:var(--ink);">What you'll see here:</strong> Up/down/flat calls for every tracked cattle category, confidence scores, and a running accuracy record so you can see exactly how the model performs.</p>
</div>`;
  }

  const rows = predictions.slice(0, 30).map((p) => {
    const dirClass = p.predictedDirection === "up" ? "pred-up" : p.predictedDirection === "down" ? "pred-down" : "pred-flat";
    const arrow = p.predictedDirection === "up" ? "\u2191" : p.predictedDirection === "down" ? "\u2193" : "\u2192";
    const trendClass = p.predictedDirection === "up" ? "trend-up" : p.predictedDirection === "down" ? "trend-down" : "trend-neutral";
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
