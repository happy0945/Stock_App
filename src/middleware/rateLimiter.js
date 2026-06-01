/**
 * src/middleware/rateLimiter.js
 *
 * Express rate-limiting middleware built on `express-rate-limit`.
 *
 * Two limiters are exported:
 *  - `globalLimiter`  — applied to every route; liberal ceiling.
 *  - `stockLimiter`   — applied only to stock-data routes; tighter limit
 *                       that mirrors Finnhub's free-tier quota (~60 req/min).
 *
 * Configuration is driven by environment variables so you can tighten limits
 * in production without a code change.
 */

const rateLimit = require("express-rate-limit");
const logger = require("../utils/logger");

// ── Helper: shared key generator (uses IP) ───────────────────────────────────
const keyGenerator = (req) =>
  req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.ip;

// ── Global limiter ───────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || "200", 10),
  standardHeaders: true, // Return rate-limit info in RateLimit-* headers
  legacyHeaders: false,
  keyGenerator,
  handler: (req, res) => {
    logger.warn(`[RateLimiter] Global limit hit — IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: {
        message: "Too many requests. Please slow down.",
        statusCode: 429,
        retryAfter: Math.ceil(
          parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10) / 1000
        ),
      },
    });
  },
});

// ── Stock-routes limiter (mirrors Finnhub free-tier ~60 req/min) ─────────────
const stockLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  message: {
    success: false,
    error: {
      message:
        "Stock API rate limit exceeded. Finnhub free tier allows 60 requests/minute.",
      statusCode: 429,
    },
  },
  handler: (req, res, next, options) => {
    logger.warn(
      `[RateLimiter] Stock limit hit — IP: ${req.ip} — ${req.originalUrl}`
    );
    res.status(options.statusCode).json(options.message);
  },
});

module.exports = { globalLimiter, stockLimiter };
