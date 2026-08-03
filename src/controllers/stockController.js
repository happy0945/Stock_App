/**
 * src/controllers/stockController.js
 *
 * Express request handlers (controllers) for all stock-related HTTP endpoints.
 *
 * Each handler:
 *  1. Reads and validates input from req.query / req.params
 *  2. Delegates to the service layer (never touches DB / API directly)
 *  3. Sends a normalised JSON response
 *  4. Passes errors to Express's error-handling pipeline via next(err)
 *
 * No business logic lives here — only input/output translation.
 */

const stockService = require("../services/stockService");
const logger = require("../utils/logger");

// ── GET /api/stocks?symbol=AAPL ──────────────────────────────────────────────

/**
 * Fetch a real-time quote for a single stock symbol.
 *
 * Query params:
 *  - symbol {string} required  — Ticker symbol, e.g. "AAPL"
 */
const getStockQuote = async (req, res, next) => {
  try {
    const { symbol } = req.query;

    if (!symbol) {
      const err = new Error(
        'Query parameter "symbol" is required. Example: /api/stocks?symbol=AAPL'
      );
      err.statusCode = 400;
      throw err;
    }

    logger.debug(`[StockController] getStockQuote → ${symbol}`);
    const quote = await stockService.getStockQuote(symbol);

    return res.status(200).json({
      success: true,
      data: quote,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/stocks/multiple?symbols=AAPL,TSLA,MSFT ────────────────────────

/**
 * Fetch real-time quotes for multiple stock symbols in parallel.
 *
 * Query params:
 *  - symbols {string} required — Comma-separated ticker symbols, max 20.
 *    Example: ?symbols=AAPL,TSLA,MSFT
 */
const getMultipleStockQuotes = async (req, res, next) => {
  try {
    const { symbols } = req.query;

    if (!symbols) {
      const err = new Error(
        'Query parameter "symbols" is required. Example: /api/stocks/multiple?symbols=AAPL,TSLA,MSFT'
      );
      err.statusCode = 400;
      throw err;
    }

    const symbolList = symbols
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (symbolList.length === 0) {
      const err = new Error("No valid symbols provided.");
      err.statusCode = 400;
      throw err;
    }

    logger.debug(
      `[StockController] getMultipleStockQuotes → [${symbolList.join(", ")}]`
    );

    const results = await stockService.getMultipleStockQuotes(symbolList);

    // Separate successes from per-symbol failures
    const successes = results.filter((r) => !r.error);
    const failures = results.filter((r) => r.error);

    return res.status(200).json({
      success: true,
      requested: symbolList.length,
      resolved: successes.length,
      failed: failures.length,
      data: results,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/stocks/subscriptions ────────────────────────────────────────────

/**
 * Return the list of symbols currently subscribed to via the Finnhub WebSocket.
 * The controller reads from the socket manager that was attached to `app.locals`
 * in app.js.
 */
const getSubscriptions = (req, res) => {
  const manager = req.app.locals.finnhubManager;
  const symbols = manager ? manager.getSubscribedSymbols() : [];

  return res.status(200).json({
    success: true,
    data: { symbols },
  });
};

// ── POST /api/stocks/subscribe ───────────────────────────────────────────────

/**
 * Dynamically subscribe the Finnhub WebSocket to a new symbol.
 *
 * Body: { "symbol": "NVDA" }
 */
const subscribeSymbol = (req, res, next) => {
  try {
    const { symbol } = req.body || {};

    if (!symbol || typeof symbol !== "string") {
      const err = new Error('Request body must contain a "symbol" string.');
      err.statusCode = 400;
      throw err;
    }

    const manager = req.app.locals.finnhubManager;
    if (!manager) {
      const err = new Error("WebSocket manager not available.");
      err.statusCode = 503;
      throw err;
    }

    manager.subscribe(symbol.trim().toUpperCase());

    return res.status(200).json({
      success: true,
      message: `Subscribed to ${symbol.toUpperCase()}`,
      data: { symbols: manager.getSubscribedSymbols() },
    });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/stocks/subscribe ─────────────────────────────────────────────

/**
 * Unsubscribe the Finnhub WebSocket from a symbol.
 *
 * Body: { "symbol": "NVDA" }
 */
const unsubscribeSymbol = (req, res, next) => {
  try {
    const { symbol } = req.body || {};

    if (!symbol || typeof symbol !== "string") {
      const err = new Error('Request body must contain a "symbol" string.');
      err.statusCode = 400;
      throw err;
    }

    const manager = req.app.locals.finnhubManager;
    if (!manager) {
      const err = new Error("WebSocket manager not available.");
      err.statusCode = 503;
      throw err;
    }

    manager.unsubscribe(symbol.trim().toUpperCase());

    return res.status(200).json({
      success: true,
      message: `Unsubscribed from ${symbol.toUpperCase()}`,
      data: { symbols: manager.getSubscribedSymbols() },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/stocks/health ────────────────────────────────────────────────────

/**
 * Health check: returns server uptime, cache stats, and WS status.
 */
const healthCheck = (req, res) => {
  const manager = req.app.locals.finnhubManager;

  return res.status(200).json({
    success: true,
    data: {
      status: "ok",
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      cache: stockService.getCacheStats(),
      websocket: {
        connected: manager?.ws != null,
        subscribedSymbols: manager?.getSubscribedSymbols() ?? [],
        reconnectAttempts: manager?._reconnectAttempts ?? 0,
      },
    },
  });
};


// ── GET /api/stocks/ai-prediction?symbol=AAPL ─────────────────────────────

/**
 * Fetch AI Stock Price Prediction & LLM Analysis for a symbol.
 */
const getAiPrediction = async (req, res, next) => {
  try {
    const { symbol } = req.query;
    if (!symbol) {
      const err = new Error('Query parameter "symbol" is required.');
      err.statusCode = 400;
      throw err;
    }

    const aiService = require("../services/aiService");
    const prediction = await aiService.getAiPrediction(symbol);

    return res.status(200).json({
      success: true,
      data: prediction,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/stocks/news ──────────────────────────────────────────────────────

/**
 * Fetch real-time general market news from Finnhub.
 */
const getMarketNews = async (req, res, next) => {
  try {
    const category = req.query.category || "general";
    const news = await stockService.getMarketNews(category);
    return res.status(200).json({
      success: true,
      data: news,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getStockQuote,
  getMultipleStockQuotes,
  getSubscriptions,
  subscribeSymbol,
  unsubscribeSymbol,
  healthCheck,
  getAiPrediction,
  getMarketNews,
};
