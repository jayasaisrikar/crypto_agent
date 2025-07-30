import "dotenv/config";
import { generateSynonyms } from "./services/synonym-generator";
import { searchWithExa, searchForMissingTokens } from "./services/search";
import { UniversalScraper } from "./services/scraper";
import { generateFinalAnalysis } from "./services/analysis";
import { extractCryptoTokens } from "./utils/token-extractor";

// Default query if none is provided
const DEFAULT_QUERY = "I want Technical analysis on Shiba Inu and Dogecoin";

/**
 * Main function to process a crypto query
 */
export async function processCryptoQuery(userQuery: string = DEFAULT_QUERY): Promise<string> {
  try {
    console.log(`Processing query: "${userQuery}"`);
    
    // Generate synonym queries
    const synonymResponse = await generateSynonyms(userQuery);
    console.log(`Total synonyms parsed from model: ${synonymResponse.synonyms.length}`);
    console.log('📝 Synonyms:', synonymResponse.synonyms);
    
    // Search for content using all queries
    const searchQueries = [userQuery, ...synonymResponse.synonyms];
    console.log(`Will send ${searchQueries.length} queries to Exa (including original query).`);
    const searchResult = await searchWithExa(searchQueries);
    console.log(`Found ${searchResult.urls.length} URLs`);
    
    // Scrape content from search results
    const scraper = new UniversalScraper();
    let scrapedContents = await scraper.scrapeMultiple(searchResult.urls);
    console.log(`Scraped ${scrapedContents.length} sources successfully`);
    
    if (scrapedContents.length < searchResult.urls.length) {
      console.log(`⚠️ Failed to scrape ${searchResult.urls.length - scrapedContents.length} URLs`);
    }

    // Extract crypto tokens from the query
    const detectedTokens = extractCryptoTokens(userQuery);
    console.log(`🔍 Detected tokens from query: ${detectedTokens.map(t => t.name).join(', ')}`);
    
    // Check token coverage in scraped content
    const tokenCoverage: {[key: string]: number} = {};
    detectedTokens.forEach(token => {
      const count = scrapedContents.filter(c => 
        token.patterns.some(pattern => 
          pattern.test(c.title + ' ' + c.cleanedContent)
        )
      ).length;
      tokenCoverage[token.name] = count;
    });
    console.log('🎯 Initial token coverage in scraped content:', tokenCoverage);
    
    // Find tokens with insufficient coverage
    const missingTokens = detectedTokens.filter(token => {
      const coverage = tokenCoverage[token.name] || 0;
      return coverage === 0;
    });
    
    // Search specifically for missing tokens
    if (missingTokens.length > 0) {
      console.log(`\n⚠️ Found ${missingTokens.length} tokens with insufficient coverage. Searching specifically...`);
      const existingUrls = searchResult.urls.slice();
      const additionalContents = await searchForMissingTokens(missingTokens, existingUrls);
      
      if (additionalContents.length > 0) {
        scrapedContents = [...scrapedContents, ...additionalContents];
        console.log(`✅ Added ${additionalContents.length} additional sources for missing tokens`);
        
        // Update token coverage
        detectedTokens.forEach(token => {
          const count = scrapedContents.filter(c => 
            token.patterns.some(pattern => 
              pattern.test(c.title + ' ' + c.cleanedContent)
            )
          ).length;
          tokenCoverage[token.name] = count;
        });
        console.log('🎯 Updated token coverage after additional searches:', tokenCoverage);
      } else {
        console.log(`⚠️ No additional relevant content found for missing tokens`);
      }
    } else {
      console.log(`✅ All tokens have adequate coverage`);
    }
    
    // Generate final analysis
    console.log('\n🔬 Starting final analysis with Gemini...');
    const finalAnalysis = await generateFinalAnalysis(userQuery, synonymResponse.synonyms, scrapedContents);
    
    console.log("\n=== FINAL ANALYSIS ===");
    console.log(finalAnalysis);
    
    return finalAnalysis;
  } catch (error) {
    console.error("Error:", error);
    return `Error processing query: ${error}`;
  }
}

// Run the main function if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Get query from command line arguments or use default
  const userQuery = process.argv[2] || DEFAULT_QUERY;
  processCryptoQuery(userQuery);
}