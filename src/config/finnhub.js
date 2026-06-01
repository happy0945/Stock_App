/**
 * src/config/finnhub.js
 *
 * Centralised configuration object for all Finnhub-related constants.
 * Every other module imports from here — never hard-code these values elsewhere.
 */

require("dotenv").config();

const finnhubConfig = {
  /** Finnhub personal API key — set in .env */
  apiKey: process.env.FINNHUB_API_KEY || "",

  /** Base URL for Finnhub REST endpoints */
  restBaseUrl: process.env.FINNHUB_REST_BASE || "https://finnhub.io/api/v1",

  /** Finnhub WebSocket endpoint (token appended at connection time) */
  wsUrl: process.env.FINNHUB_WS_URL || "wss://ws.finnhub.io",

  /** Seconds each quote stays in the in-memory cache */
  cacheTtl: parseInt(process.env.CACHE_TTL || "15", 10),

  /** Symbols automatically subscribed when the server starts */
  defaultSymbols: (process.env.DEFAULT_SYMBOLS || "AAPL,TSLA,MSFT")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),

  /** How long (ms) to wait before attempting a WebSocket reconnect */
  wsReconnectInterval: parseInt(
    process.env.WS_RECONNECT_INTERVAL_MS || "5000",
    10
  ),

  /** Maximum number of WebSocket reconnect attempts before giving up */
  wsMaxReconnectAttempts: parseInt(
    process.env.WS_MAX_RECONNECT_ATTEMPTS || "10",
    10
  ),
};

// Fail fast — the key is mandatory for any real work
if (!finnhubConfig.apiKey) {
  console.warn(
    "[config/finnhub] WARNING: FINNHUB_API_KEY is not set. " +
      "REST and WebSocket calls will fail until it is provided."
  );
}

module.exports = finnhubConfig;
