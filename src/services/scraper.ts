import axios from 'axios';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { URL } from 'url';
import * as fs from 'fs';
import * as path from 'path';

export interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  cleanedContent: string;
  metadata: {
    author?: string;
    publishDate?: string;
    source: string;
    wordCount: number;
    readingTime: number;
    relevanceScore: number;
    method: string;
  };
  tags: string[];
}

export class UniversalScraper {
  private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
  private options: {
    timeout?: number;
    maxContentLength?: number;
    includeImages?: boolean;
  };
  private scrapedContentArray: any[] = []; // Store all scraped content

  constructor(options: { timeout?: number; maxContentLength?: number; includeImages?: boolean } = {}) {
    this.options = {
      timeout: options.timeout || 10000,
      maxContentLength: options.maxContentLength || 50000,
      includeImages: options.includeImages || false
    };
  }

  async scrapeMultiple(urls: string[]): Promise<ScrapedContent[]> {
    const results = await Promise.allSettled(
      urls.map(url => this.scrapeUrl(url))
    );
    
    const scrapedResults = results
      .filter((result): result is PromiseFulfilledResult<ScrapedContent> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value);

    // Save all scraped content to a single JSON file
    if (scrapedResults.length > 0) {
      this.saveAllScrapedContentToFile();
    }

    return scrapedResults;
  }

  async scrapeUrl(url: string): Promise<ScrapedContent> {
    // Run all 4 methods in parallel
    const [axiosCheerio, playwrightCheerio, axiosReadability, playwrightReadability] = await Promise.allSettled([
      this.axiosCheerio(url),
      this.playwrightCheerio(url),
      this.axiosReadability(url),
      this.playwrightReadability(url)
    ]);

    // Get successful results
    const results = [
      { method: 'axios-cheerio', result: axiosCheerio },
      { method: 'playwright-cheerio', result: playwrightCheerio },
      { method: 'axios-readability', result: axiosReadability },
      { method: 'playwright-readability', result: playwrightReadability }
    ].filter(r => r.result.status === 'fulfilled' && (r.result as PromiseFulfilledResult<any>).value.content)
     .map(r => ({ ...(r.result as PromiseFulfilledResult<any>).value, method: r.method }));

    if (!results.length) throw new Error('All methods failed');

    // Select result with max char count
    const best = results.reduce((max, curr) => 
      curr.content.length > max.content.length ? curr : max
    );

    console.log(`Best: ${best.method} (${best.content.length} chars)`);

    return this.buildScrapedContent(url, best.content, best.html, best.method);
  }

