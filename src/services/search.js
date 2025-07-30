import { Exa } from "exa-js";
import { batchProcessWithRateLimit } from "../utils/batch-processor.js";
import { UniversalScraper } from "./scraper.js";

/**
 * Search for content using Exa API
 */
export async function searchWithExa(queries) {
  const exa = new Exa(process.env.EXA_API_KEY);
  const searchOptions = {
    type: "auto",
    numResults: 3,
    text: false,
    summary: true
  };

  console.log(`\n🔍 Sending ${queries.length} queries to Exa (batching, max 5/sec):`);
  queries.forEach((query, index) => {
    console.log(`${index + 1}. "${query}"`);
  });
  console.log('');

  // Batch process with 5 per second
  const batchResults = await batchProcessWithRateLimit(
    queries,
    5,
    async (query) => {
      try {
        const result = await exa.searchAndContents(query, searchOptions);
        console.log(`✅ Query "${query}" returned ${result.results.length} results`);
        return result.results.map((item) => ({
          url: item.url,
          title: item.title || 'No Title',
          publishedDate: item.publishedDate || 'Unknown Date',
          query: query
        }));
      } catch (error) {
        console.log(`⚠️ Search failed for query: "${query}"`);
        return [];
      }
    },
    1000 // 1 second between batches
  );

  const allResults = batchResults.flat().filter(Boolean).flat();
  const uniqueResults = allResults.filter((result, index, self) => 
    index === self.findIndex(r => r.url === result.url)
  );
  const finalResults = uniqueResults.slice(0, 15);
  finalResults.sort((a, b) => {
    const dateA = new Date(a.publishedDate || '1900-01-01');
    const dateB = new Date(b.publishedDate || '1900-01-01');
    return dateB.getTime() - dateA.getTime();
  });
  console.log('\n📰 Found URLs sorted by publication date (newest first):');
  finalResults.forEach((result, index) => {
    const publishDate = result.publishedDate !== 'Unknown Date' ? 
      new Date(result.publishedDate).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : 'Unknown Date';
    console.log(`${index + 1}. ${result.title}`);
    console.log(`   URL: ${result.url}`);
    console.log(`   Published: ${publishDate}`);
    console.log('');
  });
  return {
    urls: finalResults.map(r => r.url),
    results: finalResults
  };
}

/**
 * Search for missing tokens in the scraped content
 */
export async function searchForMissingTokens(
  missingTokens, 
  existingUrls
) {
  console.log(`\n🔄 Searching for missing tokens: ${missingTokens.map(t => t.name).join(', ')}`);

  const exa = new Exa(process.env.EXA_API_KEY);
  const scraper = new UniversalScraper();
  const additionalContents = [];
  
  for (const token of missingTokens) {
    const specificQueries = [
      `${token.name} cryptocurrency price analysis July 2025`,
      `${token.name} token market trends technical analysis`,
      `${token.name} crypto price prediction 2025`,
      `${token.name} digital asset trading signals`,
      `${token.name} blockchain token analysis`
    ];
    
    console.log(`🔍 Searching specifically for ${token.name}...`);
    
    for (const query of specificQueries) {
      try {
        const result = await exa.searchAndContents(query, {
          type: "auto",
          numResults: 2,
          summary: true
        });
        
        console.log(`✅ Specific search "${query}" returned ${result.results.length} results`);
        
        for (const item of result.results) {
          if (existingUrls.includes(item.url)) {
            continue;
          }
          
          try {
            const scrapedContent = await scraper.scrapeUrl(item.url);
            const hasTokenContent = token.patterns.some(pattern => 
              pattern.test(scrapedContent.title + ' ' + scrapedContent.cleanedContent)
            );
            
            if (hasTokenContent) {
              additionalContents.push(scrapedContent);
              existingUrls.push(item.url);
              console.log(`✅ Found relevant content for ${token.name}: ${scrapedContent.title}`);
              break;
            } else {
              console.log(`⚠️ Content doesn't contain ${token.name} information, skipping...`);
            }
          } catch (error) {
            console.log(`❌ Failed to scrape ${item.url}`);
          }
        }
        
        if (additionalContents.some(content => 
          token.patterns.some(pattern => 
            pattern.test(content.title + ' ' + content.cleanedContent)
          )
        )) {
          break;
        }
      } catch (error) {
        console.log(`⚠️ Specific search failed for: "${query}"`);
      }
    }
  }
  
  return additionalContents;
}