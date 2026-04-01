// Run manually: npx tsx src/run-fetch.ts
import "dotenv/config";
import { fetchAllBarns } from "./fetcher.js";

async function main() {
  console.log("🐄 BarnSignal — Fetching auction data...\n");
  const entries = await fetchAllBarns();
  console.log(`\n🏁 Done. Fetched ${entries.length} barns.`);

  for (const e of entries) {
    console.log(`  ${e.barnName}: ${e.reportDate} | ${e.totalReceipts} head | ${e.categories.length} categories`);
  }
}

main().catch(console.error);
