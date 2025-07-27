import "dotenv/config";
import { CryptoTraderAgent } from "./crypto-agent.js";
import { processCryptoQuery } from "./exaTool.js";
import { checkQdrantHealth, printQdrantStatus } from "./utils/qdrant-health.js";
import * as fs from "fs/promises";
import * as path from "path";

async function exportReport(report: any, format: 'json' | 'md' = 'json'): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportsDir = path.join(process.cwd(), 'reports');
  await fs.mkdir(reportsDir, { recursive: true });
  
  const filename = `crypto-analysis-${timestamp}.${format}`;
  const filepath = path.join(reportsDir, filename);
  
  if (format === 'json') {
    await fs.writeFile(filepath, JSON.stringify(report, null, 2), 'utf-8');
  } else {
    const markdown = `# Cryptocurrency Comprehensive Analysis Report

## Session Information
- **Original Query**: ${report.originalQuery}
- **Timestamp**: ${report.timestamp}
- **Synonyms Generated**: ${report.synonymGeneration?.synonymsUsed?.length || 0}
- **Total Search Queries**: ${report.synonymGeneration?.totalQueries || 1}
- **Results Found**: ${report.searchResults?.totalResults || 0}
- **Content Scraped**: ${report.searchResults?.scrapedCount || 0} sources
- **Relevant Content**: ${report.searchResults?.relevantCount || 0} sources
- **Processing Time**: ${report.processingTime}ms
- **Search Cost**: $${report.cost?.toFixed(4) || '0.0000'}

## Synonym Queries Used
${report.synonymGeneration?.synonymsUsed?.map((synonym: string, index: number) => `${index + 1}. ${synonym}`).join('\n') || 'No synonyms generated'}

## Key Insights
${report.insights?.keyInsights?.length > 0 ? report.insights.keyInsights.map((insight: string) => `• ${insight}`).join('\n') : '• No specific insights extracted'}

## Content Summary
${report.insights?.contentSummary || 'No content summary available'}

## Enhanced Analysis Prompt
${report.insights?.perfectPrompt || 'No enhanced prompt available'}

## 🤖 COMPREHENSIVE TECHNICAL ANALYSIS (Gemini 2.0 Flash)
${report.finalAnalysis?.comprehensive_analysis || 'Final analysis not available'}

**Analysis Metrics:**
- Processing Time: ${report.finalAnalysis?.processingTime || 0}ms
- Tokens Used: ~${report.finalAnalysis?.tokensUsed || 0} (estimated)

---
*Generated at ${new Date().toLocaleString()}*
`;
    await fs.writeFile(filepath, markdown, 'utf-8');
  }
  
  return filepath;
}

