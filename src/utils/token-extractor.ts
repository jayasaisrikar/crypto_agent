import { CryptoToken } from '../types';

/**
 * Extract cryptocurrency tokens from a query string
 */
export function extractCryptoTokens(query: string): CryptoToken[] {
  const cryptoPatterns: CryptoToken[] = [
    // Major cryptocurrencies
    { name: 'bitcoin', patterns: [/bitcoin|btc(?!\w)/i] },
    { name: 'ethereum', patterns: [/ethereum|eth(?!\w)/i] },
    { name: 'solana', patterns: [/solana|sol(?!\w)/i] },
    { name: 'cardano', patterns: [/cardano|ada(?!\w)/i] },
    { name: 'polkadot', patterns: [/polkadot|dot(?!\w)/i] },
    { name: 'chainlink', patterns: [/chainlink|link(?!\w)/i] },
    { name: 'dogecoin', patterns: [/dogecoin|doge(?!\w)/i] },
    { name: 'shiba', patterns: [/shiba[\s\-\_]?inu|shib(?!\w)/i] },
    { name: 'avalanche', patterns: [/avalanche|avax(?!\w)/i] },
    { name: 'polygon', patterns: [/polygon|matic(?!\w)/i] },
    { name: 'uniswap', patterns: [/uniswap|uni(?!\w)/i] },
    { name: 'litecoin', patterns: [/litecoin|ltc(?!\w)/i] },
    { name: 'binance', patterns: [/binance[\s\-\_]?coin|bnb(?!\w)/i] },
    { name: 'ripple', patterns: [/ripple|xrp(?!\w)/i] },
    { name: 'stellar', patterns: [/stellar|xlm(?!\w)/i] },
    { name: 'tron', patterns: [/tron|trx(?!\w)/i] },
    { name: 'monero', patterns: [/monero|xmr(?!\w)/i] },
    { name: 'zcash', patterns: [/zcash|zec(?!\w)/i] },
    { name: 'dash', patterns: [/dash(?!\w)/i] },
    { name: 'algorand', patterns: [/algorand|algo(?!\w)/i] },
    { name: 'cosmos', patterns: [/cosmos|atom(?!\w)/i] },
    { name: 'tezos', patterns: [/tezos|xtz(?!\w)/i] },
    { name: 'near', patterns: [/near[\s\-\_]?protocol|near(?!\w)/i] },
    { name: 'fantom', patterns: [/fantom|ftm(?!\w)/i] },
    { name: 'harmony', patterns: [/harmony|one(?!\w)/i] },
    { name: 'elrond', patterns: [/elrond|egld(?!\w)/i] },
    { name: 'terra', patterns: [/terra|luna(?!\w)/i] },
    { name: 'icp', patterns: [/internet[\s\-\_]?computer|icp(?!\w)/i] },
    { name: 'flow', patterns: [/flow(?!\w)/i] },
    { name: 'hedera', patterns: [/hedera|hbar(?!\w)/i] },
    { name: 'vechain', patterns: [/vechain|vet(?!\w)/i] },
    { name: 'theta', patterns: [/theta(?!\w)/i] },
    { name: 'filecoin', patterns: [/filecoin|fil(?!\w)/i] },
    { name: 'decentraland', patterns: [/decentraland|mana(?!\w)/i] },
    { name: 'sandbox', patterns: [/sandbox|sand(?!\w)/i] },
    { name: 'axie', patterns: [/axie[\s\-\_]?infinity|axs(?!\w)/i] },
    { name: 'enjin', patterns: [/enjin|enj(?!\w)/i] },
    { name: 'chiliz', patterns: [/chiliz|chz(?!\w)/i] },
    { name: 'basic_attention', patterns: [/basic[\s\-\_]?attention[\s\-\_]?token|bat(?!\w)/i] },
    { name: 'compound', patterns: [/compound|comp(?!\w)/i] },
    { name: 'maker', patterns: [/maker|mkr(?!\w)/i] },
    { name: 'aave', patterns: [/aave(?!\w)/i] },
    { name: 'sushi', patterns: [/sushiswap|sushi(?!\w)/i] },
    { name: 'curve', patterns: [/curve[\s\-\_]?dao|crv(?!\w)/i] },
    { name: 'yearn', patterns: [/yearn[\s\-\_]?finance|yfi(?!\w)/i] },
    { name: 'synthetix', patterns: [/synthetix|snx(?!\w)/i] },
    { name: 'iq', patterns: [/iq[\s\-\_]?token|iq.*crypto|everipedia|iq(?!\w)/i] },
    { name: 'pear', patterns: [/pear[\s\-\_]?protocol|pear[\s\-\_]?token|pearusdt|pear.*crypto|pear(?!\w)/i] },
  ];
  
  const detectedTokens = cryptoPatterns.filter(crypto => 
    crypto.patterns.some(pattern => pattern.test(query))
  );
  
  if (detectedTokens.length === 0) {
    const words = query.toLowerCase().match(/\b[a-z]{2,20}\b/g) || [];
    const potentialTokens = words.filter(word => 
      word.length >= 2 && word.length <= 10 && 
      !['the', 'and', 'for', 'with', 'analysis', 'technical', 'price', 'token', 'coin', 'crypto', 'cryptocurrency'].includes(word)
    );
    
    return potentialTokens.map(token => ({
      name: token,
      patterns: [new RegExp(`\\b${token}\\b|${token}usdt|${token}usd|${token}.*crypto`, 'i')]
    }));
  }
  
  return detectedTokens;
}