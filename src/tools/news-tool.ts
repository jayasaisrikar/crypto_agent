import { BaseTool, ToolContext } from "@iqai/adk";
import { Type } from "@google/genai";
import axios from 'axios';
import * as cheerio from 'cheerio';

export class NewsTool extends BaseTool {
  constructor() {
    super({
      name: "crypto_news_headlines",
      description: "Fetch recent cryptocurrency news headlines from major sources"
    });
  }

  getDeclaration() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: Type.OBJECT,
        properties: {},
        required: []
      }
    };
  }

  async runAsync(args: {}, context: ToolContext) {
    const newsSources = [
      { name: "CoinDesk", url: "https://www.coindesk.com/", selector: "h3.headline" },
      { name: "CoinTelegraph", url: "https://cointelegraph.com/", selector: "h3, .post-card-inline__title" },
      { name: "Decrypt", url: "https://decrypt.co/", selector: "h2, h3" }
    ];

    const allNews = [];
    
    for (const source of newsSources) {
      try {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const response = await axios.get(source.url, {
          timeout: 15000,
          maxContentLength: 10 * 1024 * 1024,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive'
          }
        });
        
        const $ = cheerio.load(response.data);
        const headlines = $(source.selector)
          .slice(0, 5)
          .map((i, el) => $(el).text().trim())
          .get()
          .filter(headline => {
            const text = headline.toLowerCase();
            return headline.length > 10 && (text.includes('crypto') || text.includes('bitcoin') || text.includes('ethereum'));
          });
        
        allNews.push({
          source: source.name,
          headlines: headlines,
          count: headlines.length
        });
        
      } catch (error) {
        allNews.push({
          source: source.name,
          headlines: [`Unable to fetch from ${source.name}`],
          count: 0
        });
      }
    }
    
    const timestamp = new Date().toISOString();
    const totalHeadlines = allNews.reduce((sum, source) => sum + source.count, 0);
    
    return { 
      success: true,
      timestamp: timestamp,
      sources: allNews,
      totalHeadlines: totalHeadlines,
      summary: `Retrieved ${totalHeadlines} crypto news headlines from ${allNews.length} sources at ${timestamp}`
    };
  }
}
