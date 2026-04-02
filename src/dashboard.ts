// BarnSignal — Dashboard HTML Generator

import { BARNS } from "./config.js";
import {
  getLatestAuction,
  getAllPredictions,
  getAccuracyStats,
  type AuctionEntry,
  type Prediction,
  type AccuracyStats,
} from "./redis.js";

export async function renderDashboard(): Promise<string> {
  // Fetch all data
  const barnData: (AuctionEntry | null)[] = [];
  for (const barn of BARNS) {
    barnData.push(await getLatestAuction(barn.reportId));
  }

  const predictions = await getAllPredictions(50);
  const stats = await getAccuracyStats();

  // Active barns with data
  const activeBarns = barnData.filter(Boolean) as AuctionEntry[];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BarnSignal — Mid-Atlantic Livestock Price Intelligence</title>
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
    padding: 20px 24px 0;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
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
  .header-nav {
    max-width: 1200px;
    margin: 0 auto;
    padding: 16px 24px 0;
    display: flex;
    gap: 0;
  }
  .header-nav a {
    color: #a09880;
    text-decoration: none;
    padding: 10px 20px;
    font-size: 0.88em;
    font-weight: 500;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
  }
  .header-nav a:hover { color: var(--parchment); border-bottom-color: var(--wheat); }
  .header-nav a.active { color: var(--parchment); border-bottom-color: var(--wheat); }

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
    animation: ticker-scroll 200s linear infinite;
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
  <nav class="header-nav">
    <a href="#" class="active">Dashboard</a>
    <a href="#">Livestock</a>
    <a href="#">AI Signals</a>
    <a href="#">Accuracy</a>
  </nav>
</header>

${renderTicker(activeBarns)}

<section class="hero">
  <div class="hero-inner">
    <div class="hero-text">
      <h2>Know before you go &mdash; compare barns, spot trends, and time your buy.</h2>
      <p>BarnSignal tracks real-time livestock auction prices from USDA-reported sales across Pennsylvania, Maryland, Virginia, West Virginia, and New York. Cross-auction comparison, AI-powered price predictions, and weekly trend analysis &mdash; all in one place.</p>
      <p class="audience">Built for livestock buyers, meat distributors, auction regulars, and ag professionals.</p>
    </div>
    <div class="hero-cta">
      <div class="cta-box">
        <div class="cta-label">Get Daily Price Alerts</div>
        <input type="email" placeholder="your@email.com" id="cta-email" />
        <button class="cta-btn" onclick="alert('Coming soon &mdash; BarnSignal alerts launch next month.')">Sign Up Free</button>
        <div class="cta-note">No spam. Auction-day alerts only.</div>
      </div>
    </div>
  </div>
</section>

<div class="container">

${renderAlertBanner(activeBarns)}

${renderStatsCards(activeBarns, stats)}

${activeBarns.length > 0 ? renderMarketCommentary(activeBarns) : ""}

<div class="section-header">
  <h2>Cross-Auction Price Comparison</h2>
  <span class="source">Data: USDA AMS Market News</span>
</div>
${activeBarns.length >= 2 ? renderCrossAuctionComparison(activeBarns) : "<p>Collecting data from multiple barns... cross-auction comparison will appear after the next auction cycle.</p>"}

<div class="section-header">
  <h2>AI Price Predictions</h2>
  <span class="source">Rule-based signal engine</span>
</div>
${renderPredictions(predictions)}

<div class="section-header">
  <h2>Auction Barn Reports</h2>
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
      Predictions are AI-generated estimates, not financial advice.
    </div>
  </div>
</footer>

</body>
</html>`;
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
<p style="font-size:0.78em; color:var(--ink-muted); margin-top:8px; font-style:italic;">Green highlight = highest price at that barn. Spread shows the price gap between barns \u2014 larger spreads may indicate arbitrage opportunity factoring in trucking costs.</p>`;
}

function renderBarnCard(barn: AuctionEntry): string {
  const topCategories = barn.categories
    .filter((c) => c.dressing === "Average")
    .slice(0, 12);

  return `
<div class="barn-card">
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
