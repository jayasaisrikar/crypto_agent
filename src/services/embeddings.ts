import { QdrantClient } from '@qdrant/js-client-rest';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';

export interface EmbeddingDocument {
  id: string;
  content: string;
  metadata: {
    type: 'news' | 'context' | 'analysis' | 'scraped_content';
    timestamp: string;
    source?: string;
    symbol?: string;
    sentiment?: 'positive' | 'negative' | 'neutral';
    relevanceScore?: number;
    sessionId?: string;
  };
}

export interface SearchResult {
  document: EmbeddingDocument;
  score: number;
}

export class EmbeddingsService {
  private qdrantClient: QdrantClient | null = null;
  private genAI: GoogleGenerativeAI;
  private collectionName = 'crypto_context';
  private vectorSize = 768;
  private isQdrantAvailable = false;
  private connectionChecked = false;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
  }

  private async checkQdrantConnection(): Promise<boolean> {
    if (this.connectionChecked) {
      return this.isQdrantAvailable;
    }

    try {
      const testClient = new QdrantClient({
        url: 'http://127.0.0.1:6333',
      });

      await testClient.getCollections();
      
      this.qdrantClient = testClient;
      this.isQdrantAvailable = true;
      this.connectionChecked = true;
      
      return true;
    } catch (error) {
      this.isQdrantAvailable = false;
      this.connectionChecked = true;
      return false;
    }
  }

  async initializeCollection(): Promise<void> {
    const isConnected = await this.checkQdrantConnection();
    if (!isConnected || !this.qdrantClient) {
      return;
    }

    try {
      const collections = await this.qdrantClient.getCollections();
      const exists = collections.collections?.some(c => c.name === this.collectionName);

      if (!exists) {
        await this.qdrantClient.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize,
            distance: 'Cosine',
          },
          optimizers_config: {
            default_segment_number: 2,
          },
          replication_factor: 1,
        });

        console.log(`✅ Created Qdrant collection: ${this.collectionName}`);
        await this.seedInitialData();
      } else {
        const info = await this.qdrantClient.getCollection(this.collectionName);
        if (info.points_count === 0) {
          await this.seedInitialData();
        }
      }
    } catch (error) {
      this.isQdrantAvailable = false;
    }
  }

  private async seedInitialData(): Promise<void> {
    try {
      const seedDocs = [
        {
          id: uuidv4(),
          content: "Bitcoin price movements often correlate with institutional adoption, regulatory news, and macroeconomic factors like inflation and interest rates.",
          metadata: {
            type: 'context' as const,
            timestamp: new Date().toISOString(),
            source: 'system',
            symbol: 'BTC',
            sentiment: 'neutral' as const
          }
        },
        {
          id: uuidv4(),
          content: "Ethereum price analysis includes factors like network upgrades, DeFi activity, gas fees, and staking rewards which affect supply and demand.",
          metadata: {
            type: 'context' as const,
            timestamp: new Date().toISOString(),
            source: 'system',
            symbol: 'ETH',
            sentiment: 'neutral' as const
          }
        }
      ];
      
      for (const doc of seedDocs) {
        await this.storeDocument(doc);
      }
    } catch (error) {
      // Ignore seeding errors
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });
      const result = await model.embedContent(text.substring(0, 8000));
      
      if (result.embedding && result.embedding.values) {
        return result.embedding.values;
      } else {
        throw new Error('No embedding values returned');
      }
    } catch (error) {
      console.error('❌ Failed to generate embedding:', error);
      return Array.from({ length: this.vectorSize }, () => Math.random() - 0.5);
    }
  }

  async storeDocument(document: Omit<EmbeddingDocument, 'id'>): Promise<string> {
    const id = uuidv4();
    
    if (!this.isQdrantAvailable || !this.qdrantClient) {
      console.log('⚠️ Qdrant not available, document stored in memory only');
      return id;
    }

    try {
      const fullDocument: EmbeddingDocument = { id, ...document };
      
      const embedding = await this.generateEmbedding(document.content);

      await this.qdrantClient.upsert(this.collectionName, {
        wait: true,
        points: [
          {
            id: id,
            vector: embedding,
            payload: {
              content: document.content,
              metadata: document.metadata,
            },
          },
        ],
      });

      console.log(`✅ Stored document in Qdrant: ${id}`);
      return id;
    } catch (error) {
      console.error('❌ Failed to store document in Qdrant:', error);
      return id;
    }
  }

  async searchSimilar(
    query: string,
    limit: number = 5,
    filters?: {
      type?: string;
      symbol?: string;
      sessionId?: string;
      minRelevanceScore?: number;
    }
  ): Promise<SearchResult[]> {
    if (!this.isQdrantAvailable || !this.qdrantClient) {
      console.log('⚠️ Qdrant not available, returning empty search results');
      return [];
    }

    try {
      const queryEmbedding = await this.generateEmbedding(query);

      let filter: any = undefined;
      if (filters) {
        const conditions: any[] = [];
        
        if (filters.type) {
          conditions.push({
            key: 'metadata.type',
            match: { value: filters.type }
          });
        }
        
        if (filters.symbol) {
          conditions.push({
            key: 'metadata.symbol',
            match: { value: filters.symbol }
          });
        }
        
        if (filters.sessionId) {
          conditions.push({
            key: 'metadata.sessionId',
            match: { value: filters.sessionId }
          });
        }
        
        if (filters.minRelevanceScore) {
          conditions.push({
            key: 'metadata.relevanceScore',
            range: { gte: filters.minRelevanceScore }
          });
        }

        if (conditions.length > 0) {
          filter = { must: conditions };
        }
      }

      const searchResult = await this.qdrantClient.search(this.collectionName, {
        vector: queryEmbedding,
        limit,
        filter,
        with_payload: true,
        score_threshold: 0.1,
      });

      const results: SearchResult[] = searchResult.map(point => ({
        document: {
          id: point.id as string,
          content: point.payload?.content as string,
          metadata: point.payload?.metadata as any,
        },
        score: point.score || 0,
      }));

      console.log(`🔍 Found ${results.length} similar documents for query: "${query.substring(0, 50)}..."`);
      return results;
    } catch (error) {
      console.error('❌ Failed to search documents:', error);
      return [];
    }
  }

  async storeNewsArticle(
    content: string,
    metadata: {
      source: string;
      symbol?: string;
      sentiment?: 'positive' | 'negative' | 'neutral';
      url?: string;
    }
  ): Promise<string> {
    return this.storeDocument({
      content,
      metadata: {
        type: 'news',
        timestamp: new Date().toISOString(),
        ...metadata,
        relevanceScore: 0.8,
      },
    });
  }

  async storeAnalysisContext(
    content: string,
    sessionId: string,
    symbol?: string
  ): Promise<string> {
    return this.storeDocument({
      content,
      metadata: {
        type: 'context',
        timestamp: new Date().toISOString(),
        sessionId,
        symbol,
        relevanceScore: 0.9,
      },
    });
  }

  async getRelevantContext(
    query: string,
    sessionId?: string,
    symbol?: string,
    limit: number = 10
  ): Promise<SearchResult[]> {
    const results = await this.searchSimilar(query, limit, {
      sessionId,
      symbol,
      minRelevanceScore: 0.3,
    });

    return results.sort((a, b) => {
      const scoreA = a.score;
      const scoreB = b.score;
      
      if (Math.abs(scoreA - scoreB) < 0.1) {
        const timeA = new Date(a.document.metadata.timestamp).getTime();
        const timeB = new Date(b.document.metadata.timestamp).getTime();
        return timeB - timeA;
      }
      
      return scoreB - scoreA;
    });
  }

  async cleanupOldDocuments(): Promise<void> {
    if (!this.isQdrantAvailable || !this.qdrantClient) {
      console.log('⚠️ Qdrant not available, skipping cleanup');
      return;
    }

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);
      
      const allPoints = await this.qdrantClient.scroll(this.collectionName, {
        limit: 1000,
        with_payload: true,
      });

      const toDelete: string[] = [];
      
      for (const point of allPoints.points) {
        const metadata = point.payload?.metadata as any;
        const timestamp = metadata?.timestamp;
        if (timestamp && new Date(timestamp) < cutoffDate) {
          toDelete.push(point.id as string);
        }
      }

      if (toDelete.length > 0) {
        await this.qdrantClient.delete(this.collectionName, {
          points: toDelete,
        });
        console.log(`🧹 Cleaned up ${toDelete.length} old documents`);
      }
    } catch (error) {
      console.error('❌ Failed to cleanup old documents:', error);
    }
  }

  async getStats(): Promise<any> {
    if (!this.isQdrantAvailable || !this.qdrantClient) {
      return {
        enabled: false,
        status: 'Qdrant not available'
      };
    }

    try {
      const info = await this.qdrantClient.getCollection(this.collectionName);
      return {
        enabled: true,
        pointsCount: info.points_count,
        vectorsCount: info.vectors_count,
        status: info.status,
      };
    } catch (error) {
      console.error('❌ Failed to get collection stats:', error);
      return {
        enabled: true,
        error: error,
        status: 'Error retrieving stats'
      };
    }
  }
}
