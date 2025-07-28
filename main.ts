import "dotenv/config";
import { LlmAgent, AgentBuilder } from "@iqai/adk";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { Exa } from "exa-js";
import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const userQuery = "Do you have some analysis on PEAR Protocol recent launch and its impact on PEAR Token?";

const systemPrompt = `You are a helpful assistant specialized in cryptocurrency insights. Your task is to generate synonym search queries based on the user's question, but only if the question is related to cryptocurrencies like Bitcoin, Ethereum, or any crypto tickers (such as BTC, ETH, SOL, etc.).

Today's date is ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}. Use today's date, month or year if the question requires the latest events and news.

##SINGLE INFERENCE APPROACH WITH ASSET SEGMENTATION:
•⁠ ⁠Generate ALL synonym queries in ONE response
•⁠ ⁠If the user asks about MULTIPLE different crypto assets (e.g., "Bitcoin and Ethereum", "BTC, ETH, and SOL"), SEGMENT them into separate queries for each asset
•⁠ ⁠For each asset, generate 2-3 focused synonym queries
•⁠ ⁠You can generate MORE than 5 total synonyms if multiple assets are involved but make sure they are not redundant and convey different intuition

##QUERY SEGMENTATION IF MORE THAN ONE ASSET AND CORE INSTINCT:
•⁠ ⁠If the user asks about MULTIPLE different crypto assets (e.g., "Bitcoin and Ethereum", "BTC, ETH, and SOL"), SEGMENT them into separate queries
•⁠ ⁠For each asset, generate 2-3 focused synonym queries  
•⁠ ⁠You can generate MORE than 5 total synonyms if multiple assets are involved but make sure they are not redundant and convey different intuition

## RESPONSE FORMAT:
Format the response as a valid JSON object with numbered queries:
{
  "1": "query one",
  "2": "query two",
  "3": "query three",
  ...
}

## EXAMPLES:

Example 1 - Single Asset:
User question: Analyze why Bitcoin prices are changing and what factors are driving current movements

Response:
{
  "1": "Bitcoin price change July 2025",
  "2": "factors driving Bitcoin price July 2025", 
  "3": "Bitcoin market analysis July 2025"
}

Example 2 - Multiple Assets (SEGMENTED IN ONE RESPONSE):
User question: Analyze why Bitcoin and Ethereum prices are changing and what factors are driving current movements

Response:
{
  "1": "Bitcoin price change July 2025",
  "2": "factors driving Bitcoin price July 2025",
  "3": "Bitcoin market analysis July 2025",
  "4": "Ethereum price change July 2025", 
  "5": "factors driving Ethereum price July 2025",
  "6": "Ethereum market analysis July 2025"
}

Example 3 - Multiple Assets with Different Focus:
User question: What's the latest on Solana's market trends and Bitcoin's price predictions for next month?

Response:
{
  "1": "Solana market trends July 2025",
  "2": "Solana price analysis July 2025", 
  "3": "Solana crypto news July 2025",
  "4": "Bitcoin price predictions August 2025",
  "5": "Bitcoin forecast August 2025",
  "6": "Bitcoin market outlook August 2025"
}

Example 4 - Technical Analysis for Multiple Assets:
User question: Technical analysis Doge Coin and IQ Token

Response:
{
  "1": "Dogecoin technical analysis July 2025",
  "2": "Dogecoin chart patterns RSI MACD July 2025",
  "3": "Dogecoin support resistance levels July 2025", 
  "4": "IQ Token technical analysis July 2025",
  "5": "IQ Token chart patterns RSI MACD July 2025",
  "6": "IQ Token support resistance levels July 2025"
}

Example 5 - Non-Crypto Topic:
User question: Tell me about the weather today.

Response:
Sorry, please ask about crypto-related insights.

## INSTRUCTIONS:
1. First, check if the user's question is about cryptocurrencies, prices, factors, trends, or any crypto-related topic
2. If it's NOT crypto-related, reply only with: "Sorry, please ask about crypto-related insights."
3. If it IS crypto-related:
   - Identify ALL crypto assets mentioned (Bitcoin, Ethereum, Solana, etc.)
   - Generate ALL synonyms for ALL assets in ONE single response
   - If MULTIPLE assets: SEGMENT into separate focused queries per asset within the same response
   - If SINGLE asset: generate 2-3 focused synonyms
   - Make queries short and useful for web searches
   - Include current month/year if relevant
   - Number starting from 1
   - Return valid JSON format
4. Maximum 3 synonyms per individual asset, but can exceed 5 total if multiple assets
5. Focus on price analysis, market trends, factors, and current events
6. IMPORTANT: Each query should focus on ONE specific asset, not combine multiple assets in the same query`;

