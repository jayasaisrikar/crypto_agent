# Cryptocurrency Price Movement Analysis Agent

A sophisticated multi-agent system for analyzing cryptocurrency price movements using Google Gemini AI and Qdrant vector database for enhanced contextual insights.

## Features

🚀 **Multi-Agent Price Analysis Pipeline**
- 5-phase analysis: Data Collection → Price Analysis → Fundamentals → Market Dynamics → Conclusion
- Explains WHY prices move, not just what happened

🧠 **Google Gemini Integration**
- Uses Gemini 2.5 Flash for LLM reasoning
- Gemini text-embedding-004 for vector embeddings
- No OpenAI dependency required

🔍 **Vector-Enhanced Context**
- Qdrant vector database for semantic search
- Contextual insights from historical news and analysis
- Graceful fallback when vector DB unavailable

📊 **Real-Time Market Data**
- CoinGecko API for price, volume, market cap data
- News scraping from multiple crypto sources
- Twitter/X sentiment analysis
- Express.js news ingestion service

⚡ **State Management**
- Persistent session tracking
- Enhanced state with embeddings integration
- JSON fallback for traditional storage

## Quick Start

### 1. Prerequisites

- Node.js 20+
- Docker Desktop
- Google API Key

### 2. Installation

```bash
git clone <your-repo>
cd crypto-agent
npm install
```

### 3. Environment Setup

Create `.env` file:
```env
GOOGLE_API_KEY=your_google_api_key_here
LLM_MODEL=gemini-2.5-flash
TWITTER_BEARER_TOKEN=your_twitter_token_here
```

### 4. Set Up Qdrant Vector Database

```bash
# Start Qdrant using the included script
npm run setup-qdrant

# Or manually with Docker
docker run -d --name crypto-qdrant -p 6333:6333 qdrant/qdrant:latest
```

### 5. Test Embeddings (Optional)

```bash
npm run test:gemini-embeddings
```

### 6. Run the Agent

```bash
npm start
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Run the complete crypto analysis agent |
| `npm run dev` | Run in development mode with auto-reload |
| `npm run setup-qdrant` | Set up Qdrant vector database |
| `npm run test:gemini-embeddings` | Test Gemini embeddings with Qdrant |
| `npm run news-service` | Run only the news ingestion service |
| `npm run test-news` | Test news scraping functionality |

## Architecture

### Multi-Agent Pipeline

1. **Data Collection Agent** - Gathers market data from multiple sources
2. **Price Movement Analyst** - Identifies catalysts and price drivers
3. **Fundamental Analyst** - Analyzes underlying market forces
4. **Market Dynamics Analyst** - Studies participant behavior and flows
5. **Conclusion Analyst** - Synthesizes findings into clear insights

### Vector Embeddings Flow

```
News/Context → Gemini Embeddings → Qdrant Storage → Semantic Search → Enhanced Analysis
```

### State Management

- **Enhanced State**: Dual-mode storage (vector + JSON)
- **Session Tracking**: Persistent analysis sessions
- **Context Integration**: Historical news and market context

## Services

### News Ingestion API

The agent runs an Express.js service on `http://localhost:3001`:

```bash
# Add news URL for analysis
curl -X POST http://localhost:3001/api/news \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://crypto-news-url"}'

# Get market context
curl http://localhost:3001/api/context
```

### Qdrant Web UI

Access the vector database dashboard: `http://localhost:6333/dashboard`

## Configuration

### Gemini Embeddings

The system uses Google's `text-embedding-004` model with 768-dimensional vectors. No OpenAI API required.

### Qdrant Settings

- **Collection**: `crypto_context`
- **Vector Size**: 768 (Gemini embedding dimensions)
- **Distance**: Cosine similarity
- **Port**: 6333 (REST API), 6334 (gRPC)

### Tools Integration

- **CoinGecko Tool**: Real-time price and market data
- **News Tool**: Web scraping from major crypto news sources
- **Twitter Tool**: Sentiment analysis from social media

## Project Structure

```
crypto-agent/
├── src/
│   ├── index.ts                    # Main entry point
│   ├── trader-agent.ts            # Core multi-agent pipeline
│   ├── enhanced-state.ts          # State management with embeddings
│   ├── news-service.ts            # Express news ingestion API
│   ├── services/
│   │   └── embeddings.ts          # Qdrant + Gemini embeddings
│   ├── tools/
│   │   ├── coingecko-tool.ts     # CoinGecko API integration
│   │   ├── news-tool.ts          # News scraping tool
│   │   └── twitter-tool.ts       # Twitter sentiment analysis
│   └── utils/
│       └── qdrant-health.ts      # Vector DB health checks
├── setup-qdrant-simple.ps1        # Qdrant setup script
├── test-gemini-embeddings.ts      # Embeddings test script
└── package.json                   # Dependencies and scripts
```

## Output Example

```
📊 CRYPTOCURRENCY PRICE MOVEMENT ANALYSIS REPORT
======================================================================
Session ID: 1c0b3257
Analysis Timestamp: 2025-07-25T10:30:00.000Z
Context Used: 5 items

📈 PRICE MOVEMENT ANALYSIS:
Bitcoin declined 2.4% due to broad risk-off sentiment and profit-taking...

🔍 FUNDAMENTAL FACTORS:
Network activity remains strong with 400K+ daily transactions...

⚖️ MARKET DYNAMICS:
Large holders accumulated during the dip while retail sentiment turned bearish...

📋 CONCLUSION:
The price decline appears to be temporary consolidation rather than trend reversal...
```

## Troubleshooting

### Qdrant Not Available

If Qdrant isn't running, the system automatically falls back to JSON storage:

```powershell
# Check if Qdrant is running
docker ps | findstr qdrant

# Restart Qdrant
npm run setup-qdrant

# Check logs
docker logs crypto-qdrant
```

### Storage Management

Check your persistent storage files:

```powershell
# Check data directory and files
Get-ChildItem ".\data" -Force

# Check storage file sizes
Get-ChildItem ".\data" | Select-Object Name, Length, LastWriteTime

# View recent analysis sessions
Get-Content ".\data\state.json" | ConvertFrom-Json | Select-Object sessionId, timestamp, phase
```

### Gemini API Issues

Verify your Google API key has access to:
- Generative AI (for reasoning)
- Embedding API (for vector search)

### Missing Dependencies

```bash
npm install
```
