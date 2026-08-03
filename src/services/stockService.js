/**
 * src/services/stockService.js
 *
 * Service layer responsible for all Finnhub REST API interactions.
 *
 * Responsibilities:
 *  - Fetch a single stock quote via GET /quote
 *  - Fetch multiple quotes in parallel
 *  - Maintain an in-memory cache (node-cache) to avoid hammering the API
 *  - Translate Finnhub error codes into meaningful application errors
 *
 * Controllers call this service; the service never touches req/res.
 */

const axios = require("axios");
const NodeCache = require("node-cache");
const finnhubConfig = require("../config/finnhub");
const logger = require("../utils/logger");

// ── In-memory cache ──────────────────────────────────────────────────────────
// TTL is set per the environment variable (default 15 s).
// stdTTL = default TTL in seconds; checkperiod = how often stale keys are
// evicted (also in seconds).
const cache = new NodeCache({
  stdTTL: finnhubConfig.cacheTtl,
  checkperiod: finnhubConfig.cacheTtl + 5,
  useClones: false,
});

// ── Axios instance ───────────────────────────────────────────────────────────
const finnhubRest = axios.create({
  baseURL: finnhubConfig.restBaseUrl,
  timeout: 8000,
  params: {
    token: finnhubConfig.apiKey, // Appended to every request automatically
  },
});

// Response interceptor — normalise Finnhub error shapes
finnhubRest.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status, data } = error.response;
      const msg =
        data?.error ||
        `Finnhub API responded with status ${status}`;
      const appError = new Error(msg);
      appError.statusCode = status === 429 ? 429 : status >= 500 ? 502 : status;
      return Promise.reject(appError);
    }
    if (error.code === "ECONNABORTED") {
      const timeoutError = new Error("Finnhub API request timed out.");
      timeoutError.statusCode = 504;
      return Promise.reject(timeoutError);
    }
    return Promise.reject(error);
  }
);

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Validate and normalise a ticker symbol.
 * Throws a 400-tagged error if the symbol looks invalid.
 */
const validateSymbol = (symbol) => {
  if (!symbol || typeof symbol !== "string") {
    const err = new Error("A valid stock symbol is required.");
    err.statusCode = 400;
    throw err;
  }
  const clean = symbol.trim().toUpperCase();
  if (!/^[A-Z]{1,10}$/.test(clean)) {
    const err = new Error(
      `Invalid symbol format: "${symbol}". Only alphabetic characters (max 10) are allowed.`
    );
    err.statusCode = 400;
    throw err;
  }
  return clean;
};

/**
 * Map a raw Finnhub /quote response to a clean domain object.
 */
const mapQuote = (symbol, data) => ({
  symbol,
  currentPrice: data.c,       // Current price
  change: data.d,             // Change
  percentChange: data.dp,     // Percent change
  highPrice: data.h,          // High price of the day
  lowPrice: data.l,           // Low price of the day
  openPrice: data.o,          // Open price of the day
  previousClose: data.pc,     // Previous close price
  timestamp: data.t           // Unix timestamp
    ? new Date(data.t * 1000).toISOString()
    : new Date().toISOString(),
  fetchedAt: new Date().toISOString(),
});

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch a real-time quote for a single stock symbol.
 * Results are cached for `finnhubConfig.cacheTtl` seconds.
 *
 * @param {string} rawSymbol  e.g. "AAPL"
 * @returns {Promise<Object>} Normalised quote object
 */
const getStockQuote = async (rawSymbol) => {
  const symbol = validateSymbol(rawSymbol);
  const cacheKey = `quote:${symbol}`;

  // Return cached value if available
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.debug(`[StockService] Cache HIT for ${symbol}`);
    return { ...cached, fromCache: true };
  }

  logger.debug(`[StockService] Cache MISS — fetching ${symbol} from Finnhub`);

  const { data } = await finnhubRest.get("/quote", {
    params: { symbol },
  });

  // Finnhub returns { c: 0, d: null, ... } for unknown symbols — detect it
  if (data.c === 0 && data.pc === 0) {
    const err = new Error(
      `No data found for symbol "${symbol}". It may be invalid or delisted.`
    );
    err.statusCode = 404;
    throw err;
  }

  const quote = mapQuote(symbol, data);
  cache.set(cacheKey, quote);

  return { ...quote, fromCache: false };
};

/**
 * Fetch quotes for multiple symbols in parallel.
 * Individual failures are caught so one bad symbol does not block the rest.
 *
 * @param {string[]} rawSymbols  Array of ticker symbols
 * @returns {Promise<Object[]>}  Array of { symbol, data | error } objects
 */
const getMultipleStockQuotes = async (rawSymbols) => {
  if (!Array.isArray(rawSymbols) || rawSymbols.length === 0) {
    const err = new Error("At least one symbol is required.");
    err.statusCode = 400;
    throw err;
  }

  if (rawSymbols.length > 20) {
    const err = new Error(
      "Maximum 20 symbols per request. Please batch your requests."
    );
    err.statusCode = 400;
    throw err;
  }

  const results = await Promise.allSettled(
    rawSymbols.map((s) => getStockQuote(s))
  );

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return { symbol: rawSymbols[index].toUpperCase(), data: result.value };
    }
    return {
      symbol: rawSymbols[index].toUpperCase(),
      error: {
        message: result.reason?.message || "Unknown error",
        statusCode: result.reason?.statusCode || 500,
      },
    };
  });
};

/**
 * Return the current cache statistics (useful for health/debug endpoints).
 */
const getCacheStats = () => cache.getStats();

/**
 * Manually invalidate the cache entry for a specific symbol.
 * Called by the WebSocket layer when fresh live data arrives.
 *
 * @param {string} symbol
 */
const bustCache = (symbol) => {
  const key = `quote:${symbol.toUpperCase()}`;
  cache.del(key);
};

/**
 * Fetch real-time market news from Finnhub API.
 */
const getMarketNews = async (category = "general") => {
  const cacheKey = `news:${category}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await finnhubRest.get("/news", {
      params: { category },
    });

    const newsList = Array.isArray(data)
      ? data.slice(0, 12).map((item) => ({
          id: item.id || item.url,
          headline: item.headline,
          summary: item.summary,
          source: item.source,
          url: item.url,
          image: item.image || "",
          category: item.category,
          datetime: item.datetime ? new Date(item.datetime * 1000).toISOString() : new Date().toISOString(),
        }))
      : [];

    cache.set(cacheKey, newsList, 300); // cache for 5 min
    return newsList;
  } catch (err) {
    logger.warn(`[StockService] Failed to fetch market news: ${err.message}`);
    return [];
  }
};

module.exports = {
  getStockQuote,
  getMultipleStockQuotes,
  getCacheStats,
  bustCache,
  getMarketNews,
};
