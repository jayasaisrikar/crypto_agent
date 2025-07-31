
import "dotenv/config";
import { generateSynonyms } from "./services/synonym-generator.js";
import { searchWithExa, searchForMissingTokens } from "./services/search.js";
import { UniversalScraper } from "./services/scraper.js";
import { generateFinalAnalysis } from "./services/analysis.js";
import { extractCryptoTokens } from "./utils/token-extractor.js";
import axios from "axios";

const DEFAULT_QUERY = "I want Technical analysis on Shiba Inu and Dogecoin";

let cachedCoinGeckoAssets = null;
async function fetchAllCoinGeckoAssets() {
  if (cachedCoinGeckoAssets) return cachedCoinGeckoAssets;
  const url = "https://api.coingecko.com/api/v3/coins/list";
  const { data } = await axios.get(url);
  cachedCoinGeckoAssets = data;
  return data;
}

function isTokenInCoinGecko(tokenName, assets) {
  const lower = tokenName.toLowerCase();
  return assets.some(
    (a) =>
      a.name.toLowerCase() === lower ||
      a.symbol.toLowerCase() === lower ||
      a.id.toLowerCase() === lower
  );
}


export async function processCryptoQuery(userQuery = DEFAULT_QUERY) {
  try {
    console.log(`Processing query: "${userQuery}"`);
    const synonymResponse = await generateSynonyms(userQuery);
    console.log(`Total synonyms parsed from model: ${synonymResponse.synonyms.length}`);
    console.log('📝 Synonyms:', synonymResponse.synonyms);
    const searchQueries = [userQuery, ...synonymResponse.synonyms];
    console.log(`Will send ${searchQueries.length} queries to Exa (including original query).`);
    const searchResult = await searchWithExa(searchQueries);
    console.log(`Found ${searchResult.urls.length} URLs`);
    const scraper = new UniversalScraper();
    let scrapedContents = await scraper.scrapeMultiple(searchResult.urls);
    console.log(`Scraped ${scrapedContents.length} sources successfully`);
    if (scrapedContents.length < searchResult.urls.length) {
      console.log(`⚠️ Failed to scrape ${searchResult.urls.length - scrapedContents.length} URLs`);
    }
    const detectedTokens = extractCryptoTokens(userQuery);
    console.log(`🔍 Detected tokens from query: ${detectedTokens.map(t => t.name).join(', ')}`);
    const allAssets = await fetchAllCoinGeckoAssets();
    const realTokens = detectedTokens.filter(token =>
      isTokenInCoinGecko(token.name, allAssets)
    );
    const fakeTokens = detectedTokens.filter(token =>
      !isTokenInCoinGecko(token.name, allAssets)
    );
    if (fakeTokens.length > 0) {
      console.log(`⚠️ Unrecognized/fake assets: ${fakeTokens.map(t => t.name).join(", ")}`);
    }
    const tokenCoverage = {};
    realTokens.forEach(token => {
      const count = scrapedContents.filter(c =>
        token.patterns.some(pattern =>
          pattern.test(c.title + ' ' + c.cleanedContent)
        )
      ).length;
      tokenCoverage[token.name] = count;
    });
    console.log('🎯 Initial token coverage in scraped content:', tokenCoverage);
    const missingTokens = realTokens.filter(token => {
      const coverage = tokenCoverage[token.name] || 0;
      return coverage === 0;
    });
    if (missingTokens.length > 0) {
      console.log(`\n⚠️ Found ${missingTokens.length} tokens with insufficient coverage. Searching specifically...`);
      const existingUrls = searchResult.urls.slice();
      const additionalContents = await searchForMissingTokens(missingTokens, existingUrls);
      if (additionalContents.length > 0) {
        scrapedContents = [...scrapedContents, ...additionalContents];
        console.log(`✅ Added ${additionalContents.length} additional sources for missing tokens`);
        realTokens.forEach(token => {
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


if (require.main === module) {
  const userQuery = process.argv[2] || DEFAULT_QUERY;
  processCryptoQuery(userQuery);
}