interface SynonymResponse {
  synonyms: string[];
  originalQuery: string;
}

interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  cleanedContent: string;
  metadata: {
    relevanceScore: number;
    wordCount: number;
    source: string;
  };
}

class UniversalScraper {
  async scrapeMultiple(urls: string[]): Promise<ScrapedContent[]> {
    const results = await Promise.allSettled(
      urls.map(url => this.scrapeUrl(url))
    );
    
    return results
      .filter((result): result is PromiseFulfilledResult<ScrapedContent> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value);
  }

  async scrapeUrl(url: string): Promise<ScrapedContent> {
    console.log(`🔍 Scraping: ${url}`);
    
    const [axiosCheerio, playwrightCheerio, axiosReadability, playwrightReadability] = await Promise.allSettled([
      this.axiosCheerio(url),
      this.playwrightCheerio(url),
      this.axiosReadability(url),
      this.playwrightReadability(url)
    ]);

    const results = [
      { method: 'axios-cheerio', result: axiosCheerio },
      { method: 'playwright-cheerio', result: playwrightCheerio },
      { method: 'axios-readability', result: axiosReadability },
      { method: 'playwright-readability', result: playwrightReadability }
    ].filter(r => r.result.status === 'fulfilled' && (r.result as PromiseFulfilledResult<any>).value.content)
     .map(r => ({ ...(r.result as PromiseFulfilledResult<any>).value, method: r.method }));

    if (!results.length) {
      console.log(`❌ All scraping methods failed for: ${url}`);
      throw new Error('All methods failed');
    }

    const best = results.reduce((max, curr) => 
      curr.content.length > max.content.length ? curr : max
    );
    
    console.log(`✅ Successfully scraped ${best.content.length} chars using ${best.method}: ${url.substring(0, 50)}...`);

    return this.buildScrapedContent(url, best.content, best.html);
  }

  private async axiosCheerio(url: string) {
    const { data } = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 15000
    });
    const content = this.extractContentCheerio(data);
    return { content, html: data };
  }

  private async playwrightCheerio(url: string) {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });
    await page.goto(url, { timeout: 15000, waitUntil: 'networkidle' });
    const html = await page.content();
    await browser.close();
    const content = this.extractContentCheerio(html);
    return { content, html };
  }

  private async axiosReadability(url: string) {
    const { data } = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 15000
    });
    const content = this.extractContentReadability(data, url);
    return { content, html: data };
  }

  private async playwrightReadability(url: string) {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });
    await page.goto(url, { timeout: 15000, waitUntil: 'networkidle' });
    const html = await page.content();
    await browser.close();
    const content = this.extractContentReadability(html, url);
    return { content, html };
  }

  private extractContentCheerio(html: string): string {
    const $ = cheerio.load(html);
    $('script, style, nav, header, footer, aside, .advertisement, .ad, .sidebar').remove();

    const contentSelectors = [
      'article', 'main', '.content', '.post', '.entry', 
      '.article-content', '.post-content', '.entry-content',
      '.container', '.wrapper', 'body'
    ];
    
    let content = '';
    for (const selector of contentSelectors) {
      content = $(selector).first().text();
      if (content && content.length > 200) break;
    }
    
    if (!content || content.length < 100) {
      content = $('body').text();
    }
    
    return content.replace(/\s+/g, ' ').trim();
  }

  private extractContentReadability(html: string, url: string): string {
    try {
      const dom = new JSDOM(html, { url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();
      return article?.textContent ? article.textContent.replace(/\s+/g, ' ').trim() : '';
    } catch (error) {
      return this.extractContentCheerio(html);
    }
  }

  private buildScrapedContent(url: string, content: string, html: string): ScrapedContent {
    let title = 'No Title';
    try {
      const $ = cheerio.load(html);
      title = $('h1').first().text().trim() || $('title').text().trim() || 'No Title';
    } catch (error) {
      title = 'No Title';
    }
    
    const cleanedContent = content.substring(0, 8000);
    const wordCount = cleanedContent.split(/\s+/).length;
    const relevanceScore = Math.max(0.3, Math.min(0.9, wordCount / 800));

    return {
      url,
      title,
      content,
      cleanedContent,
      metadata: {
        relevanceScore,
        wordCount,
        source: new URL(url).hostname
      }
    };
  }
}

async function generateSynonyms(originalQuery: string): Promise<SynonymResponse> {
  const openaiAgent = await AgentBuilder
    .create("synonym_generator")
    .withModel(openai("gpt-4o"))
    .withDescription("Creative cryptocurrency research query generator")
    .withInstruction(systemPrompt)
    .build();

  const result = await openaiAgent.runner.ask(`Generate synonym search queries for: "${originalQuery}"`);
  const content = typeof result === 'string' ? result : JSON.stringify(result);
  
  console.log('🔍 Generated synonyms response:', content);
  
  let synonyms: string[] = [];
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const jsonData = JSON.parse(jsonMatch[0]);
      for (const key in jsonData) {
        if (jsonData.hasOwnProperty(key) && typeof jsonData[key] === 'string') {
          const synonym = jsonData[key].trim();
          if (synonym && synonym !== originalQuery) {
            synonyms.push(synonym);
          }
        }
      }
    }
  } catch (error) {
    synonyms = [`${originalQuery} analysis`, `${originalQuery} trends`, `${originalQuery} news`];
  }

  return {
    synonyms,
    originalQuery
  };
}

