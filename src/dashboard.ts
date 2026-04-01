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
<title>BarnSignal — Your Signal Before the Sale</title>
<style>
  :root {
    --barn-red: #8B2500;
    --barn-red-light: #A0522D;
    --field-green: #2E5A1E;
    --field-green-light: #4A7C34;
    --wheat: #F5DEB3;
    --wheat-dark: #D2B48C;
    --parchment: #FDF5E6;
    --dark-earth: #3B2F2F;
    --cream: #FFFDD0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    background: var(--parchment);
    color: var(--dark-earth);
  }
  .header {
    background: linear-gradient(135deg, var(--barn-red) 0%, var(--dark-earth) 100%);
    color: var(--wheat);
    padding: 1.5rem 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .header h1 { font-size: 1.8rem; letter-spacing: 1px; }
  .header h1 span { color: var(--wheat-dark); font-weight: normal; font-size: 0.9rem; display: block; }
  .header .date { font-size: 0.9rem; opacity: 0.8; }
  .ticker {
    background: var(--dark-earth);
    color: var(--wheat);
    padding: 0.5rem 0;
    overflow: hidden;
    white-space: nowrap;
    font-family: 'Courier New', monospace;
    font-size: 0.85rem;
  }
  .ticker-inner {
    display: inline-block;
    animation: scroll 40s linear infinite;
  }
  @keyframes scroll {
    0% { transform: translateX(100vw); }
    100% { transform: translateX(-100%); }
  }
  .ticker .up { color: #4CAF50; }
  .ticker .down { color: #f44336; }
  .ticker .flat { color: #FFC107; }
  .container { max-width: 1400px; margin: 0 auto; padding: 1.5rem; }

  /* Stats cards */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  .stat-card {
    background: white;
    border: 1px solid var(--wheat-dark);
    border-radius: 8px;
    padding: 1.2rem;
    text-align: center;
  }
  .stat-card .value {
    font-size: 2rem;
    font-weight: bold;
    color: var(--barn-red);
  }
  .stat-card .label {
    font-size: 0.8rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-top: 0.3rem;
  }
  .stat-card.green .value { color: var(--field-green); }

  /* Section headers */
  .section-header {
    font-size: 1.3rem;
    color: var(--barn-red);
    border-bottom: 2px solid var(--wheat-dark);
    padding-bottom: 0.5rem;
    margin: 1.5rem 0 1rem;
  }

  /* Barn comparison table */
  .barn-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 1.5rem;
    margin-bottom: 1.5rem;
  }
  .barn-card {
    background: white;
    border: 1px solid var(--wheat-dark);
    border-radius: 8px;
    overflow: hidden;
  }
  .barn-card-header {
    background: var(--field-green);
    color: white;
    padding: 0.8rem 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .barn-card-header h3 { font-size: 1rem; }
  .barn-card-header .meta { font-size: 0.8rem; opacity: 0.8; }
  .barn-card-body { padding: 0; }

  /* Price table */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  th {
    background: var(--cream);
    padding: 0.5rem;
    text-align: left;
    font-size: 0.75rem;
    text-transform: uppercase;
    color: #666;
    border-bottom: 1px solid var(--wheat-dark);
  }
  td {
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid #f0e8d8;
  }
  tr:hover { background: var(--cream); }
  .price { font-weight: bold; font-family: 'Courier New', monospace; }
  .change-up { color: #2E7D32; }
  .change-down { color: #C62828; }
  .change-flat { color: #F57F17; }

  /* Predictions section */
  .predictions-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    background: white;
    border: 1px solid var(--wheat-dark);
    border-radius: 8px;
    overflow: hidden;
  }
  .predictions-table th {
    background: var(--barn-red);
    color: white;
    padding: 0.6rem;
  }
  .predictions-table td { padding: 0.5rem 0.6rem; }
  .pred-up { background: #E8F5E9; }
  .pred-down { background: #FFEBEE; }
  .pred-flat { background: #FFF8E1; }
  .confidence-bar {
    display: inline-block;
    height: 8px;
    border-radius: 4px;
    margin-right: 0.5rem;
    vertical-align: middle;
  }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: bold;
  }
  .badge-correct { background: #C8E6C9; color: #2E7D32; }
  .badge-wrong { background: #FFCDD2; color: #C62828; }
  .badge-pending { background: #FFF9C4; color: #F57F17; }

  /* Commentary */
  .commentary {
    background: white;
    border-left: 4px solid var(--field-green);
    padding: 1rem 1.2rem;
    margin: 1rem 0;
    font-style: italic;
    font-size: 0.9rem;
    line-height: 1.6;
    border-radius: 0 8px 8px 0;
  }

  /* Cross-auction comparison */
  .comparison-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    background: white;
    border: 1px solid var(--wheat-dark);
    border-radius: 8px;
    overflow: hidden;
  }
  .comparison-table th {
    background: var(--dark-earth);
    color: var(--wheat);
    padding: 0.6rem;
  }
  .comparison-table td { padding: 0.5rem 0.6rem; }
  .best-price { background: #E8F5E9; font-weight: bold; }

  /* Footer */
  .footer {
    text-align: center;
    padding: 2rem;
    color: #999;
    font-size: 0.8rem;
    border-top: 1px solid var(--wheat-dark);
    margin-top: 2rem;
  }

  /* Mobile */
  @media (max-width: 768px) {
    .barn-grid { grid-template-columns: 1fr; }
    .stats-row { grid-template-columns: repeat(2, 1fr); }
    .header h1 { font-size: 1.3rem; }
    .container { padding: 1rem; }
  }
</style>
</head>
<body>

<div class="header">
  <h1>BarnSignal<span>Your signal before the sale.</span></h1>
  <div class="date">${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
</div>

${renderTicker(activeBarns)}

<div class="container">

${renderStatsCards(activeBarns, stats)}

${activeBarns.length > 0 ? renderMarketCommentary(activeBarns) : ""}

<h2 class="section-header">🏛️ Cross-Auction Price Comparison</h2>
${activeBarns.length >= 2 ? renderCrossAuctionComparison(activeBarns) : "<p>Collecting data from multiple barns... cross-auction comparison will appear after the next auction cycle.</p>"}

<h2 class="section-header">🔮 AI Price Predictions</h2>
${renderPredictions(predictions)}

<h2 class="section-header">📊 Auction Barn Reports</h2>
<div class="barn-grid">
${activeBarns.map((b) => renderBarnCard(b)).join("\n")}
</div>

${activeBarns.length === 0 ? `
<div style="text-align:center; padding:3rem; color:#999;">
  <h3>Waiting for first data fetch...</h3>
  <p>Auction data will appear after the next scheduled fetch (Mon/Tue/Thu evenings).</p>
  <p>Or trigger manually: <code>POST /api/fetch</code></p>
</div>
` : ""}

<h2 class="section-header">🎯 Prediction Accuracy</h2>
${renderAccuracy(stats)}

</div>

<div class="footer">
  BarnSignal v1.0 — Lancaster County Livestock Price Intelligence<br>
  Data source: USDA AMS Livestock, Poultry & Grain Market News<br>
  Predictions are AI-generated estimates, not financial advice.
</div>

</body>
</html>`;
}

function renderTicker(barns: AuctionEntry[]): string {
  if (barns.length === 0) return "";

  const items: string[] = [];
  for (const barn of barns) {
    for (const cat of barn.categories.filter((c) => c.dressing === "Average").slice(0, 5)) {
      const arrow = "→";
      items.push(
        `${barn.barnName} | ${cat.category}: <span class="flat">$${cat.avgPrice.toFixed(2)}/cwt</span> (${cat.head} hd) ${arrow}`
      );
    }
  }

  return `<div class="ticker"><div class="ticker-inner">${items.join("&nbsp;&nbsp;&nbsp;●&nbsp;&nbsp;&nbsp;")}</div></div>`;
}

function renderStatsCards(barns: AuctionEntry[], stats: AccuracyStats): string {
  const totalHead = barns.reduce((sum, b) => sum + b.totalReceipts, 0);
  const totalCategories = barns.reduce((sum, b) => sum + b.categories.length, 0);

  return `
<div class="stats-row">
  <div class="stat-card">
    <div class="value">${barns.length}</div>
    <div class="label">Auction Barns Tracked</div>
  </div>
  <div class="stat-card">
    <div class="value">${totalHead.toLocaleString()}</div>
    <div class="label">Head This Week</div>
  </div>
  <div class="stat-card">
    <div class="value">${totalCategories}</div>
    <div class="label">Price Categories</div>
  </div>
  <div class="stat-card green">
    <div class="value">${stats.totalPredictions > 0 ? stats.accuracy + "%" : "—"}</div>
    <div class="label">AI Prediction Accuracy</div>
  </div>
  <div class="stat-card">
    <div class="value">${stats.totalPredictions}</div>
    <div class="label">Predictions Made</div>
  </div>
</div>`;
}

function renderMarketCommentary(barns: AuctionEntry[]): string {
  const commentaries = barns
    .filter((b) => b.marketCommentary)
    .map(
      (b) =>
        `<div class="commentary"><strong>${b.barnName}</strong> (${b.reportDate}): ${b.marketCommentary}</div>`
    );
  if (commentaries.length === 0) return "";
  return `<h2 class="section-header">📝 Market Commentary</h2>${commentaries.join("\n")}`;
}

function renderCrossAuctionComparison(barns: AuctionEntry[]): string {
  // Find categories that exist in multiple barns
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

  // Only show categories with data from 2+ barns
  const sharedCategories = [...categoryMap.entries()]
    .filter(([_, data]) => data.length >= 2)
    .slice(0, 15);

  if (sharedCategories.length === 0) {
    // Show single-barn data as a preview
    const cats = barns.flatMap((b) =>
      b.categories
        .filter((c) => c.dressing === "Average")
        .slice(0, 8)
        .map((c) => ({ barn: b.barnName, ...c }))
    );

    return `<table class="comparison-table">
<tr><th>Category</th><th>Barn</th><th>Avg Price</th><th>Head</th></tr>
${cats.map((c) => `<tr><td>${c.category}</td><td>${c.barn}</td><td class="price">$${c.avgPrice.toFixed(2)}</td><td>${c.head}</td></tr>`).join("\n")}
</table>
<p style="font-size:0.8rem; color:#999; margin-top:0.5rem;">Full cross-auction comparison unlocks when we have data from multiple barns for the same categories.</p>`;
  }

  const barnNames = [...new Set(barns.map((b) => b.barnName))];

  let rows = "";
  for (const [category, data] of sharedCategories) {
    const prices = data.map((d) => d.avgPrice);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const spread = maxPrice - minPrice;

    rows += `<tr><td>${category}</td>`;
    for (const barnName of barnNames) {
      const barnData = data.find((d) => d.barn === barnName);
      if (barnData) {
        const isBest = barnData.avgPrice === maxPrice && spread > 1;
        rows += `<td class="${isBest ? "best-price" : ""} price">$${barnData.avgPrice.toFixed(2)} <span style="font-size:0.7rem;color:#999">(${barnData.head} hd)</span></td>`;
      } else {
        rows += `<td style="color:#ccc">—</td>`;
      }
    }
    rows += `<td class="price" style="color:${spread > 5 ? "var(--barn-red)" : "#999"}">$${spread.toFixed(2)}</td></tr>`;
  }

  return `<table class="comparison-table">
<tr><th>Category</th>${barnNames.map((n) => `<th>${n}</th>`).join("")}<th>Spread</th></tr>
${rows}
</table>
<p style="font-size:0.8rem; color:#999; margin-top:0.5rem;">💡 Green highlight = highest price at that barn. Spread shows the price gap between barns — larger spreads may indicate arbitrage opportunity factoring in trucking costs.</p>`;
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
  <div class="barn-card-body">
    <table>
      <tr><th>Category</th><th>Head</th><th>Wt Range</th><th>Avg Price</th></tr>
      ${topCategories
        .map(
          (c) =>
            `<tr><td>${c.category}</td><td>${c.head}</td><td>${c.wtRange} lbs</td><td class="price">$${c.avgPrice.toFixed(2)}/cwt</td></tr>`
        )
        .join("\n")}
    </table>
  </div>
</div>`;
}

function renderPredictions(predictions: Prediction[]): string {
  if (predictions.length === 0) {
    return `<p>No predictions yet. Predictions will be generated after the first data fetch.</p>`;
  }

  const rows = predictions.slice(0, 30).map((p) => {
    const dirClass = p.predictedDirection === "up" ? "pred-up" : p.predictedDirection === "down" ? "pred-down" : "pred-flat";
    const arrow = p.predictedDirection === "up" ? "📈" : p.predictedDirection === "down" ? "📉" : "➡️";
    const confColor = p.confidence > 60 ? "#2E7D32" : p.confidence > 40 ? "#F57F17" : "#999";

    let statusBadge;
    if (!p.resolved) {
      statusBadge = `<span class="badge badge-pending">Pending</span>`;
    } else if (p.correct) {
      statusBadge = `<span class="badge badge-correct">✓ Correct</span>`;
    } else {
      statusBadge = `<span class="badge badge-wrong">✗ Wrong</span>`;
    }

    const actualCol = p.resolved
      ? `$${p.actualAvgPrice?.toFixed(2)} (${p.actualDirection})`
      : "—";

    return `<tr class="${dirClass}">
      <td>${p.barnName}</td>
      <td>${p.category}</td>
      <td class="price">$${p.currentAvgPrice.toFixed(2)}</td>
      <td>${arrow} ${p.predictedDirection}</td>
      <td><span class="confidence-bar" style="width:${p.confidence}px; background:${confColor}"></span>${p.confidence}%</td>
      <td>${p.targetDate}</td>
      <td>${actualCol}</td>
      <td>${statusBadge}</td>
    </tr>`;
  });

  return `<table class="predictions-table">
<tr><th>Barn</th><th>Category</th><th>Current</th><th>Call</th><th>Confidence</th><th>Target Date</th><th>Actual</th><th>Status</th></tr>
${rows.join("\n")}
</table>`;
}

function renderAccuracy(stats: AccuracyStats): string {
  if (stats.totalPredictions === 0) {
    return `<p>Accuracy tracking will begin once predictions are resolved against actual auction data. This typically takes 1-2 auction cycles.</p>`;
  }

  const catRows = Object.entries(stats.byCategory)
    .sort((a, b) => b[1].total - a[1].total)
    .map(
      ([cat, s]) =>
        `<tr><td>${cat}</td><td>${s.total}</td><td>${s.correct}</td><td class="price">${s.accuracy}%</td></tr>`
    )
    .join("\n");

  const barnRows = Object.entries(stats.byBarn)
    .map(
      ([barn, s]) =>
        `<tr><td>${barn}</td><td>${s.total}</td><td>${s.correct}</td><td class="price">${s.accuracy}%</td></tr>`
    )
    .join("\n");

  return `
<div class="stats-row">
  <div class="stat-card green">
    <div class="value">${stats.accuracy}%</div>
    <div class="label">Overall Accuracy</div>
  </div>
  <div class="stat-card">
    <div class="value">${stats.resolved}/${stats.totalPredictions}</div>
    <div class="label">Resolved / Total</div>
  </div>
  <div class="stat-card green">
    <div class="value">${stats.correct}</div>
    <div class="label">Correct Predictions</div>
  </div>
</div>

${catRows ? `
<h3 style="margin: 1rem 0 0.5rem; color: var(--barn-red);">By Category</h3>
<table class="comparison-table">
<tr><th>Category</th><th>Predictions</th><th>Correct</th><th>Accuracy</th></tr>
${catRows}
</table>` : ""}

${barnRows ? `
<h3 style="margin: 1rem 0 0.5rem; color: var(--barn-red);">By Barn</h3>
<table class="comparison-table">
<tr><th>Barn</th><th>Predictions</th><th>Correct</th><th>Accuracy</th></tr>
${barnRows}
</table>` : ""}
`;
}
