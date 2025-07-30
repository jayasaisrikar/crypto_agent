import { AgentBuilder } from '@iqai/adk';
import { openai } from '@ai-sdk/openai';
import 'dotenv/config';

export interface SynonymOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  numSynonyms?: number;
}

export interface SynonymResponse {
  synonyms: string[];
  originalQuery: string;
  model: string;
  processingTime: number;
}

export class SynonymGenerator {
  private defaultModel = 'gpt-4o';

  constructor() {
    // No longer needs API key parameter - uses environment variables
  }

  private getSystemInstruction(): string {
    const currentFullDate = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    return `You are a helpful assistant specialized in cryptocurrency insights. Your task is to generate synonym search queries based on the user's question, but only if the question is related to cryptocurrencies like Bitcoin, Ethereum, or any crypto tickers (such as BTC, ETH, SOL, etc.).

Today's date is ${currentFullDate}. Use today's date, month or year if the question requires the latest events and news.

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
  }

  async generateSynonyms(originalQuery: string, options: SynonymOptions = {}): Promise<SynonymResponse> {
    const startTime = Date.now();
    const { temperature = 0.4, maxTokens = 200 } = options;

    try {
      const openaiModel = openai(this.defaultModel);

      const agent = await AgentBuilder
        .create("synonym_generator")
        .withModel(openaiModel)
        .withDescription("An agent specialized in generating cryptocurrency-related synonym queries")
        .withInstruction(this.getSystemInstruction())
        .build();

      const result = await agent.runner.ask(`Generate synonym search queries for: "${originalQuery}"`);

      const content = typeof result === 'string' ? result : JSON.stringify(result);
      const synonyms = this.parseSynonyms(content, originalQuery);

      return {
        synonyms,
        originalQuery,
        model: this.defaultModel,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      console.error('Error generating synonyms:', error);
      return {
        synonyms: this.generateBasicSynonyms(originalQuery),
        originalQuery,
        model: 'fallback',
        processingTime: Date.now() - startTime
      };
    }
  }

  private parseSynonyms(content: string, originalQuery: string): string[] {
    const synonyms: string[] = [];

    try {
      // Try to parse as JSON first
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
    } catch (jsonError) {
      const lines = content.split('\n');
      for (const line of lines) {
        const match = line.trim().match(/^\d+\.\s*"?(.+?)"?$/);
        if (match) {
          const synonym = match[1].trim();
          if (synonym && synonym !== originalQuery) {
            synonyms.push(synonym);
          }
        }
      }
    }

    return synonyms.length > 0 ? synonyms.slice(0, 8) : this.generateBasicSynonyms(originalQuery);
  }

  private generateBasicSynonyms(query: string): string[] {
    const currentMonth = new Date().toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    });

    return [
      `Crypto trends related to ${query} ${currentMonth}`,
      `${query} news update ${currentMonth}`,
      `${query} current price analysis`,
      `Factors impacting ${query} ${currentMonth}`
    ].slice(0, 4);
  }

  async generateBatchSynonyms(queries: string[], options: SynonymOptions = {}): Promise<SynonymResponse[]> {
    return Promise.all(queries.map(query => this.generateSynonyms(query, options)));
  }

  static getAllUniqueQueries(responses: SynonymResponse[]): string[] {
    const all = new Set<string>();
    responses.forEach(r => {
      all.add(r.originalQuery);
      r.synonyms.forEach(s => all.add(s));
    });
    return Array.from(all);
  }
}

// Convenience function for easy import
export async function generateSynonyms(query: string, options: SynonymOptions = {}): Promise<SynonymResponse> {
  const generator = new SynonymGenerator();
  return generator.generateSynonyms(query, options);
}