interface ExaResult {
  url: string;
  title: string;
  publishedDate?: string;
  query?: string;
}

// Helper: Batch process with rate limit and exponential backoff
async function batchProcessWithRateLimit<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
  minDelayMs: number = 1000,
  maxRetries: number = 4
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        let attempt = 0;
        let delay = 1000;
        while (true) {
          try {
            return await fn(item);
          } catch (err: any) {
            if (err?.response?.status === 429 || (err?.message && /rate.?limit/i.test(err.message))) {
              if (attempt < maxRetries) {
                attempt++;
                console.warn(`⏳ Rate limit hit, retrying in ${delay}ms (attempt ${attempt})...`);
                await new Promise(res => setTimeout(res, delay));
                delay *= 2;
                continue;
              }
            }
            // Other errors or max retries
            console.warn(`❌ Query failed after ${attempt} retries:`, err?.message || err);
            return null;
          }
        }
      })
    );
    results.push(...batchResults);
    if (i + batchSize < items.length) {
      await new Promise(res => setTimeout(res, minDelayMs));
    }
  }
  return results;
}

async function searchWithExa(queries: string[]): Promise<{ urls: string[], results: ExaResult[] }> {
  const exa = new Exa(process.env.EXA_API_KEY!);
  const searchOptions: any = {
    type: "auto",
    numResults: 3,
    text: false,
    summary: true
  };

  console.log(`\n🔍 Sending ${queries.length} queries to Exa (batching, max 5/sec):`);
  queries.forEach((query, index) => {
    console.log(`${index + 1}. "${query}"`);
  });
  console.log('');

  // Batch process with 5 per second
  const batchResults = await batchProcessWithRateLimit(
    queries,
    5,
    async (query) => {
      try {
        const result = await exa.searchAndContents(query, searchOptions);
        console.log(`✅ Query "${query}" returned ${result.results.length} results`);
        return result.results.map((item: any) => ({
          url: item.url,
          title: item.title || 'No Title',
          publishedDate: item.publishedDate || 'Unknown Date',
          query: query
        }));
      } catch (error) {
        console.log(`⚠️ Search failed for query: "${query}"`);
        return [];
      }
    },
    1000 // 1 second between batches
  );

  const allResults = batchResults.flat().filter(Boolean).flat();
  const uniqueResults = allResults.filter((result, index, self) => 
    index === self.findIndex(r => r.url === result.url)
  );
  const finalResults = uniqueResults.slice(0, 15);
  finalResults.sort((a, b) => {
    const dateA = new Date(a.publishedDate || '1900-01-01');
    const dateB = new Date(b.publishedDate || '1900-01-01');
    return dateB.getTime() - dateA.getTime();
  });
  console.log('\n📰 Found URLs sorted by publication date (newest first):');
  finalResults.forEach((result, index) => {
    const publishDate = result.publishedDate !== 'Unknown Date' ? 
      new Date(result.publishedDate!).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : 'Unknown Date';
    console.log(`${index + 1}. ${result.title}`);
    console.log(`   URL: ${result.url}`);
    console.log(`   Published: ${publishDate}`);
    console.log('');
  });
  return {
    urls: finalResults.map(r => r.url),
    results: finalResults
  };
}

