import { BaseTool, ToolContext } from "@iqai/adk";
import { Type } from "@google/genai";
import { Exa } from "exa-js";
import { UniversalScraper, ContentCleaner, ScrapedContent } from "../services/scraper.js";

export class ExaTool extends BaseTool {
  private exa: Exa;
  private scraper: UniversalScraper;

  constructor(apiKey: string) {
    super({
      name: "exa_search",
      description: "Search web for narrative content using AI-powered semantic search with universal scraping and cleaning"
    });
    this.exa = new Exa(apiKey);
    this.scraper = new UniversalScraper({
      timeout: 12000,
      maxContentLength: 8000,
      includeImages: false
    });
  }

  getDeclaration() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: "Search query"
          },
          numResults: {
            type: Type.NUMBER,
            description: "Number of results (1-10, default: 3)"
          },
          includeDomains: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Domains to include"
          },
          dateFilter: {
            type: Type.STRING,
            description: "Date filter: 'past24h', 'pastWeek', 'pastMonth', 'pastYear'"
          },
          enableScraping: {
            type: Type.BOOLEAN,
            description: "Enable full content scraping and cleaning (default: true)"
          },
          maxScrape: {
            type: Type.NUMBER,
            description: "Maximum number of URLs to scrape (1-5, default: 3)"
          }
        },
        required: ["query"]
      }
    };
  }

  async runAsync(args: {
    query: string;
    numResults?: number;
    includeDomains?: string[];
    dateFilter?: string;
    enableScraping?: boolean;
    maxScrape?: number;
  }, context: ToolContext) {
    try {
      const { 
        query, 
        numResults = 3, 
        includeDomains, 
        dateFilter,
        enableScraping = true,
        maxScrape = 3
      } = args;

      console.log(`🔍 Exa search: "${query}" ${enableScraping ? 'with scraping' : 'summary only'}`);

      const options: any = {
        type: "auto",
        numResults: Math.min(Math.max(numResults, 1), 10),
        text: false,
        summary: true
      };

      if (includeDomains?.length) options.includeDomains = includeDomains;
      if (dateFilter) options.startPublishedDate = this.getDateFilter(dateFilter);

      const result = await this.exa.searchAndContents(query, options);

      const basicResults = result.results.map((item: any) => ({
        title: item.title,
        url: item.url,
        summary: item.summary,
        score: item.score
      }));

      if (!enableScraping) {
        return {
          success: true,
          query,
          numResults: result.results.length,
          results: basicResults,
          cost: result.costDollars?.total,
          scrapingEnabled: false
        };
      }

      const urlsToScrape = basicResults
        .slice(0, Math.min(maxScrape, numResults))
        .map(item => item.url);

      console.log(`🕷️ Scraping ${urlsToScrape.length} URLs for enhanced content...`);
      
      let scrapedContents: ScrapedContent[] = [];
      try {
        scrapedContents = await this.scraper.scrapeMultiple(urlsToScrape);
        
        const relevantContents = ContentCleaner.filterByRelevance(scrapedContents, 0.2);
        
        console.log(`✅ Successfully scraped ${scrapedContents.length}/${urlsToScrape.length} sources`);
        console.log(`📊 Relevant sources: ${relevantContents.length} (relevance ≥ 20%)`);

        const enhancedResults = basicResults.map(basicResult => {
          const scrapedContent = scrapedContents.find(sc => sc.url === basicResult.url);
          
          if (scrapedContent) {
            return {
              ...basicResult,
              scraped: true,
              fullContent: scrapedContent.cleanedContent,
              metadata: scrapedContent.metadata,
              tags: scrapedContent.tags,
              promptReady: ContentCleaner.cleanForPrompt(scrapedContent),
              citation: {
                title: basicResult.title,
                url: basicResult.url,
                publisher: scrapedContent.metadata.source || new URL(basicResult.url).hostname,
                publishDate: scrapedContent.metadata.publishDate,
                accessDate: new Date().toISOString(),
                relevanceScore: scrapedContent.metadata.relevanceScore,
                contentSnippet: scrapedContent.cleanedContent.substring(0, 200) + '...',
                tags: scrapedContent.tags,
                citationFormat: {
                  apa: this.generateAPACitation(basicResult.title, basicResult.url, scrapedContent.metadata),
                  mla: this.generateMLACitation(basicResult.title, basicResult.url, scrapedContent.metadata),
                  chicago: this.generateChicagoCitation(basicResult.title, basicResult.url, scrapedContent.metadata)
                }
              }
            };
          }
          
          return {
            ...basicResult,
            scraped: false,
            fullContent: basicResult.summary,
            citation: {
              title: basicResult.title,
              url: basicResult.url,
              publisher: new URL(basicResult.url).hostname,
              accessDate: new Date().toISOString(),
              contentSnippet: basicResult.summary,
              citationFormat: {
                apa: this.generateAPACitation(basicResult.title, basicResult.url, {}),
                mla: this.generateMLACitation(basicResult.title, basicResult.url, {}),
                chicago: this.generateChicagoCitation(basicResult.title, basicResult.url, {})
              }
            }
          };
        });

        const keyInsights = ContentCleaner.extractKeyInsights(relevantContents);
        const contentSummary = ContentCleaner.summarizeForContext(relevantContents);
        
        const perfectPrompt = this.createPerfectPrompt(query, relevantContents, keyInsights);

        const citationSummary = this.generateCitationSummary(enhancedResults);

        return {
          success: true,
          query,
          numResults: result.results.length,
          results: enhancedResults,
          scrapingEnabled: true,
          scrapedCount: scrapedContents.length,
          relevantCount: relevantContents.length,
          keyInsights,
          contentSummary,
          perfectPrompt,
          citationSummary,
          bibliography: this.generateBibliography(enhancedResults),
          cost: result.costDollars?.total
        };

      } catch (scrapingError) {
        console.warn(`⚠️ Scraping failed: ${scrapingError instanceof Error ? scrapingError.message : String(scrapingError)}`);
        
        const fallbackResults = basicResults.map(result => ({
          ...result,
          scraped: false,
          citation: {
            title: result.title,
            url: result.url,
            publisher: new URL(result.url).hostname,
            accessDate: new Date().toISOString(),
            contentSnippet: result.summary,
            citationFormat: {
              apa: this.generateAPACitation(result.title, result.url, {}),
              mla: this.generateMLACitation(result.title, result.url, {}),
              chicago: this.generateChicagoCitation(result.title, result.url, {})
            }
          }
        }));

        return {
          success: true,
          query,
          numResults: result.results.length,
          results: fallbackResults,
          scrapingEnabled: false,
          scrapingError: scrapingError instanceof Error ? scrapingError.message : String(scrapingError),
          citationSummary: this.generateCitationSummary(fallbackResults),
          bibliography: this.generateBibliography(fallbackResults),
          cost: result.costDollars?.total
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        query: args.query
      };
    }
  }

  private generateAPACitation(title: string, url: string, metadata: any): string {
    const author = metadata.author || "Author Unknown";
    const date = metadata.publishDate ? new Date(metadata.publishDate).getFullYear() : new Date().getFullYear();
    const publisher = metadata.source || new URL(url).hostname;
    const accessDate = new Date().toLocaleDateString('en-US');
    
    return `${author}. (${date}). ${title}. ${publisher}. Retrieved ${accessDate}, from ${url}`;
  }

  private generateMLACitation(title: string, url: string, metadata: any): string {
    const author = metadata.author || "Author Unknown";
    const publisher = metadata.source || new URL(url).hostname;
    const date = metadata.publishDate ? new Date(metadata.publishDate).toLocaleDateString('en-US') : new Date().toLocaleDateString('en-US');
    const accessDate = new Date().toLocaleDateString('en-US');
    
    return `${author}. "${title}." ${publisher}, ${date}. Web. ${accessDate}.`;
  }

  private generateChicagoCitation(title: string, url: string, metadata: any): string {
    const author = metadata.author || "Author Unknown";
    const publisher = metadata.source || new URL(url).hostname;
    const date = metadata.publishDate ? new Date(metadata.publishDate).toLocaleDateString('en-US') : new Date().toLocaleDateString('en-US');
    const accessDate = new Date().toLocaleDateString('en-US');
    
    return `${author}. "${title}." ${publisher}. ${date}. Accessed ${accessDate}. ${url}.`;
  }

  private generateCitationSummary(results: any[]): any {
    const scrapedCount = results.filter(r => r.scraped).length;
    const totalSources = results.length;
    const publisherDistribution = results.reduce((acc, result) => {
      const publisher = result.citation.publisher;
      acc[publisher] = (acc[publisher] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalSources,
      scrapedSources: scrapedCount,
      unscrapedSources: totalSources - scrapedCount,
      publisherDistribution,
      averageRelevance: results
        .filter(r => r.citation.relevanceScore)
        .reduce((sum, r) => sum + r.citation.relevanceScore, 0) / 
        results.filter(r => r.citation.relevanceScore).length || 0,
      citationStyles: ['APA', 'MLA', 'Chicago'],
      generatedAt: new Date().toISOString()
    };
  }

  private generateBibliography(results: any[]): any {
    return {
      apa: results.map(r => r.citation.citationFormat.apa).sort(),
      mla: results.map(r => r.citation.citationFormat.mla).sort(),
      chicago: results.map(r => r.citation.citationFormat.chicago).sort(),
      count: results.length,
      generatedAt: new Date().toISOString()
    };
  }

  private getDateFilter(filter: string): string {
    const now = new Date();
    const hours = { past24h: 24, pastWeek: 168, pastMonth: 720, pastYear: 8760 };
    const h = hours[filter as keyof typeof hours] || 168;
    return new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();
  }

  private createPerfectPrompt(query: string, contents: ScrapedContent[], insights: string[]): string {
    const timestamp = new Date().toISOString();
    const sortedContents = ContentCleaner.sortContentNaturally([...contents]);
    
    let prompt = `# Enhanced Cryptocurrency Analysis Context
**Query:** ${query}
**Analysis Date:** ${new Date().toLocaleDateString()}
**Sources:** ${sortedContents.length} verified and cleaned sources

## 📊 Key Market Insights
${insights.length > 0 ? insights.map(insight => `• ${insight}`).join('\n') : '• No specific insights extracted'}

## 📰 Source Content Analysis

`;

    sortedContents.forEach((content, index) => {
      prompt += `### Source ${index + 1}: ${content.title}
**Publisher:** ${content.metadata.source} | **Relevance:** ${(content.metadata.relevanceScore * 100).toFixed(0)}%
**Tags:** ${content.tags.join(', ')}
${content.metadata.publishDate ? `**Published:** ${new Date(content.metadata.publishDate).toLocaleDateString()}` : ''}

**Content Summary:**
${content.cleanedContent.substring(0, 1500)}${content.cleanedContent.length > 1500 ? '...' : ''}

---

`;
    });

    prompt += `## 🎯 Analysis Instructions for Gemini 2.5 Pro

Based on the above verified and cleaned content, provide a comprehensive analysis that:

1. **Synthesizes** the key information from all sources
2. **Identifies** the main factors driving current market movements
3. **Explains** the underlying causes and potential implications
4. **Highlights** any conflicting viewpoints or uncertainties
5. **Provides** actionable insights for understanding market dynamics

Focus on factual analysis backed by the source material above. Reference specific sources when making claims.

**Original Query Context:** ${query}`;

    return prompt;
  }
}

export class ExaAnswerTool extends BaseTool {
  private exa: Exa;
  private scraper: UniversalScraper;

  constructor(apiKey: string) {
    super({
      name: "exa_answer",
      description: "Get direct answers with citations using Exa API, enhanced with content scraping"
    });
    this.exa = new Exa(apiKey);
    this.scraper = new UniversalScraper({
      timeout: 10000,
      maxContentLength: 5000
    });
  }

  getDeclaration() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: "Question to answer"
          },
          includeDomains: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Domains to include"
          },
          enhanceWithScraping: {
            type: Type.BOOLEAN,
            description: "Enhance answer with scraped source content (default: true)"
          }
        },
        required: ["query"]
      }
    };
  }

  async runAsync(args: {
    query: string;
    includeDomains?: string[];
    enhanceWithScraping?: boolean;
  }, context: ToolContext) {
    try {
      const { query, includeDomains, enhanceWithScraping = true } = args;
      
      console.log(`🤔 Exa Answer: "${query}" ${enhanceWithScraping ? 'with enhancement' : 'basic mode'}`);
      
      const options: any = {};
      if (includeDomains?.length) options.includeDomains = includeDomains;

      const result = await this.exa.answer(query, options);

      const basicResponse = {
        success: true,
        query,
        answer: result.answer,
        sources: result.citations?.map((c: any) => ({
          title: c.title,
          url: c.url
        })) || []
      };

      if (!enhanceWithScraping || !basicResponse.sources.length) {
        const basicCitations = basicResponse.sources.map(source => ({
          ...source,
          citation: {
            title: source.title,
            url: source.url,
            publisher: new URL(source.url).hostname,
            accessDate: new Date().toISOString(),
            citationFormat: {
              apa: this.generateAPACitation(source.title, source.url, {}),
              mla: this.generateMLACitation(source.title, source.url, {}),
              chicago: this.generateChicagoCitation(source.title, source.url, {})
            }
          }
        }));

        return {
          ...basicResponse,
          sources: basicCitations,
          enhanced: false,
          citationSummary: this.generateCitationSummary(basicCitations),
          bibliography: this.generateBibliography(basicCitations)
        };
      }

      try {
        console.log(`🕷️ Enhancing answer with ${basicResponse.sources.length} source(s)...`);
        
        const sourceUrls = basicResponse.sources.map(s => s.url);
        const scrapedContents = await this.scraper.scrapeMultiple(sourceUrls);
        
        const relevantContents = ContentCleaner.filterByRelevance(scrapedContents, 0.1);
        const enhancedSources = basicResponse.sources.map(source => {
          const scraped = scrapedContents.find(sc => sc.url === source.url);
          if (scraped) {
            return {
              ...source,
              scraped: true,
              content: scraped.cleanedContent.substring(0, 2000),
              metadata: scraped.metadata,
              tags: scraped.tags,
              citation: {
                title: source.title,
                url: source.url,
                publisher: scraped.metadata.source || new URL(source.url).hostname,
                publishDate: scraped.metadata.publishDate,
                accessDate: new Date().toISOString(),
                relevanceScore: scraped.metadata.relevanceScore,
                contentSnippet: scraped.cleanedContent.substring(0, 200) + '...',
                tags: scraped.tags,
                citationFormat: {
                  apa: this.generateAPACitation(source.title, source.url, scraped.metadata),
                  mla: this.generateMLACitation(source.title, source.url, scraped.metadata),
                  chicago: this.generateChicagoCitation(source.title, source.url, scraped.metadata)
                }
              }
            };
          }
          return { 
            ...source, 
            scraped: false,
            citation: {
              title: source.title,
              url: source.url,
              publisher: new URL(source.url).hostname,
              accessDate: new Date().toISOString(),
              citationFormat: {
                apa: this.generateAPACitation(source.title, source.url, {}),
                mla: this.generateMLACitation(source.title, source.url, {}),
                chicago: this.generateChicagoCitation(source.title, source.url, {})
              }
            }
          };
        });

        const sortedRelevantContents = ContentCleaner.sortContentNaturally([...relevantContents]);
        const contextualPrompt = `
**Original Answer:** ${result.answer}

**Enhanced Context from Sources:**
${sortedRelevantContents.map((content, i) => `
${i + 1}. **${content.title}** (${content.metadata.source})
   Relevance: ${(content.metadata.relevanceScore * 100).toFixed(0)}%
   Content: ${content.cleanedContent.substring(0, 800)}...
`).join('\n')}

**Query:** ${query}`;

        return {
          ...basicResponse,
          enhanced: true,
          enhancedAnswer: result.answer,
          sources: enhancedSources,
          scrapedCount: scrapedContents.length,
          relevantCount: relevantContents.length,
          contextualPrompt,
          enhancementSummary: `Enhanced answer with ${scrapedContents.length} scraped sources (${relevantContents.length} highly relevant)`,
          citationSummary: this.generateCitationSummary(enhancedSources),
          bibliography: this.generateBibliography(enhancedSources)
        };

      } catch (enhancementError) {
        console.warn(`⚠️ Enhancement failed: ${enhancementError instanceof Error ? enhancementError.message : String(enhancementError)}`);
        
        const fallbackSources = basicResponse.sources.map(source => ({
          ...source,
          scraped: false,
          citation: {
            title: source.title,
            url: source.url,
            publisher: new URL(source.url).hostname,
            accessDate: new Date().toISOString(),
            citationFormat: {
              apa: this.generateAPACitation(source.title, source.url, {}),
              mla: this.generateMLACitation(source.title, source.url, {}),
              chicago: this.generateChicagoCitation(source.title, source.url, {})
            }
          }
        }));

        return {
          ...basicResponse,
          sources: fallbackSources,
          enhanced: false,
          enhancementError: enhancementError instanceof Error ? enhancementError.message : String(enhancementError),
          citationSummary: this.generateCitationSummary(fallbackSources),
          bibliography: this.generateBibliography(fallbackSources)
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        query: args.query
      };
    }
  }

  private generateAPACitation(title: string, url: string, metadata: any): string {
    const author = metadata.author || "Author Unknown";
    const date = metadata.publishDate ? new Date(metadata.publishDate).getFullYear() : new Date().getFullYear();
    const publisher = metadata.source || new URL(url).hostname;
    const accessDate = new Date().toLocaleDateString('en-US');
    
    return `${author}. (${date}). ${title}. ${publisher}. Retrieved ${accessDate}, from ${url}`;
  }

  private generateMLACitation(title: string, url: string, metadata: any): string {
    const author = metadata.author || "Author Unknown";
    const publisher = metadata.source || new URL(url).hostname;
    const date = metadata.publishDate ? new Date(metadata.publishDate).toLocaleDateString('en-US') : new Date().toLocaleDateString('en-US');
    const accessDate = new Date().toLocaleDateString('en-US');
    
    return `${author}. "${title}." ${publisher}, ${date}. Web. ${accessDate}.`;
  }

  private generateChicagoCitation(title: string, url: string, metadata: any): string {
    const author = metadata.author || "Author Unknown";
    const publisher = metadata.source || new URL(url).hostname;
    const date = metadata.publishDate ? new Date(metadata.publishDate).toLocaleDateString('en-US') : new Date().toLocaleDateString('en-US');
    const accessDate = new Date().toLocaleDateString('en-US');
    
    return `${author}. "${title}." ${publisher}. ${date}. Accessed ${accessDate}. ${url}.`;
  }

  private generateCitationSummary(sources: any[]): any {
    const scrapedCount = sources.filter(s => s.scraped).length;
    const totalSources = sources.length;
    const publisherDistribution = sources.reduce((acc, source) => {
      const publisher = source.citation.publisher;
      acc[publisher] = (acc[publisher] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalSources,
      scrapedSources: scrapedCount,
      unscrapedSources: totalSources - scrapedCount,
      publisherDistribution,
      averageRelevance: sources
        .filter(s => s.citation?.relevanceScore)
        .reduce((sum, s) => sum + s.citation.relevanceScore, 0) / 
        sources.filter(s => s.citation?.relevanceScore).length || 0,
      citationStyles: ['APA', 'MLA', 'Chicago'],
      generatedAt: new Date().toISOString()
    };
  }

  private generateBibliography(sources: any[]): any {
    return {
      apa: sources.map(s => s.citation.citationFormat.apa).sort(),
      mla: sources.map(s => s.citation.citationFormat.mla).sort(),
      chicago: sources.map(s => s.citation.citationFormat.chicago).sort(),
      count: sources.length,
      generatedAt: new Date().toISOString()
    };
  }
}