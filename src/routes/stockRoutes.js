/**
 * src/routes/stockRoutes.js
 *
 * Express Router for all /api/stocks endpoints.
 *
 * Route map:
 *  GET    /api/stocks/health                     → healthCheck
 *  GET    /api/stocks/subscriptions              → getSubscriptions
 *  POST   /api/stocks/subscribe                  → subscribeSymbol
 *  DELETE /api/stocks/subscribe                  → unsubscribeSymbol
 *  GET    /api/stocks/multiple?symbols=A,B,C     → getMultipleStockQuotes
 *  GET    /api/stocks?symbol=AAPL                → getStockQuote
 *
 * The `stockLimiter` middleware is applied to the data-fetch routes to mirror
 * Finnhub's free-tier quota (~60 req/min).
 */

const { Router } = require("express");
const {
  getStockQuote,
  getMultipleStockQuotes,
  getSubscriptions,
  subscribeSymbol,
  unsubscribeSymbol,
  healthCheck,
} = require("../controllers/stockController");
const { stockLimiter } = require("../middleware/rateLimiter");

const router = Router();

// ── Utility routes (no rate limit needed) ────────────────────────────────────
router.get("/health", healthCheck);
router.get("/subscriptions", getSubscriptions);
router.post("/subscribe", subscribeSymbol);
router.delete("/subscribe", unsubscribeSymbol);

// ── Data routes (rate-limited) ────────────────────────────────────────────────
router.get("/multiple", stockLimiter, getMultipleStockQuotes);
router.get("/", stockLimiter, getStockQuote);

module.exports = router;