async function main() {
  console.log("🚀 Starting Cryptocurrency Price Movement Analysis Agent...\n");
  
  console.log("🔍 Checking Qdrant vector database status...");
  const qdrantHealth = await checkQdrantHealth();
  printQdrantStatus(qdrantHealth);
  
  if (qdrantHealth.available) {
    console.log("🎯 Vector embeddings will enhance price analysis");
  } else {
    console.log("📝 Using traditional analysis (price analysis will still work)");
  }
  
  console.log("");
  
  const newsServer = CryptoTraderAgent.startNewsService(3001);
  console.log("📰 News service starting on http://localhost:3001\n");
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  try {
    // Use the new Main Crypto Agent flow
    const userQuery = "I want Technical Analysis for Doge Coin and IQ Token";
    console.log(`🔍 Processing query with Main Crypto Agent: "${userQuery}"\n`);
    
    const exaApiKey = process.env.EXA_API_KEY;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;
    
    if (!exaApiKey || !openaiApiKey || !geminiApiKey) {
      throw new Error("Missing required API keys: EXA_API_KEY, OPENAI_API_KEY, and GEMINI_API_KEY must be set in environment");
    }
    
    const report = await processCryptoQuery(userQuery, exaApiKey, openaiApiKey, geminiApiKey);
    
    if (!report.success) {
      throw new Error(`Analysis failed: ${report.error}`);
    }
    
    const jsonPath = await exportReport(report, 'json');
    const mdPath = await exportReport(report, 'md');
    console.log(`📄 Reports exported: ${jsonPath}, ${mdPath}`);
    
    console.log("\n" + "=".repeat(70));
    console.log("📊 CRYPTOCURRENCY PRICE MOVEMENT ANALYSIS REPORT");
    console.log("=".repeat(70));
    console.log(`Original Query: ${report.originalQuery}`);
    console.log(`Analysis Timestamp: ${report.timestamp}`);
    console.log(`Synonyms Generated: ${report.synonymGeneration.synonymsUsed.length}`);
    console.log(`Total Search Queries: ${report.synonymGeneration.totalQueries}`);
    console.log(`Results Found: ${report.searchResults.totalResults}`);
    console.log(`Content Scraped: ${report.searchResults.scrapedCount} sources`);
    console.log(`Relevant Content: ${report.searchResults.relevantCount} sources`);
    
    console.log("\n🔍 SYNONYM QUERIES USED:");
    console.log("-".repeat(40));
    report.synonymGeneration.synonymsUsed.forEach((synonym: string, index: number) => {
      console.log(`${index + 1}. ${synonym}`);
    });
    
    console.log("\n📊 KEY INSIGHTS:");
    console.log("-".repeat(40));
    if (report.insights.keyInsights.length > 0) {
      report.insights.keyInsights.forEach((insight: string) => {
        console.log(`• ${insight}`);
      });
    } else {
      console.log("• No specific insights extracted from sources");
    }
    
    console.log("\n📈 CONTENT SUMMARY:");
    console.log("-".repeat(40));
    console.log(report.insights.contentSummary || "No content summary available");
    
    console.log("\n🎯 PERFECT PROMPT FOR ANALYSIS:");
    console.log("-".repeat(40));
    if (report.insights.perfectPrompt) {
      console.log(report.insights.perfectPrompt.substring(0, 500) + "...");
      console.log("[Full prompt available in exported reports]");
    }
    
    console.log("\n🤖 COMPREHENSIVE TECHNICAL ANALYSIS (Gemini 2.0 Flash):");
    console.log("-".repeat(40));
    if (report.finalAnalysis?.comprehensive_analysis) {
      console.log(report.finalAnalysis.comprehensive_analysis);
      console.log(`\n📊 Analysis generated in ${report.finalAnalysis.processingTime}ms using ~${report.finalAnalysis.tokensUsed} tokens`);
    } else {
      console.log("❌ Final analysis not available");
    }
    
    console.log("\n📊 SYSTEM STATUS:");
    console.log("-".repeat(40));
    console.log("✅ Main Crypto Agent with AI synonyms active");
    console.log("✅ GPT-4o synonym generation enabled");
    console.log("✅ Enhanced Exa search with content scraping");
    console.log("✅ Gemini 2.0 Flash comprehensive analysis generated");
    console.log("✅ Multi-query comprehensive analysis completed");
    console.log(`${qdrantHealth.available ? '✅' : '⚠️'} Qdrant embeddings: ${qdrantHealth.available ? 'Available' : 'Fallback mode'}`);
    console.log(`✅ Processing time: ${report.processingTime}ms`);
    console.log(`✅ Search cost: $${report.cost.toFixed(4)}`);
    console.log(`✅ Analysis tokens: ${report.finalAnalysis?.tokensUsed || 0}`);
    
    console.log("\n🔧 SERVICES:");
    console.log("-".repeat(40));
    console.log("📰 News API: http://localhost:3001");
    console.log("📝 Add news: curl -X POST http://localhost:3001/api/news -H 'Content-Type: application/json' -d '{\"url\":\"https://crypto-news-url\"}'");
    console.log("📊 Get context: curl http://localhost:3001/api/context");
    
    if (!qdrantHealth.available) {
      console.log("\n🐳 To enable vector embeddings:");
      console.log("  powershell .\\setup-qdrant-simple.ps1");
    }
    
    console.log("\n🎉 Main Crypto Agent analysis complete! News service will continue running...");
    console.log("Press Ctrl+C to stop all services.");
    
  } catch (error) {
    console.error("❌ Analysis failed:", error);
    process.exit(1);
  }
}

// Suppress jsdom CSS parse errors
const originalConsoleError = console.error;
console.error = function (...args) {
  if (
    typeof args[0] === "string" &&
    args[0].includes("Could not parse CSS stylesheet")
  ) {
    // Ignore jsdom CSS parse errors
    return;
  }
  originalConsoleError.apply(console, args);
};

main().catch(console.error);