import "dotenv/config";
import { AgentBuilder } from "@iqai/adk";
import { CoingeckoTool } from "./tools/coingecko-tool.js";
import { EnhancedExaTool, EnhancedExaAnswerTool } from "./tools/exa-tool-advanced.js";
import { stateManager, MarketState, NewsContext } from "./market-state.js";
import { newsService } from "./news-service.js";
import { v4 as uuidv4 } from 'uuid';

class CryptoTraderAgent {
  private sessionId: string;
  private state: MarketState;
  private exaTool?: EnhancedExaTool;
  private exaAnswerTool?: EnhancedExaAnswerTool;

  constructor() {
    this.sessionId = uuidv4();
    this.state = {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      phase: 'data',
      data: {},
      metadata: { requestType: 'market_analysis' }
    };
    
    const exaApiKey = process.env.EXA_API_KEY;
    
    if (exaApiKey) {
      console.log("🧠 Using Enhanced Exa tools with AI synonym generation");
      this.exaTool = new EnhancedExaTool(exaApiKey);
      this.exaAnswerTool = new EnhancedExaAnswerTool(exaApiKey);
      console.log("✅ Enhanced Exa tools with synonym generation enabled");
    } else {
      console.log("⚠️  Enhanced Exa tools disabled - missing API keys");
      console.log(`   EXA_API_KEY: ${exaApiKey ? '✅' : '❌'}`);
    }
  }

  async analyze(request = "Analyze why Bitcoin and Ethereum prices are changing") {
    await stateManager.init();
    this.state.metadata.request = request; // Store user query
    console.log(`🚀 Session ${this.sessionId.slice(0, 8)} - Comprehensive Analysis Starting...\n`);
    
    const analysis = await this.performComprehensiveAnalysis(request);
    this.state.phase = 'complete';
    await stateManager.saveState(this.state);

    return this.generateReport(analysis);
  }

  private async performComprehensiveAnalysis(userQuery: string) {
    console.log("� Performing Comprehensive Cryptocurrency Analysis...\n");
    
    // Get historical context
    const context = await stateManager.getContext(2);
    console.log(`📰 Retrieved ${context.length} news contexts from past 2 days`);
    
    // Get contextual insights
    const contextualInsights = await stateManager.getContextualInsights(
      userQuery,
      this.sessionId,
      this.state.metadata.requestType
    );
    console.log(`📊 Found ${contextualInsights.insights.length} contextual insights (confidence: ${(contextualInsights.confidence * 100).toFixed(1)}%)`);

    // Set up tools - only CoinGecko and Exa
    const tools: any[] = [new CoingeckoTool()];
    if (this.exaTool && this.exaAnswerTool) {
      tools.push(this.exaTool, this.exaAnswerTool);
    }

    // Create the comprehensive analyst
    const comprehensiveAnalyst = await AgentBuilder
      .create("comprehensive_crypto_analyst")
      .withModel("gemini-2.5-pro")
      .withDescription("Expert cryptocurrency analyst with comprehensive analysis capabilities")
      .withInstruction(`You are an expert cryptocurrency analyst capable of performing comprehensive technical, fundamental, and market dynamics analysis.

USER REQUEST: "${userQuery}"

CONTEXTUAL INSIGHTS (Confidence: ${(contextualInsights.confidence * 100).toFixed(1)}%):
${contextualInsights.insights.map((insight, idx) => `${idx + 1}. ${insight}`).join('\n')}

HISTORICAL CONTEXT:
${JSON.stringify(context.slice(0, 3), null, 2)}

COMPREHENSIVE ANALYSIS INSTRUCTIONS:

🔍 **DATA COLLECTION & RESEARCH:**
1. Parse the user query to identify ALL cryptocurrencies mentioned (e.g., DOGE, IQ Token, Bitcoin, Ethereum)
2. Use coingecko tool for current prices, volume, market cap, and trading data for each cryptocurrency
3. Use enhanced_exa_search with AI synonym generation for comprehensive web research:
   - Make ONLY ONE search call that includes ALL cryptocurrencies mentioned in the user query
   - The synonym generator will automatically segment the query into focused searches for each asset
   - Include technical analysis reports and expert opinions
   - Recent news and market developments
   - Institutional activity and sentiment
   - Trading patterns and volume analysis
   - Enable synonyms for broader coverage: enableSynonyms=true, numSynonyms=3
   - CRITICAL: Use a single search query like "Technical analysis for Dogecoin and IQ Token" to get segmented synonyms in ONE inference
4. Use enhanced_exa_answer sparingly for specific follow-up questions only
5. Focus on gathering comprehensive market intelligence efficiently with one targeted search call

📈 **TECHNICAL ANALYSIS:**
- Provide detailed technical analysis including chart patterns, indicators (RSI, MACD), support/resistance levels
- Analyze trading volumes, volatility, and price action
- Identify key technical signals and breakout/breakdown levels
- Set realistic price targets and timeframes

🏛️ **FUNDAMENTAL ANALYSIS:**
- Assess regulatory developments and institutional adoption
- Analyze technology updates, network developments, and utility
- Review macroeconomic factors and market correlations
- Evaluate project fundamentals and ecosystem growth

⚖️ **MARKET DYNAMICS:**
- Examine supply/demand dynamics and market participant behavior
- Analyze liquidity conditions and capital flows
- Review sentiment cycles and market psychology
- Assess correlation patterns with traditional markets

📋 **SYNTHESIS & CONCLUSIONS:**
- Synthesize all findings into clear, actionable insights
- Provide confidence levels for various scenarios
- Identify primary drivers, risks, and opportunities
- Give specific recommendations based on the analysis type requested

IMPORTANT: Use the Enhanced Exa tools with synonym generation (enableSynonyms=true) efficiently. Make ONE search call that mentions all cryptocurrencies, and the AI synonym generator will automatically create separate focused queries for each asset in a SINGLE inference, providing both efficiency and targeted results.`)
      .withTools(...tools)
      .build();

    // Perform the comprehensive analysis
    console.log("🧠 Running comprehensive analysis with enhanced AI tools...");
    const analysis = await comprehensiveAnalyst.runner.ask(userQuery);
    
    // Store the analysis
    this.state.data.analysis = analysis;
    this.state.data.news = context;
    await stateManager.saveState(this.state);

    return analysis;
  }

  private generateReport(analysis: string) {
    return {
      sessionId: this.sessionId,
      timestamp: this.state.timestamp,
      analysis: {
        comprehensive_analysis: analysis,
        context_used: this.state.data.news?.length || 0,
        web_search_enabled: !!this.exaTool,
        enhanced_synonyms: this.exaTool instanceof EnhancedExaTool,
        tools_enabled: {
          enhanced_exa_search: !!this.exaTool,
          enhanced_exa_answer: !!this.exaAnswerTool,
          coingecko: true,
          synonym_generation: !!this.exaTool
        }
      }
    };
  }

  static startNewsService(port = 3001) {
    const server = newsService.listen(port, () => {
      console.log(`News service running on port ${port}`);
    });
    return server;
  }
}

export { CryptoTraderAgent };