  private async axiosCheerio(url: string) {
    try {
      const { data } = await axios.get(url, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 10000
      });
      const content = this.extractContentCheerio(data);
      return { content, html: data };
    } catch {
      return { content: '', html: '' };
    }
  }

  private async playwrightCheerio(url: string) {
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(url, { timeout: 15000 });
      const html = await page.content();
      const content = this.extractContentCheerio(html);
      return { content, html };
    } catch {
      return { content: '', html: '' };
    } finally {
      if (browser) await browser.close();
    }
  }

  private async axiosReadability(url: string) {
    try {
      const { data } = await axios.get(url, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 10000
      });
      const content = this.extractContentReadability(data, url);
      return { content, html: data };
    } catch {
      return { content: '', html: '' };
    }
  }

  private async playwrightReadability(url: string) {
    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(url, { timeout: 15000 });
      const html = await page.content();
      const content = this.extractContentReadability(html, url);
      return { content, html };
    } catch {
      return { content: '', html: '' };
    } finally {
      if (browser) await browser.close();
    }
  }

  private extractContentCheerio(html: string): string {
    const $ = cheerio.load(html);
    $('script, style, nav, header, footer, aside').remove();
    
    const selectors = ['article', '.article-content', '.post-content', 'main', '.content'];
    for (const selector of selectors) {
      const content = $(selector).first().text().trim();
      if (content.length > 100) return content;
    }
    
    return $('p').map((_, el) => $(el).text().trim()).get().join('\n\n');
  }

  private extractContentReadability(html: string, url: string): string {
    try {
      const doc = new JSDOM(html, { url });
      const reader = new Readability(doc.window.document);
      const article = reader.parse();
      return article?.textContent || '';
    } catch {
      return '';
    }
  }

  private buildScrapedContent(url: string, content: string, html: string, method: string): ScrapedContent {
    const $ = cheerio.load(html);
    const title = $('h1, title').first().text().trim() || 'Untitled';
    const author = $('.author, .byline').first().text().trim();
    const publishDate = this.extractPublishDate($, content);
    const cleanedContent = this.cleanContent(content);
    const wordCount = cleanedContent.split(/\s+/).length;
    const source = new URL(url).hostname.replace('www.', '');

    const scrapedResult = {
      url,
      title,
      content,
      cleanedContent,
      metadata: {
        author: author || undefined,
        publishDate,
        source,
        wordCount,
        readingTime: Math.ceil(wordCount / 200),
        relevanceScore: this.calculateRelevance(cleanedContent, title),
        method
      },
      tags: this.extractTags(cleanedContent, title)
    };

    // Add to the array for later batch saving
    this.addToScrapedContentArray(scrapedResult);

    return scrapedResult;
  }

  private addToScrapedContentArray(scrapedContent: ScrapedContent): void {
    const jsonData = {
      timestamp: scrapedContent.metadata.publishDate || new Date().toISOString(), // Use article publish date or fallback to current time
      scrapedAt: new Date().toISOString(), // When we scraped it
      url: scrapedContent.url,
      title: scrapedContent.title,
      source: scrapedContent.metadata.source,
      method: scrapedContent.metadata.method,
      wordCount: scrapedContent.metadata.wordCount,
      relevanceScore: scrapedContent.metadata.relevanceScore,
      tags: scrapedContent.tags,
      author: scrapedContent.metadata.author,
      publishDate: scrapedContent.metadata.publishDate,
      readingTime: scrapedContent.metadata.readingTime,
      contentPreview: scrapedContent.cleanedContent.substring(0, 500) + (scrapedContent.cleanedContent.length > 500 ? '...' : ''),
      fullContent: scrapedContent.cleanedContent
    };

    this.scrapedContentArray.push(jsonData);
    console.log(`📰 SCRAPED CONTENT added to batch: ${scrapedContent.metadata.source} (${scrapedContent.metadata.publishDate || 'no date'})`);
  }

  private saveAllScrapedContentToFile(): void {
    try {
      // Create scraped-content directory if it doesn't exist
      const scrapedDir = path.join(process.cwd(), 'scraped-content');
      if (!fs.existsSync(scrapedDir)) {
        fs.mkdirSync(scrapedDir, { recursive: true });
      }

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
      const filename = `scraped-content-batch-${timestamp}.json`;
      const filepath = path.join(scrapedDir, filename);

      // Prepare final JSON structure
      const finalJsonData = {
        batchTimestamp: new Date().toISOString(),
        totalScrapedUrls: this.scrapedContentArray.length,
        summary: {
          sources: [...new Set(this.scrapedContentArray.map(item => item.source))],
          totalWordCount: this.scrapedContentArray.reduce((sum, item) => sum + item.wordCount, 0),
          averageRelevanceScore: this.scrapedContentArray.reduce((sum, item) => sum + item.relevanceScore, 0) / this.scrapedContentArray.length,
          methods: [...new Set(this.scrapedContentArray.map(item => item.method))]
        },
        scrapedContent: this.scrapedContentArray
      };

      // Write to JSON file
      fs.writeFileSync(filepath, JSON.stringify(finalJsonData, null, 2), 'utf8');
      console.log(`📰 BATCH SCRAPED CONTENT saved to: ${filename}`);
      console.log(`📊 Total URLs scraped: ${this.scrapedContentArray.length}`);
      console.log(`📊 Total words: ${finalJsonData.summary.totalWordCount.toLocaleString()}`);

      // Clear the array for next batch
      this.scrapedContentArray = [];

    } catch (error) {
      console.error(`❌ Error saving batch scraped content to file:`, error);
    }
  }

  private cleanContent(content: string): string {
    return content
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim()
      .substring(0, this.options.maxContentLength || 50000);
  }

  private calculateRelevance(content: string, title: string): number {
    const text = (content + ' ' + title).toLowerCase();
    const keywords = ['bitcoin', 'ethereum', 'crypto', 'blockchain', 'defi', 'nft'];
    const score = keywords.reduce((acc, word) => 
      acc + (text.match(new RegExp(word, 'g'))?.length || 0), 0
    );
    return Math.min(score / 10, 1.0);
  }

  private extractTags(content: string, title: string): string[] {
    const text = (content + ' ' + title).toLowerCase();
    const tags = [];
    
    if (text.includes('bitcoin')) tags.push('BTC');
    if (text.includes('ethereum')) tags.push('ETH');
    if (text.match(/bull|surge|rally/)) tags.push('BULLISH');
    if (text.match(/bear|crash|drop/)) tags.push('BEARISH');
    
    return tags;
  }

  private extractPublishDate($: any, content: string): string | undefined {
    try {
      // Try various common selectors for publish date
      const dateSelectors = [
        'time[datetime]',
        '[datetime]',
        '.published-date',
        '.publish-date',
        '.date-published',
        '.article-date',
        '.post-date',
        '.entry-date',
        '.publication-date',
        '.timestamp',
        'meta[property="article:published_time"]',
        'meta[name="publishdate"]',
        'meta[name="date"]'
      ];

      for (const selector of dateSelectors) {
        const element = $(selector).first();
        if (element.length) {
          let dateValue = element.attr('datetime') || element.attr('content') || element.text().trim();
          if (dateValue) {
            const parsedDate = new Date(dateValue);
            if (!isNaN(parsedDate.getTime())) {
              return parsedDate.toISOString();
            }
          }
        }
      }

      // Try to extract from content using regex patterns
      const datePatterns = [
        /Posted:\s*([A-Za-z]+ \d{1,2}, \d{4})/i,
        /Published:\s*([A-Za-z]+ \d{1,2}, \d{4})/i,
        /Date:\s*(\d{4}-\d{2}-\d{2})/i,
        /(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})/i,
        /([A-Za-z]+ \d{1,2}, \d{4})/i
      ];

      for (const pattern of datePatterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          const parsedDate = new Date(match[1]);
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate.toISOString();
          }
        }
      }

      return undefined;
    } catch (error) {
      console.warn('Error extracting publish date:', error);
      return undefined;
    }
  }
}

