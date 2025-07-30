#!/usr/bin/env node

/**
 * Main entry point for the Crypto Agent
 * 
 * This file serves as the primary entry point and can run either:
 * 1. The modular version (src/index.ts) - requires API keys
 * 2. The original monolithic version (main.ts) - requires API keys
 * 
 * Usage:
 *   npm start                    # Run modular version
 *   npm run analyze             # Run original version
 *   node index.ts "your query"  # Run with custom query
 */

import { processCryptoQuery } from './src/index.js';

async function main() {
  const userQuery = process.argv[2] || "I want Technical analysis on Shiba Inu and Dogecoin";
  
  console.log('🚀 Starting Crypto Agent...');
  console.log(`📝 Query: "${userQuery}"`);
  console.log('');
  
  try {
    const result = await processCryptoQuery(userQuery);
    console.log('\n✅ Analysis completed successfully!');
  } catch (error) {
    console.error('\n❌ Error running crypto agent:', error);
    console.log('\n💡 Make sure you have the required API keys set in your .env file:');
    console.log('   - OPENAI_API_KEY (for synonym generation and analysis)');
    console.log('   - EXASEARCH_API_KEY (for web search)');
    console.log('   - GOOGLE_GENERATIVE_AI_API_KEY (for analysis)');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}