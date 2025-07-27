import { BaseTool, ToolContext } from "@iqai/adk";
import { Type } from "@google/genai";
import { Exa } from "exa-js";
import { UniversalScraper, ContentCleaner, ScrapedContent } from "../services/scraper.js";
import { SynonymGenerator, SynonymResponse } from "../services/synonym-generator.js";

export class EnhancedExaTool extends BaseTool {
  private exa: Exa;
  private scraper: UniversalScraper;
  private synonymGenerator: SynonymGenerator;

  constructor(exaApiKey: string) {
    super({
      name: "enhanced_exa_search",
      description: "Advanced web search with AI query expansion, synonym generation, and content scraping"
    });
    this.exa = new Exa(exaApiKey);
    this.scraper = new UniversalScraper({ timeout: 12000, maxContentLength: 8000, includeImages: false });
    this.synonymGenerator = new SynonymGenerator();
  }

  getDeclaration() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: "Primary search query" },
          enableSynonyms: { type: Type.BOOLEAN, description: "Enable AI synonym generation (default: true)" },
          numSynonyms: { type: Type.NUMBER, description: "Number of synonyms (1-5, default: 3)" },
          numResults: { type: Type.NUMBER, description: "Results per query (1-10, default: 2)" },
          includeDomains: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Domains to include" },
          dateFilter: { type: Type.STRING, description: "Date filter: 'past24h', 'pastWeek', 'pastMonth', 'pastYear'" },
          enableScraping: { type: Type.BOOLEAN, description: "Enable content scraping (default: true)" },
          maxScrape: { type: Type.NUMBER, description: "Max URLs to scrape (1-15, default: 8)" },
          deduplication: { type: Type.BOOLEAN, description: "Remove duplicate URLs (default: true)" }
        },
        required: ["query"]
      }
    };
  }

  async runAsync(args: {
    query: string;
    enableSynonyms?: boolean;
    numSynonyms?: number;
    numResults?: number;
    includeDomains?: string[];
    dateFilter?: string;
    enableScraping?: boolean;
    maxScrape?: number;
    deduplication?: boolean;
  }, context: ToolContext) {
    try {
      const { 
        query='Analyze why Bitcoin and Ethereum prices are changing and what factors are driving current movements', 
        enableSynonyms = true, numSynonyms = 3, numResults = 2, 
        includeDomains, dateFilter, enableScraping = true, maxScrape = 8, deduplication = true
      } = args;

      const startTime = Date.now();
      let synonymResponse: SynonymResponse | null = null;
      let searchQueries = [query];

      if (enableSynonyms) {
        try {
          synonymResponse = await this.synonymGenerator.generateSynonyms(query, {
            numSynonyms: Math.min(Math.max(numSynonyms, 1), 5),
            temperature: 0.4
          });
          searchQueries = [query, ...synonymResponse.synonyms];
          console.log('Search queries (synonyms)', searchQueries)
        } catch (error) {
          console.warn(`❌ Synonym generation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const searchOptions: any = {
        type: "auto",
        numResults: Math.min(Math.max(numResults, 1), 10),
        text: false,
        summary: true
      };

      if (includeDomains?.length) searchOptions.includeDomains = includeDomains;
      if (dateFilter) searchOptions.startPublishedDate = this.getDateFilter(dateFilter);

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

      allResults.sort((a, b) => (b.score || 0) - (a.score || 0));

      if (!enableScraping) {
        return {
          success: true,
          originalQuery: query,
          synonymsUsed: synonymResponse?.synonyms || [],
          totalQueries: searchQueries.length,
          totalResults: allResults.length,
          results: allResults,
          searchBreakdown: searchResults,
          cost: totalCost,
          processingTime: Date.now() - startTime,
          scrapingEnabled: false
        };
      }

      const urlsToScrape = allResults.slice(0, Math.min(maxScrape, allResults.length)).map(item => item.url);
      
      let scrapedContents: ScrapedContent[] = [];
      try {
        scrapedContents = await this.scraper.scrapeMultiple(urlsToScrape);
        const relevantContents = ContentCleaner.filterByRelevance(scrapedContents, 0.15);

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
        const perfectPrompt = this.createEnhancedPrompt(query, synonymResponse?.synonyms || [], relevantContents, keyInsights, searchResults);

        return {
          success: true,
          originalQuery: query,
          synonymsUsed: synonymResponse?.synonyms || [],
          synonymGenerationTime: synonymResponse?.processingTime || 0,
          totalQueries: searchQueries.length,
          totalResults: allResults.length,
          results: enhancedResults,
          searchBreakdown: searchResults,
          scrapingEnabled: true,
          scrapedCount: scrapedContents.length,
          relevantCount: relevantContents.length,
          keyInsights,
          contentSummary,
          perfectPrompt,
          cost: totalCost,
          processingTime: Date.now() - startTime
        };

      } catch (scrapingError) {
        return {
          success: true,
          originalQuery: query,
          synonymsUsed: synonymResponse?.synonyms || [],
          totalQueries: searchQueries.length,
          totalResults: allResults.length,
          results: allResults,
          searchBreakdown: searchResults,
          scrapingEnabled: false,
          scrapingError: scrapingError instanceof Error ? scrapingError.message : String(scrapingError),
          cost: totalCost,
          processingTime: Date.now() - startTime
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        originalQuery: args.query,
        processingTime: Date.now() - Date.now()
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

export class EnhancedExaAnswerTool extends BaseTool {
  private exa: Exa;
  private synonymGenerator: SynonymGenerator;

  constructor(exaApiKey: string) {
    super({
      name: "enhanced_exa_answer",
      description: "Get direct answers with AI query expansion across multiple search variations"
    });
    this.exa = new Exa(exaApiKey);
    this.synonymGenerator = new SynonymGenerator();
  }

  getDeclaration() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: "Question to answer" },
          enableSynonyms: { type: Type.BOOLEAN, description: "Enable query expansion (default: true)" },
          numSynonyms: { type: Type.NUMBER, description: "Number of synonyms (1-3, default: 2)" },
          includeDomains: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Preferred domains" }
        },
        required: ["query"]
      }
    };
  }

  async runAsync(args: {
    query: string;
    enableSynonyms?: boolean;
    numSynonyms?: number;
    includeDomains?: string[];
  }, context: ToolContext) {
    try {
      const { query, enableSynonyms = true, numSynonyms = 2, includeDomains } = args;

      let searchQueries = [query];
      let synonymResponse: SynonymResponse | null = null;

      if (enableSynonyms) {
        try {
          synonymResponse = await this.synonymGenerator.generateSynonyms(query, {
            numSynonyms: Math.min(Math.max(numSynonyms, 1), 3),
            temperature: 0.3
          });
          searchQueries = [query, ...synonymResponse.synonyms.slice(0, 2)];
        } catch (error) {
          console.warn(`Synonym generation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      const options: any = { type: "auto" };
      if (includeDomains?.length) options.includeDomains = includeDomains;

      const answerPromises = searchQueries.map(async (searchQuery) => {
        try {
          const result = await this.exa.searchAndContents(searchQuery, {
            ...options,
            numResults: 1,
            summary: false,
            text: { maxCharacters: 2000, includeHtmlTags: false }
          });

          return {
            query: searchQuery,
            success: true,
            result: result.results[0] || null,
            cost: result.costDollars?.total || 0
          };
        } catch (error) {
          return {
            query: searchQuery,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            cost: 0
          };
        }
      });

      const answerResults = await Promise.all(answerPromises);
      const successfulAnswers = answerResults.filter(r => r.success && r.result);

      if (successfulAnswers.length === 0) {
        return {
          success: false,
          error: "No answers found for any query variation",
          originalQuery: query,
          queriesAttempted: searchQueries
        };
      }

      const bestAnswer = successfulAnswers.reduce((best, current) => 
        (current.result?.score || 0) > (best.result?.score || 0) ? current : best
      );

      const totalCost = answerResults.reduce((sum, r) => sum + r.cost, 0);

      return {
        success: true,
        originalQuery: query,
        synonymsUsed: synonymResponse?.synonyms || [],
        queriesAttempted: searchQueries.length,
        answer: bestAnswer.result?.text || '',
        source: {
          title: bestAnswer.result?.title || '',
          url: bestAnswer.result?.url || '',
          score: bestAnswer.result?.score || 0
        },
        foundVia: bestAnswer.query,
        alternativeAnswers: successfulAnswers
          .filter(a => a !== bestAnswer && a.result)
          .map(a => ({
            query: a.query,
            text: a.result?.text || '',
            source: {
              title: a.result?.title || '',
              url: a.result?.url || '',
              score: a.result?.score || 0
            }
          })),
        cost: totalCost
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        originalQuery: args.query
      };
    }
  }
}
