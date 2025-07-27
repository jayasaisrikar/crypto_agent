import { promises as fs } from 'fs';
import { join } from 'path';
import { EmbeddingsService, SearchResult } from './services/embeddings.js';

const DB_PATH = './data';
const CONTEXT_FILE = join(DB_PATH, 'context.json');
const STATE_FILE = join(DB_PATH, 'state.json');

export interface NewsContext {
  id: string;
  url: string;
  headline: string;
  content: string;
  timestamp: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  relevantTickers: string[];
}

export interface MarketState {
  sessionId: string;
  timestamp: string;
  phase: 'data' | 'price_analysis' | 'fundamentals' | 'dynamics' | 'conclusion' | 'complete';
  data: {
    prices?: any;
    news?: NewsContext[];
    price_analysis?: string;
    fundamentals?: string;
    dynamics?: string;
    conclusion?: string;
    sentiment?: any;
    analysis?: string;
    strategy?: string;
    risk?: string;
  };
  metadata: {
    user?: string;
    requestType: string;
    request?: string;
  };
}

class EnhancedStateManager {
  private embeddings: EmbeddingsService;
  private isEmbeddingsEnabled: boolean = false;

  constructor() {
    this.embeddings = new EmbeddingsService();
    this.initEmbeddings();
  }

  private async initEmbeddings() {
    try {
      await this.embeddings.initializeCollection();
      const stats = await this.embeddings.getStats();
      this.isEmbeddingsEnabled = stats.enabled || false;
      
      if (this.isEmbeddingsEnabled) {
        // Embeddings available
      } else {
        // Using fallback mode
      }
    } catch (error) {
      this.isEmbeddingsEnabled = false;
    }
  }

  async init() {
    await fs.mkdir(DB_PATH, { recursive: true });
    if (!this.isEmbeddingsEnabled) {
      await this.initEmbeddings();
    }
  }

  async getContext(days = 2): Promise<NewsContext[]> {
    try {
      const data = await fs.readFile(CONTEXT_FILE, 'utf8');
      const contexts: NewsContext[] = JSON.parse(data);
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      return contexts.filter(c => new Date(c.timestamp) > cutoff);
    } catch {
      return [];
    }
  }

  async getRelevantContext(
    query: string,
    sessionId?: string,
    symbol?: string,
    limit: number = 10
  ): Promise<{
    semanticResults: SearchResult[];
    traditionalResults: NewsContext[];
  }> {
    const results = {
      semanticResults: [] as SearchResult[],
      traditionalResults: [] as NewsContext[],
    };

    if (this.isEmbeddingsEnabled) {
      try {
        results.semanticResults = await this.embeddings.getRelevantContext(
          query,
          sessionId,
          symbol,
          limit
        );
      } catch (error) {
        console.warn('⚠️ Semantic search failed, falling back to traditional search');
      }
    }

    results.traditionalResults = await this.getContext(7);
    
    if (symbol) {
      results.traditionalResults = results.traditionalResults.filter(
        ctx => ctx.relevantTickers.includes(symbol.toUpperCase())
      );
    }

    return results;
  }

  async addContext(context: NewsContext): Promise<void> {
    const contexts = await this.getContext(30);
    contexts.push(context);
    await fs.writeFile(CONTEXT_FILE, JSON.stringify(contexts, null, 2));

    if (this.isEmbeddingsEnabled) {
      try {
        await this.embeddings.storeNewsArticle(
          `${context.headline}\n\n${context.content}`,
          {
            source: context.url,
            sentiment: context.sentiment === 'bullish' ? 'positive' : 
                     context.sentiment === 'bearish' ? 'negative' : 'neutral',
            symbol: context.relevantTickers[0],
          }
        );
      } catch (error) {
        console.warn('⚠️ Failed to store context in embeddings:', error);
      }
    }
  }

  async saveState(state: MarketState): Promise<void> {
    const states = await this.getStates();
    const existing = states.findIndex(s => s.sessionId === state.sessionId);
    if (existing >= 0) {
      states[existing] = state;
    } else {
      states.push(state);
    }
    await fs.writeFile(STATE_FILE, JSON.stringify(states, null, 2));

    if (this.isEmbeddingsEnabled && state.data.analysis) {
      try {
        await this.embeddings.storeAnalysisContext(
          state.data.analysis,
          state.sessionId,
          state.metadata.requestType
        );
      } catch (error) {
        console.warn('⚠️ Failed to store analysis in embeddings:', error);
      }
    }
  }

  async getState(sessionId: string): Promise<MarketState | null> {
    const states = await this.getStates();
    return states.find(s => s.sessionId === sessionId) || null;
  }

  private async getStates(): Promise<MarketState[]> {
    try {
      const data = await fs.readFile(STATE_FILE, 'utf8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async getContextualInsights(
    query: string,
    sessionId: string,
    symbol: string
  ): Promise<{
    insights: string[];
    sources: string[];
    confidence: number;
  }> {
    const context = await this.getRelevantContext(query, sessionId, symbol, 15);
    
    const insights: string[] = [];
    const sources: string[] = [];
    let totalScore = 0;
    let count = 0;

    for (const result of context.semanticResults) {
      if (result.score > 0.5) {
        insights.push(result.document.content.substring(0, 200) + '...');
        sources.push(result.document.metadata.source || 'Internal Analysis');
        totalScore += result.score;
        count++;
      }
    }

    if (insights.length < 3) {
      for (const ctx of context.traditionalResults.slice(0, 5)) {
        insights.push(`${ctx.headline}: ${ctx.content.substring(0, 150)}...`);
        sources.push(ctx.url);
        totalScore += 0.6;
        count++;
      }
    }

    const confidence = count > 0 ? totalScore / count : 0;

    return {
      insights: insights.slice(0, 10),
      sources: [...new Set(sources)],
      confidence: Math.min(confidence, 1.0),
    };
  }

  async getEmbeddingsStats(): Promise<any> {
    if (!this.isEmbeddingsEnabled) {
      return { enabled: false };
    }

    try {
      const stats = await this.embeddings.getStats();
      return { enabled: true, ...stats };
    } catch (error) {
      return { enabled: true, error: error };
    }
  }

  async cleanup(): Promise<void> {
    if (this.isEmbeddingsEnabled) {
      try {
        await this.embeddings.cleanupOldDocuments();
      } catch (error) {
        console.warn('⚠️ Failed to cleanup embeddings:', error);
      }
    }

    try {
      const contexts = await this.getContext(7);
      await fs.writeFile(CONTEXT_FILE, JSON.stringify(contexts, null, 2));
    } catch (error) {
      console.warn('⚠️ Failed to cleanup JSON contexts:', error);
    }
  }
}

export const stateManager = new EnhancedStateManager();