function sortContentNaturally(contents: ScrapedContent[]): ScrapedContent[] {
  return contents
    .filter(content => content.metadata.relevanceScore >= 0.1)
    .sort((a, b) => b.metadata.relevanceScore - a.metadata.relevanceScore);
}

function createAnalysisPrompt(originalQuery: string, synonyms: string[], contents: ScrapedContent[]): string {
  const sortedContents = sortContentNaturally(contents);
  
  let prompt = `# Enhanced Multi-Query Cryptocurrency Analysis
**Original Query:** ${originalQuery}
**Analysis Date:** ${new Date().toLocaleDateString()}
**Total Queries:** ${synonyms.length + 1}
**Unique Sources:** ${sortedContents.length}

## Query Variations:
• Original: "${originalQuery}"
${synonyms.map((synonym, i) => `• Synonym ${i + 1}: "${synonym}"`).join('\n')}

## Source Analysis:

`;

  sortedContents.forEach((content, index) => {
    prompt += `### Source ${index + 1}: ${content.title}
**Publisher:** ${content.metadata.source} | **Relevance:** ${(content.metadata.relevanceScore * 100).toFixed(0)}%

**Content:**
${content.cleanedContent.substring(0, 1500)}${content.cleanedContent.length > 1500 ? '...' : ''}

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

async function generateFinalAnalysis(analysisPrompt: string): Promise<string> {
  const analysisSystemPrompt = `You are an expert cryptocurrency analyst with deep knowledge of market trends, technical analysis, and fundamental factors affecting digital asset prices. 

Your task is to provide comprehensive, actionable cryptocurrency analysis based on multiple sources and search queries.

## Analysis Guidelines:
1. **Synthesize Information**: Combine insights from all provided sources
2. **Technical Focus**: Include technical indicators, chart patterns, support/resistance levels when relevant
3. **Market Context**: Consider broader market conditions and trends
4. **Evidence-Based**: Reference specific sources and data points
5. **Actionable Insights**: Provide clear takeaways and potential implications
6. **Balanced Perspective**: Present both bullish and bearish viewpoints when applicable

## Response Format:
Provide a well-structured analysis that covers:
- **Executive Summary**: Key findings and current status
- **Technical Analysis**: Chart patterns, indicators, key levels (if applicable)
- **Market Drivers**: Fundamental factors and catalysts
- **Outlook**: Short-term and medium-term projections
- **Key Takeaways**: Actionable insights for traders/investors

Use clear markdown formatting and reference sources when making specific claims.`;

  const geminiAgent = await AgentBuilder
    .create("crypto_analyst")
    .withModel(google("gemini-2.5-flash"))
    .withDescription("Expert cryptocurrency analyst")
    .withInstruction(analysisSystemPrompt)
    .build();

  const result = await geminiAgent.runner.ask(analysisPrompt);
  return typeof result === 'string' ? result : JSON.stringify(result);
}

function extractCryptoTokens(query: string): Array<{name: string, patterns: RegExp[]}> {
  const cryptoPatterns = [
    // Major cryptocurrencies
    { name: 'bitcoin', patterns: [/bitcoin|btc(?!\w)/i] },
    { name: 'ethereum', patterns: [/ethereum|eth(?!\w)/i] },
    { name: 'solana', patterns: [/solana|sol(?!\w)/i] },
    { name: 'cardano', patterns: [/cardano|ada(?!\w)/i] },
    { name: 'polkadot', patterns: [/polkadot|dot(?!\w)/i] },
    { name: 'chainlink', patterns: [/chainlink|link(?!\w)/i] },
    { name: 'dogecoin', patterns: [/dogecoin|doge(?!\w)/i] },
    { name: 'shiba', patterns: [/shiba[\s\-\_]?inu|shib(?!\w)/i] },
    { name: 'avalanche', patterns: [/avalanche|avax(?!\w)/i] },
    { name: 'polygon', patterns: [/polygon|matic(?!\w)/i] },
    { name: 'uniswap', patterns: [/uniswap|uni(?!\w)/i] },
    { name: 'litecoin', patterns: [/litecoin|ltc(?!\w)/i] },
    { name: 'binance', patterns: [/binance[\s\-\_]?coin|bnb(?!\w)/i] },
    { name: 'ripple', patterns: [/ripple|xrp(?!\w)/i] },
    { name: 'stellar', patterns: [/stellar|xlm(?!\w)/i] },
    { name: 'tron', patterns: [/tron|trx(?!\w)/i] },
    { name: 'monero', patterns: [/monero|xmr(?!\w)/i] },
    { name: 'zcash', patterns: [/zcash|zec(?!\w)/i] },
    { name: 'dash', patterns: [/dash(?!\w)/i] },
    { name: 'algorand', patterns: [/algorand|algo(?!\w)/i] },
    { name: 'cosmos', patterns: [/cosmos|atom(?!\w)/i] },
    { name: 'tezos', patterns: [/tezos|xtz(?!\w)/i] },
    { name: 'near', patterns: [/near[\s\-\_]?protocol|near(?!\w)/i] },
    { name: 'fantom', patterns: [/fantom|ftm(?!\w)/i] },
    { name: 'harmony', patterns: [/harmony|one(?!\w)/i] },
    { name: 'elrond', patterns: [/elrond|egld(?!\w)/i] },
    { name: 'terra', patterns: [/terra|luna(?!\w)/i] },
    { name: 'icp', patterns: [/internet[\s\-\_]?computer|icp(?!\w)/i] },
    { name: 'flow', patterns: [/flow(?!\w)/i] },
    { name: 'hedera', patterns: [/hedera|hbar(?!\w)/i] },
    { name: 'vechain', patterns: [/vechain|vet(?!\w)/i] },
    { name: 'theta', patterns: [/theta(?!\w)/i] },
    { name: 'filecoin', patterns: [/filecoin|fil(?!\w)/i] },
    { name: 'decentraland', patterns: [/decentraland|mana(?!\w)/i] },
    { name: 'sandbox', patterns: [/sandbox|sand(?!\w)/i] },
    { name: 'axie', patterns: [/axie[\s\-\_]?infinity|axs(?!\w)/i] },
    { name: 'enjin', patterns: [/enjin|enj(?!\w)/i] },
    { name: 'chiliz', patterns: [/chiliz|chz(?!\w)/i] },
    { name: 'basic_attention', patterns: [/basic[\s\-\_]?attention[\s\-\_]?token|bat(?!\w)/i] },
    { name: 'compound', patterns: [/compound|comp(?!\w)/i] },
    { name: 'maker', patterns: [/maker|mkr(?!\w)/i] },
    { name: 'aave', patterns: [/aave(?!\w)/i] },
    { name: 'sushi', patterns: [/sushiswap|sushi(?!\w)/i] },
    { name: 'curve', patterns: [/curve[\s\-\_]?dao|crv(?!\w)/i] },
    { name: 'yearn', patterns: [/yearn[\s\-\_]?finance|yfi(?!\w)/i] },
    { name: 'synthetix', patterns: [/synthetix|snx(?!\w)/i] },
    { name: 'iq', patterns: [/iq[\s\-\_]?token|iq.*crypto|everipedia|iq(?!\w)/i] },
    { name: 'pear', patterns: [/pear[\s\-\_]?protocol|pear[\s\-\_]?token|pearusdt|pear.*crypto|pear(?!\w)/i] },
  ];
  
  const detectedTokens = cryptoPatterns.filter(crypto => 
    crypto.patterns.some(pattern => pattern.test(query))
  );
  
  if (detectedTokens.length === 0) {
    const words = query.toLowerCase().match(/\b[a-z]{2,20}\b/g) || [];
    const potentialTokens = words.filter(word => 
      word.length >= 2 && word.length <= 10 && 
      !['the', 'and', 'for', 'with', 'analysis', 'technical', 'price', 'token', 'coin', 'crypto', 'cryptocurrency'].includes(word)
    );
    
    return potentialTokens.map(token => ({
      name: token,
      patterns: [new RegExp(`\\b${token}\\b|${token}usdt|${token}usd|${token}.*crypto`, 'i')]
    }));
  }
  
  return detectedTokens;
}

async function searchForMissingTokens(missingTokens: Array<{name: string, patterns: RegExp[]}>, existingUrls: string[]): Promise<ScrapedContent[]> {
  console.log(`\n🔄 Searching for missing tokens: ${missingTokens.map(t => t.name).join(', ')}`);

  const exa = new Exa(process.env.EXA_API_KEY!);
  const scraper = new UniversalScraper();
  const additionalContents: ScrapedContent[] = [];
  
  for (const token of missingTokens) {
    const specificQueries = [
      `${token.name} cryptocurrency price analysis July 2025`,
      `${token.name} token market trends technical analysis`,
      `${token.name} crypto price prediction 2025`,
      `${token.name} digital asset trading signals`,
      `${token.name} blockchain token analysis`
    ];
    
    console.log(`🔍 Searching specifically for ${token.name}...`);
    
    for (const query of specificQueries) {
      try {
        const result = await exa.searchAndContents(query, {
          type: "auto",
          numResults: 2,
          summary: true
        });
        
        console.log(`✅ Specific search "${query}" returned ${result.results.length} results`);
        
        for (const item of result.results) {
          if (existingUrls.includes(item.url)) {
            continue;
          }
          
          try {
            const scrapedContent = await scraper.scrapeUrl(item.url);
            const hasTokenContent = token.patterns.some(pattern => 
              pattern.test(scrapedContent.title + ' ' + scrapedContent.cleanedContent)
            );
            
            if (hasTokenContent) {
              additionalContents.push(scrapedContent);
              existingUrls.push(item.url);
              console.log(`✅ Found relevant content for ${token.name}: ${scrapedContent.title}`);
              break;
            } else {
              console.log(`⚠️ Content doesn't contain ${token.name} information, skipping...`);
            }
          } catch (error) {
            console.log(`❌ Failed to scrape ${item.url}`);
          }
        }
        
        if (additionalContents.some(content => 
          token.patterns.some(pattern => 
            pattern.test(content.title + ' ' + content.cleanedContent)
          )
        )) {
          break;
        }
      } catch (error) {
        console.log(`⚠️ Specific search failed for: "${query}"`);
      }
    }
  }
  
  return additionalContents;
}

