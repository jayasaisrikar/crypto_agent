# Main Crypto Agent Flow Documentation

## Overview

The new `exaTool.ts` implements a comprehensive Main Crypto Agent that combines:
1. **GPT-4o AI Synonym Generation** - Intelligent query expansion
2. **Enhanced Exa Search** - Multi-query web search with content scraping
3. **Intelligent Content Processing** - Relevance filtering and insight extraction

## Architecture

```
User Query → GPT-4o Synonyms → Enhanced Exa Search → Content Scraping → Gemini 2.0 Flash Analysis
```

## Key Features

### 🧠 AI-Powered Synonym Generation
- Uses GPT-4o to generate up to 5 crypto-specific synonym queries
- Validates queries are cryptocurrency-related
- Rejects non-crypto queries with helpful message
- Includes current date/month for recent events

### 🔍 Enhanced Multi-Query Search
- Searches with original query + generated synonyms
- Parallel execution for speed
- URL deduplication
- Relevance-based result sorting

### 📄 Advanced Content Processing
- Scrapes full content from top results
- Filters content by relevance score
- Extracts key insights automatically
- Generates enhanced analysis prompts

### 🤖 Final Analysis Generation
- Uses Gemini 2.0 Flash for comprehensive technical analysis
- Structured analysis with market overview, technical indicators, and actionable insights
- Fast and efficient processing

## Usage

### In Code
```typescript
import { processCryptoQuery } from "./exaTool.js";

const result = await processCryptoQuery(
  "What factors are driving Bitcoin price changes?",
  process.env.EXA_API_KEY,
  process.env.OPENAI_API_KEY
);
```

### From Command Line
```bash
# Test the main agent
npm run test:main-agent

# Run full analysis
npm start
```

## Response Format

```typescript
{
  success: boolean,
  originalQuery: string,
  synonymGeneration: {
    synonymsUsed: string[],
    processingTime: number,
    totalQueries: number
  },
  searchResults: {
    totalResults: number,
    results: Array<{
      title: string,
      url: string,
      summary: string,
      score: number,
      scraped: boolean,
      fullContent?: string,
      metadata?: object,
      tags?: string[]
    }>,
    scrapedCount: number,
    relevantCount: number
  },
  insights: {
    keyInsights: string[],
    contentSummary: string,
    perfectPrompt: string
  },
  cost: number,
  processingTime: number,
  timestamp: string
}
```

## GPT-4o Synonym System Prompt

The system uses a sophisticated prompt that:
- Validates crypto-relevance of queries
- Generates date-aware synonyms for current events
- Returns structured JSON responses
- Rejects non-crypto queries appropriately

Example synonyms for "Bitcoin price analysis":
1. Bitcoin price change July 2025
2. factors driving Bitcoin price July 2025
3. Bitcoin market trends July 2025
4. Bitcoin price movements July 2025

## Error Handling

- **Invalid crypto query**: Returns helpful rejection message
- **API failures**: Graceful degradation with detailed error info
- **Scraping failures**: Falls back to summary-only results
- **Missing keys**: Clear error messages for setup

## Performance

- **Parallel searches**: All synonym queries run simultaneously
- **Smart scraping**: Only scrapes top-scored results
- **Content filtering**: Relevance-based filtering reduces noise
- **Deduplication**: Removes duplicate URLs automatically

## Integration

The main agent integrates with:
- `index.ts` - Main application entry point
- `exa-tool-advanced.ts` - Advanced search capabilities
- `services/scraper.ts` - Content extraction
- `services/synonym-generator.ts` - AI synonym generation

## Environment Variables Required

```bash
EXA_API_KEY=your_exa_api_key
OPENAI_API_KEY=your_openai_api_key
GEMINI_API_KEY=your_gemini_api_key
```

## Testing

Run comprehensive tests with:
```bash
npm run test:main-agent
```

This tests various query types including:
- Valid crypto queries
- Invalid non-crypto queries  
- Edge cases and error handling
