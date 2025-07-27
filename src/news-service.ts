import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { stateManager, NewsContext } from './market-state.js';

const app = express();
app.use(express.json());

app.post('/api/news', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    console.log(`Scraping news from: ${url}`);
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 CryptoAgent/1.0' }
    });

    const $ = cheerio.load(response.data);
    const headline = $('h1').first().text().trim() || $('title').text().trim();
    const content = $('p').slice(0, 3).map((i, el) => $(el).text().trim()).get().join(' ');

    const text = (headline + ' ' + content).toLowerCase();
    const bullishWords = ['bullish', 'pump', 'surge', 'rally', 'moon', 'breakout', 'buy'];
    const bearishWords = ['bearish', 'dump', 'crash', 'sell', 'fall', 'drop', 'bear'];
    
    const bullishScore = bullishWords.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0);
    const bearishScore = bearishWords.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0);
    
    const sentiment = bullishScore > bearishScore ? 'bullish' : bearishScore > bullishScore ? 'bearish' : 'neutral';

    const tickers = ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto'].filter(ticker => 
      text.includes(ticker)
    );

    const newsContext: NewsContext = {
      id: uuidv4(),
      url,
      headline,
      content: content.substring(0, 500),
      timestamp: new Date().toISOString(),
      sentiment,
      relevantTickers: tickers
    };

    await stateManager.addContext(newsContext);
    res.json({ success: true, context: newsContext });
  } catch (error) {
    console.error('News scraping error:', error);
    res.status(500).json({ error: 'Failed to scrape news' });
  }
});

app.get('/api/context', async (req, res) => {
  const days = parseInt(req.query.days as string) || 2;
  const context = await stateManager.getContext(days);
  res.json({ context, count: context.length });
});

export { app as newsService };