async function main() {
  try {
    console.log(`Processing query: "${userQuery}"`);
    
    const synonymResponse = await generateSynonyms(userQuery);
    console.log(`Total synonyms parsed from model: ${synonymResponse.synonyms.length}`);
    console.log('📝 Synonyms:', synonymResponse.synonyms);
    const searchQueries = [userQuery, ...synonymResponse.synonyms];
    console.log(`Will send ${searchQueries.length} queries to Exa (including original query).`);
    const searchResult = await searchWithExa(searchQueries);
    console.log(`Found ${searchResult.urls.length} URLs`);
    
    const scraper = new UniversalScraper();
    let scrapedContents = await scraper.scrapeMultiple(searchResult.urls);
    console.log(`Scraped ${scrapedContents.length} sources successfully`);
    
    if (scrapedContents.length < searchResult.urls.length) {
      console.log(`⚠️ Failed to scrape ${searchResult.urls.length - scrapedContents.length} URLs`);
    }

    const detectedTokens = extractCryptoTokens(userQuery);
    console.log(`🔍 Detected tokens from query: ${detectedTokens.map(t => t.name).join(', ')}`);
    
    const tokenCoverage: {[key: string]: number} = {};
    detectedTokens.forEach(token => {
      const count = scrapedContents.filter(c => 
        token.patterns.some(pattern => 
          pattern.test(c.title + ' ' + c.cleanedContent)
        )
      ).length;
      tokenCoverage[token.name] = count;
    });
    console.log('🎯 Initial token coverage in scraped content:', tokenCoverage);
    
    const missingTokens = detectedTokens.filter(token => {
      const coverage = tokenCoverage[token.name] || 0;
      return coverage === 0;
    });
    
    if (missingTokens.length > 0) {
      console.log(`\n⚠️ Found ${missingTokens.length} tokens with insufficient coverage. Searching specifically...`);
      const existingUrls = searchResult.urls.slice();
      const additionalContents = await searchForMissingTokens(missingTokens, existingUrls);
      
      if (additionalContents.length > 0) {
        scrapedContents = [...scrapedContents, ...additionalContents];
        console.log(`✅ Added ${additionalContents.length} additional sources for missing tokens`);
        
        detectedTokens.forEach(token => {
          const count = scrapedContents.filter(c => 
            token.patterns.some(pattern => 
              pattern.test(c.title + ' ' + c.cleanedContent)
            )
          ).length;
          tokenCoverage[token.name] = count;
        });
        console.log('🎯 Updated token coverage after additional searches:', tokenCoverage);
      } else {
        console.log(`⚠️ No additional relevant content found for missing tokens`);
      }
    } else {
      console.log(`✅ All tokens have adequate coverage`);
    }
    
    const analysisPrompt = createAnalysisPrompt(userQuery, synonymResponse.synonyms, scrapedContents);
    console.log('\n🔬 Starting final analysis with Gemini...');
    const finalAnalysis = await generateFinalAnalysis(analysisPrompt);
    
    console.log("\n=== FINAL ANALYSIS ===");
    console.log(finalAnalysis);
    
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
