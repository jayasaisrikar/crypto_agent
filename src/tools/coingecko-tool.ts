import { BaseTool, ToolContext } from "@iqai/adk";
import { Type } from "@google/genai";

export class CoingeckoTool extends BaseTool {
  private coinGecko: any;

  constructor() {
    super({
      name: "coingecko",
      description: "Get cryptocurrency prices and market data from CoinGecko"
    });
  }

  private async initCoinGecko() {
    if (!this.coinGecko) {
      const CoinGecko = (await import("coingecko-api")).default;
      this.coinGecko = new CoinGecko();
    }
    return this.coinGecko;
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
    try {
      const client = await this.initCoinGecko();
      const majorCoins = ["bitcoin", "ethereum", "binancecoin", "cardano", "solana"];
      
      console.log("Fetching live cryptocurrency market data...");
      const priceData = await client.simple.price({
        ids: majorCoins,
        vs_currencies: ["usd"],
        include_24hr_change: true,
        include_market_cap: true,
        include_24hr_vol: true,
        include_last_updated_at: true
      });
      
      let trendingData;
      try {
        trendingData = await client.search.trending();
      } catch (error) {
        trendingData = { data: { coins: [] } };
      }
      let globalData;
      try {
        globalData = await client.global();
      } catch (error) {
        globalData = { data: null };
      }
      
      const timestamp = new Date().toISOString();
      
      return { 
        success: true,
        timestamp: timestamp,
        prices: priceData?.data || {}, 
        trending: trendingData?.data || { coins: [] },
        global: globalData?.data || null,
        summary: `Live market data retrieved at ${timestamp} for ${majorCoins.length} major cryptocurrencies`
      };
    } catch (error) {
      const timestamp = new Date().toISOString();
      return {
        success: false,
        timestamp: timestamp,
        error: `CoinGecko API error: ${error instanceof Error ? error.message : String(error)}`,
        prices: {},
        trending: { coins: [] },
        global: null,
        summary: `Failed to retrieve market data at ${timestamp}`
      };
    }
  }
}