export class ContentCleaner {
  /**
   * Sorts scraped content naturally in descending order of importance
   * Priority: 1) Relevance score (desc), 2) Publish date (newest first), 3) Title (alphabetic)
   */
  static sortContentNaturally(contents: ScrapedContent[]): ScrapedContent[] {
    return contents.sort((a, b) => {
      // First sort by relevance score (descending)
      const relevanceDiff = b.metadata.relevanceScore - a.metadata.relevanceScore;
      if (Math.abs(relevanceDiff) > 0.01) return relevanceDiff;
      
      // Then by publish date (most recent first)
      const aDate = a.metadata.publishDate ? new Date(a.metadata.publishDate).getTime() : 0;
      const bDate = b.metadata.publishDate ? new Date(b.metadata.publishDate).getTime() : 0;
      const dateDiff = bDate - aDate;
      if (dateDiff !== 0) return dateDiff;
      
      // Finally by title alphabetically
      return a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  static filterByRelevance(contents: ScrapedContent[], minRelevance: number = 0.2): ScrapedContent[] {
    const filtered = contents.filter(content => content.metadata.relevanceScore >= minRelevance);
    const sorted = this.sortContentNaturally(filtered);
    
    console.log(`📊 Sorted ${sorted.length} scraped contents by relevance (desc), date (newest), title (alpha)`);
    if (sorted.length > 0) {
      console.log(`   Top source: "${sorted[0].title}" (${(sorted[0].metadata.relevanceScore * 100).toFixed(0)}% relevance)`);
    }
    
    return sorted;
  }

  static cleanForPrompt(content: ScrapedContent): string {
    return `**${content.title}** (${content.metadata.source})
Relevance: ${(content.metadata.relevanceScore * 100).toFixed(0)}%
Content: ${content.cleanedContent.substring(0, 1500)}${content.cleanedContent.length > 1500 ? '...' : ''}`;
  }

  static extractKeyInsights(contents: ScrapedContent[]): string[] {
    const sortedContents = this.sortContentNaturally([...contents]);
    const insights: string[] = [];
    
    for (const content of sortedContents) {
      const text = content.cleanedContent.toLowerCase();
      const title = content.title.toLowerCase();
      
      // Price movement insights
      if (text.match(/price.*(?:surge|jump|rally|pump|moon)/i)) {
        insights.push(`${content.metadata.source}: Reports significant price increases`);
      }
      if (text.match(/price.*(?:drop|crash|fall|dump|plummet)/i)) {
        insights.push(`${content.metadata.source}: Reports significant price decreases`);
      }
      
      // Market sentiment
      if (text.match(/bull.*market|bullish.*sentiment/i)) {
        insights.push(`${content.metadata.source}: Indicates bullish market sentiment`);
      }
      if (text.match(/bear.*market|bearish.*sentiment/i)) {
        insights.push(`${content.metadata.source}: Indicates bearish market sentiment`);
      }
      
      // Key developments
      if (text.match(/adoption|institutional|etf|regulation/i)) {
        insights.push(`${content.metadata.source}: Covers institutional/regulatory developments`);
      }
      if (text.match(/technical.*analysis|support|resistance|chart/i)) {
        insights.push(`${content.metadata.source}: Provides technical analysis perspective`);
      }
    }
    
    // Remove duplicates and limit to top insights
    return [...new Set(insights)].slice(0, 8);
  }

  static summarizeForContext(contents: ScrapedContent[]): string {
    const sortedContents = this.sortContentNaturally([...contents]);
    const totalSources = sortedContents.length;
    const avgRelevance = sortedContents.reduce((sum, c) => sum + c.metadata.relevanceScore, 0) / totalSources;
    const totalWords = sortedContents.reduce((sum, c) => sum + c.metadata.wordCount, 0);
    
    const publishers = [...new Set(sortedContents.map(c => c.metadata.source))];
    const tags = [...new Set(sortedContents.flatMap(c => c.tags))];
    
    return `Analysis based on ${totalSources} sources from ${publishers.length} publishers (${publishers.join(', ')}). 
Average relevance: ${(avgRelevance * 100).toFixed(0)}%. Total content: ${totalWords.toLocaleString()} words.
Key topics: ${tags.join(', ')}`;
  }
}