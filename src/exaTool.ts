import { BaseTool, ToolContext } from "@iqai/adk";
import { Type } from "@google/genai";
import { Exa } from "exa-js";
import { UniversalScraper, ContentCleaner, ScrapedContent } from "./services/scraper.js";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

interface SynonymResponse {
  isValidCryptoQuery: boolean;
  synonyms: string[];
  originalQuery: string;
  processingTime: number;
}

export class MainCryptoAgent extends BaseTool {
  private exa: Exa;
  private scraper: UniversalScraper;
  private openai: OpenAI;
  private gemini: GoogleGenerativeAI;

  constructor(exaApiKey: string, openaiApiKey: string, geminiApiKey: string) {
    super({
      name: "main_crypto_agent",
      description: "Main cryptocurrency analysis agent with AI synonym generation and enhanced web search"
    });
    this.exa = new Exa(exaApiKey);
    this.scraper = new UniversalScraper({ timeout: 12000, maxContentLength: 8000, includeImages: false });
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.gemini = new GoogleGenerativeAI(geminiApiKey);
  }

  getDeclaration() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: Type.OBJECT,
        properties: {
          userQuery: { type: Type.STRING, description: "User's cryptocurrency question or query" },
          numResults: { type: Type.NUMBER, description: "Results per query (1-10, default: 2)" },
          includeDomains: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Domains to include" },
          dateFilter: { type: Type.STRING, description: "Date filter: 'past24h', 'pastWeek', 'pastMonth', 'pastYear'" },
          maxScrape: { type: Type.NUMBER, description: "Max URLs to scrape (1-15, default: 8)" },
          deduplication: { type: Type.BOOLEAN, description: "Remove duplicate URLs (default: true)" }
        },
        required: ["userQuery"]
      }
    };
  }

  async runAsync(args: {
    userQuery: string;
    numResults?: number;
    includeDomains?: string[];
    dateFilter?: string;
    maxScrape?: number;
    deduplication?: boolean;
  }, context: ToolContext) {
    try {
      const { 
        userQuery, 
        numResults = 2, 
        includeDomains, 
        dateFilter, 
        maxScrape = 8, 
        deduplication = true
      } = args;

      console.log(`🚀 Main Crypto Agent processing: "${userQuery}"`);
      
      const startTime = Date.now();

      // Step 1: Generate synonyms using GPT-4o
      console.log("🔍 Generating AI-powered synonym queries...");
      const synonymResponse = await this.generateCryptoSynonyms(userQuery);

      if (!synonymResponse.isValidCryptoQuery) {
        return {
          success: false,
          error: "Sorry, please ask about crypto-related insights.",
          originalQuery: userQuery,
          processingTime: Date.now() - startTime
        };
      }

      console.log(`✅ Generated ${synonymResponse.synonyms.length} synonym queries`);
      console.log("📝 Search queries:", [userQuery, ...synonymResponse.synonyms]);

      // Step 2: Execute enhanced Exa searches
      const searchQueries = [userQuery, ...synonymResponse.synonyms];
      const searchResults = await this.executeEnhancedSearch(searchQueries, {
        numResults,
        includeDomains,
        dateFilter,
        maxScrape,
        deduplication
      });

      // Step 3: Generate final comprehensive analysis using LLM
      console.log("🧠 Generating final comprehensive analysis with Gemini 2.0 Flash...");
      const finalAnalysis = await this.generateFinalAnalysis(searchResults.perfectPrompt, userQuery);

      // Step 4: Process and return comprehensive results
      const totalProcessingTime = Date.now() - startTime;

      return {
        success: true,
        originalQuery: userQuery,
        synonymGeneration: {
          synonymsUsed: synonymResponse.synonyms,
          processingTime: synonymResponse.processingTime,
          totalQueries: searchQueries.length
        },
        searchResults: {
          totalResults: searchResults.allResults.length,
          results: searchResults.enhancedResults,
          searchBreakdown: searchResults.searchBreakdown,
          scrapedCount: searchResults.scrapedCount,
          relevantCount: searchResults.relevantCount
        },
        insights: {
          keyInsights: searchResults.keyInsights,
          contentSummary: searchResults.contentSummary,
          perfectPrompt: searchResults.perfectPrompt
        },
        finalAnalysis: {
          comprehensive_analysis: finalAnalysis.analysis,
          processingTime: finalAnalysis.processingTime,
          tokensUsed: finalAnalysis.tokensUsed
        },
        cost: searchResults.totalCost,
        processingTime: totalProcessingTime,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error("❌ Main Crypto Agent error:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        originalQuery: args.userQuery,
        processingTime: Date.now() - Date.now()
      };
    }
  }

  private async generateFinalAnalysis(perfectPrompt: string, originalQuery: string): Promise<{
    analysis: string;
    processingTime: number;
    tokensUsed: number;
  }> {
    const startTime = Date.now();
    
    try {
      const model = this.gemini.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      
      const systemPrompt = `You are an expert cryptocurrency analyst. Analyze the provided research data and generate a comprehensive technical analysis report. Focus on current market conditions, price trends, technical indicators, and actionable insights. Be specific and reference the sources provided.

Original Query: ${originalQuery}

Please provide:
1. **Current Market Overview** - What's happening now with the requested cryptocurrencies
2. **Technical Analysis** - Key technical indicators, support/resistance levels, chart patterns
3. **Fundamental Factors** - News, events, and market drivers affecting prices
4. **Risk Assessment** - Potential risks and opportunities
5. **Actionable Insights** - Specific recommendations with reasoning

Make sure to reference the sources provided and be as specific as possible with data points, percentages, and timeframes.`;

      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: `${systemPrompt}\n\n---\n\n${perfectPrompt}` }]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2000,
        }
      });

      const analysis = result.response.text() || "Analysis generation failed";
      
      // Gemini doesn't provide usage stats in the same way, so we'll estimate
      const tokensUsed = Math.ceil(analysis.length / 3); // Rough estimate: ~3 chars per token

      return {
        analysis,
        processingTime: Date.now() - startTime,
        tokensUsed
      };

    } catch (error) {
      console.error("❌ Final analysis generation error:", error);
      return {
        analysis: `Analysis generation failed: ${error instanceof Error ? error.message : String(error)}`,
        processingTime: Date.now() - startTime,
        tokensUsed: 0
      };
    }
  }

  private async generateCryptoSynonyms(userQuery: string): Promise<SynonymResponse> {
    const startTime = Date.now();
    const currentDate = new Date().toLocaleDateString('en-US', { 
      month: 'long', 
      year: 'numeric' 
    });

    const systemPrompt = `You are a helpful assistant specialized in cryptocurrency insights. Your task is to generate up to 5 synonym search queries based on the user's question, but only if the question is related to cryptocurrencies like Bitcoin, Ethereum, or any crypto tickers (such as BTC, ETH, SOL, etc.). These synonym queries should be simple rephrased versions of the main question, designed to help with web searches for current crypto price analysis or factors.

Today's date is ${currentDate}. Use today's date, month or Year if the question requires the latest events and news.

Here are 3 examples of how to respond:

Example 1:
User question: Analyze why Bitcoin and Ethereum prices are changing and what factors are driving current movements

Response:
1. Bitcoin price change ${currentDate}
2. Ethereum price change ${currentDate}
3. factors driving Bitcoin price ${currentDate}
4. factors driving Ethereum price ${currentDate}

Example 2:
User question: What's the latest on Solana's market trends and predictions for next month?

Response:
1. Solana market trends ${currentDate}
2. Solana price predictions August 2025
3. factors affecting Solana price ${currentDate}
4. Solana crypto news ${currentDate}
5. Give solana events in ${currentDate}

Example 3:
User question: Tell me about the weather today.
Response:
Sorry, please ask about crypto-related insights.

# INSTRUCTIONS :
- First, check if the user's question is about cryptocurrencies, prices, factors, trends, or any crypto-related topic. If it's not (for example, if it's about stocks, weather, or non-crypto things), reply only with: "Sorry, please ask about crypto-related insights."

- If it is crypto-related, generate 1 to 5 synonym search queries. Make them short and useful for searching the web. Include the current month and year if the question is about recent or current price changes or movements.

- Number the synonyms starting from 1., like this:
 1. Synonym query 1
 2. Synonym query two
And so on, up to 5 if needed. Do not generate more than 5.

- Do not add any extra explanations or text outside the numbered list or the sorry message.

- I want the response in JSON format like below. Just for format example so I can parse directly. Don't be lazy I'm trying to work fast.

{
"1": "SYNONYM QUERY",
"2": "SYNONYM QUERY", 
"3": "SYNONYM QUERY",
"4": "SYNONYM QUERY"
}

Finally User question you need to find synonyms are: ${userQuery}`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userQuery }
        ],
        temperature: 0.3,
        max_tokens: 500
      });

      const response = completion.choices[0]?.message?.content || "";
      
      // Check if it's a rejection message
      if (response.includes("Sorry, please ask about crypto-related insights")) {
        return {
          isValidCryptoQuery: false,
          synonyms: [],
          originalQuery: userQuery,
          processingTime: Date.now() - startTime
        };
      }

      // Parse JSON response
      let synonyms: string[] = [];
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonData = JSON.parse(jsonMatch[0]);
          synonyms = Object.values(jsonData).filter(value => typeof value === 'string') as string[];
        } else {
          // Fallback: parse numbered list
          const lines = response.split('\n').filter(line => line.trim().match(/^\d+\./));
          synonyms = lines.map(line => line.replace(/^\d+\.\s*/, '').trim()).filter(s => s.length > 0);
        }
      } catch (parseError) {
        console.warn("⚠️ JSON parsing failed, using fallback parsing");
        const lines = response.split('\n').filter(line => line.trim().match(/^\d+\./));
        synonyms = lines.map(line => line.replace(/^\d+\.\s*/, '').trim()).filter(s => s.length > 0);
      }

      return {
        isValidCryptoQuery: true,
        synonyms: synonyms.slice(0, 5), // Ensure max 5 synonyms
        originalQuery: userQuery,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      console.error("❌ Synonym generation error:", error);
      throw new Error(`Synonym generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async executeEnhancedSearch(searchQueries: string[], options: {
    numResults: number;
    includeDomains?: string[];
    dateFilter?: string;
    maxScrape: number;
    deduplication: boolean;
  }) {
    const { numResults, includeDomains, dateFilter, maxScrape, deduplication } = options;

    // Setup search options
    const searchOptions: any = {
      type: "auto",
      numResults: Math.min(Math.max(numResults, 1), 10),
      text: false,
      summary: true
    };

    if (includeDomains?.length) searchOptions.includeDomains = includeDomains;
    if (dateFilter) searchOptions.startPublishedDate = this.getDateFilter(dateFilter);

    // Execute parallel searches
    console.log("🔍 Executing enhanced Exa searches...");
    const searchPromises = searchQueries.map(async (searchQuery, index) => {
      try {
        const result = await this.exa.searchAndContents(searchQuery, searchOptions);
        return {
          query: searchQuery,
          isOriginal: index === 0,
          success: true,
          results: result.results.map((item: any) => ({
            title: item.title,
            url: item.url,
            summary: item.summary,
            score: item.score,
            searchQuery: searchQuery
          })),
          cost: result.costDollars?.total || 0
        };
      } catch (error) {
        return {
          query: searchQuery,
          isOriginal: index === 0,
          success: false,
          results: [],
          error: error instanceof Error ? error.message : String(error),
          cost: 0
        };
      }
    });

    const searchResults = await Promise.all(searchPromises);
    const successfulSearches = searchResults.filter(r => r.success);
    
    let allResults: any[] = [];
    let totalCost = 0;

    for (const searchResult of successfulSearches) {
      allResults.push(...searchResult.results);
      totalCost += searchResult.cost;
    }

    // Deduplication
    if (deduplication) {
      const urlSet = new Set();
      const uniqueResults = [];
      for (const result of allResults) {
        if (!urlSet.has(result.url)) {
          urlSet.add(result.url);
          uniqueResults.push(result);
        }
      }
      allResults = uniqueResults;
    }

    // Sort by relevance score
    allResults.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Content scraping
    console.log("📄 Scraping content from top results...");
    const urlsToScrape = allResults.slice(0, Math.min(maxScrape, allResults.length)).map(item => item.url);
    
    let scrapedContents: ScrapedContent[] = [];
    let scrapedCount = 0;
    let relevantCount = 0;

    try {
      scrapedContents = await this.scraper.scrapeMultiple(urlsToScrape);
      scrapedCount = scrapedContents.length;
      
      const relevantContents = ContentCleaner.filterByRelevance(scrapedContents, 0.15);
      relevantCount = relevantContents.length;

      const enhancedResults = allResults.map(basicResult => {
        const scrapedContent = scrapedContents.find(sc => sc.url === basicResult.url);
        if (scrapedContent) {
          return {
            ...basicResult,
            scraped: true,
            fullContent: scrapedContent.cleanedContent,
            metadata: scrapedContent.metadata,
            tags: scrapedContent.tags,
            promptReady: ContentCleaner.cleanForPrompt(scrapedContent)
          };
        }
        return { ...basicResult, scraped: false, fullContent: basicResult.summary };
      });

      const keyInsights = ContentCleaner.extractKeyInsights(relevantContents);
      const contentSummary = ContentCleaner.summarizeForContext(relevantContents);
      const perfectPrompt = this.createEnhancedPrompt(searchQueries[0], searchQueries.slice(1), relevantContents, keyInsights, searchResults);

      return {
        allResults,
        enhancedResults,
        searchBreakdown: searchResults,
        scrapedCount,
        relevantCount,
        keyInsights,
        contentSummary,
        perfectPrompt,
        totalCost
      };

    } catch (scrapingError) {
      console.warn("⚠️ Content scraping failed:", scrapingError);
      return {
        allResults,
        enhancedResults: allResults,
        searchBreakdown: searchResults,
        scrapedCount: 0,
        relevantCount: 0,
        keyInsights: [],
        contentSummary: "Content scraping failed",
        perfectPrompt: "",
        totalCost
      };
    }
  }

  private getDateFilter(filter: string): string {
    const now = new Date();
    const hours = { past24h: 24, pastWeek: 168, pastMonth: 720, pastYear: 8760 };
    const h = hours[filter as keyof typeof hours] || 168;
    return new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();
  }

  private createEnhancedPrompt(originalQuery: string, synonyms: string[], contents: ScrapedContent[], insights: string[], searchBreakdown: any[]): string {
    const sortedContents = ContentCleaner.sortContentNaturally([...contents]);
    
    let prompt = `# Enhanced Multi-Query Cryptocurrency Analysis
**Original Query:** ${originalQuery}
**Analysis Date:** ${new Date().toLocaleDateString()}
**Total Queries:** ${searchBreakdown.length}
**Unique Sources:** ${sortedContents.length}

## Query Variations:
• Original: "${originalQuery}"
${synonyms.map((synonym, i) => `• Synonym ${i + 1}: "${synonym}"`).join('\n')}

## Key Insights:
${insights.length > 0 ? insights.map(insight => `• ${insight}`).join('\n') : '• No specific insights extracted'}

## Source Analysis:

`;

    sortedContents.forEach((content, index) => {
      const sourceResult = searchBreakdown.flatMap(sb => sb.results || []).find(r => r.url === content.url);
      prompt += `### Source ${index + 1}: ${content.title}
**Publisher:** ${content.metadata.source} | **Relevance:** ${(content.metadata.relevanceScore * 100).toFixed(0)}%
**Found via:** ${sourceResult?.searchQuery || 'Unknown'}
**Tags:** ${content.tags.join(', ')}

**Content:**
${content.cleanedContent.substring(0, 1800)}${content.cleanedContent.length > 1800 ? '...' : ''}

---

`;
    });

    prompt += `## Analysis Instructions:
Based on the above multi-angle coverage of: "${originalQuery}"

Provide comprehensive analysis covering:
1. Current state and key drivers
2. Market consensus and conflicts  
3. Future implications and outlook
4. Actionable insights with source attribution

Reference high-relevance sources specifically.`;

    return prompt;
  }
}

// Export the main function for integration with index.ts
export async function processCryptoQuery(userQuery: string, exaApiKey: string, openaiApiKey: string, geminiApiKey: string): Promise<any> {
  const mainAgent = new MainCryptoAgent(exaApiKey, openaiApiKey, geminiApiKey);
  
  const result = await mainAgent.runAsync({
    userQuery,
    numResults: 2,
    maxScrape: 8,
    deduplication: true
  }, {} as ToolContext);

  return result;
}
