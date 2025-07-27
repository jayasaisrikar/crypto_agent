import { SynonymEnhancedCryptoAgent } from "./crypto-agent-synonym.js";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const agent = new SynonymEnhancedCryptoAgent({
    togetherApiKey: process.env.TOGETHER_API_KEY,
    exaApiKey: process.env.EXA_API_KEY,
    genaiApiKey: process.env.GENAI_API_KEY
  });

  const queries = [
    "Bitcoin price prediction 2024",
    "Ethereum Layer 2 scaling solutions performance",
    "DeFi yield farming risks and rewards"
  ];

  console.log("🚀 Synonym-Enhanced Crypto Analysis Demo\n");

  for (const query of queries) {
    console.log(`🔍 Analyzing: "${query}"`);
    
    try {
      const result = await agent.synonymEnhancedAnalyze(query, {
        enableSynonyms: true,
        enableScraping: true,
        maxSources: 6
      });

      if (result.success) {
        console.log(`✅ Analysis completed in ${result.metadata.timestamp}`);
        console.log(`📊 Model: ${result.metadata.model}`);
        console.log(`🧠 Enhanced Search: ${result.metadata.enhancedSearch}`);
        console.log(`📝 Analysis Preview:`);
        console.log(`   ${(result.analysis || '').substring(0, 300)}...\n`);
      } else {
        console.error(`❌ Analysis failed: ${result.error}\n`);
      }
    } catch (error) {
      console.error(`❌ Error: ${error}\n`);
    }
  }

  console.log("💡 Quick Answer Test:");
  try {
    const answer = await agent.quickAnswer("What is the current market cap of Bitcoin?");
    if (answer.success) {
      console.log(`✅ Answer: ${(answer.answer || '').substring(0, 200)}...`);
    } else {
      console.error(`❌ Answer failed: ${answer.error}`);
    }
  } catch (error) {
    console.error(`❌ Quick answer error: ${error}`);
  }
}

main();
