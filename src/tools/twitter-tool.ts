import { BaseTool, ToolContext } from "@iqai/adk";
import { Type } from "@google/genai";
import { TwitterApi } from "twitter-api-v2";

export class TwitterTool extends BaseTool {
  constructor() {
    super({
      name: "twitter",
      description: "Get cryptocurrency-related tweets and social sentiment"
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
    try {
      if (!process.env.TWITTER_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN === 'your_twitter_bearer_token_here') {
        return {
          success: false,
          error: "Twitter API key not configured",
          tweets: [],
          sentiment: "API not available"
        };
      }

      const client = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);
      const resp = await client.v2.search("#crypto OR #bitcoin", { max_results: 100 });
      return { 
        success: true,
        tweets: resp.data || [],
        sentiment: "mixed" 
      };
    } catch (error) {
      return {
        success: false,
        error: `Twitter API error: ${error instanceof Error ? error.message : String(error)}`,
        tweets: [],
        sentiment: "API not available"
      };
    }
  }
}
