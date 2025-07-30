/**
 * Batch process items with rate limiting and exponential backoff
 */
export async function batchProcessWithRateLimit(
  items,
  batchSize,
  fn,
  minDelayMs = 1000,
  maxRetries = 4
) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        let attempt = 0;
        let delay = 1000;
        while (true) {
          try {
            return await fn(item);
          } catch (err) {
            if (err?.response?.status === 429 || (err?.message && /rate.?limit/i.test(err.message))) {
              if (attempt < maxRetries) {
                attempt++;
                console.warn(`⏳ Rate limit hit, retrying in ${delay}ms (attempt ${attempt})...`);
                await new Promise(res => setTimeout(res, delay));
                delay *= 2;
                continue;
              }
            }
            // Other errors or max retries
            console.warn(`❌ Query failed after ${attempt} retries:`, err?.message || err);
            return null;
          }
        }
      })
    );
    results.push(...batchResults);
    if (i + batchSize < items.length) {
      await new Promise(res => setTimeout(res, minDelayMs));
    }
  }
  return results;
}