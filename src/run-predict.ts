// Run manually: npx tsx src/run-predict.ts
import "dotenv/config";
import { generatePredictions, resolvePredictions } from "./predictor.js";

async function main() {
  console.log("🔮 BarnSignal — Generating predictions...\n");

  // First resolve any pending predictions
  await resolvePredictions();

  // Then generate new predictions
  const predictions = await generatePredictions();

  console.log(`\n📊 Summary:`);
  const ups = predictions.filter((p) => p.predictedDirection === "up").length;
  const downs = predictions.filter((p) => p.predictedDirection === "down").length;
  const flats = predictions.filter((p) => p.predictedDirection === "flat").length;
  console.log(`  📈 Up: ${ups} | 📉 Down: ${downs} | ➡️ Flat: ${flats}`);

  const highConf = predictions.filter((p) => p.confidence > 60);
  if (highConf.length > 0) {
    console.log(`\n⚡ High-confidence calls (>60%):`);
    for (const p of highConf) {
      const arrow = p.predictedDirection === "up" ? "📈" : p.predictedDirection === "down" ? "📉" : "➡️";
      console.log(`  ${arrow} ${p.barnName} | ${p.category}: $${p.currentAvgPrice.toFixed(2)} → ${p.predictedDirection} (${p.confidence}%)`);
      console.log(`     Reasoning: ${p.reasoning}`);
    }
  }
}

main().catch(console.error);
