// Run: MARS_API_KEY=xxx npx tsx src/run-backfill.ts
// Backfills historical auction data from the MARS API into Redis
import "dotenv/config";
import { backfillAll } from "./fetcher.js";

async function main() {
  console.log("📜 BarnSignal — Historical Data Backfill\n");

  // Backfill from Jan 2023 through today
  const beginDate = process.argv[2] || "01/01/2023";
  const endDate = process.argv[3] || undefined; // defaults to today

  await backfillAll(beginDate, endDate);
}

main().catch(console.error);
