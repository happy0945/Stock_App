/**
 * src/middleware/errorHandler.js
 *
 * Centralised Express error-handling middleware.
 *
 * Must be registered LAST in app.js (after all routes) so that errors thrown
 * or passed via next(err) anywhere in the pipeline end up here.
 *
 * Provides:
 *  - Consistent JSON error shape for every error response
 *  - Distinction between operational errors (4xx) and programming bugs (5xx)
 *  - Full stack trace in development, sanitised message in production
 */

const logger = require("../utils/logger");

// ── 404 handler — no route matched ──────────────────────────────────────────
const notFoundHandler = (req, res, next) => {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.statusCode = 404;
  next(err);
};

// ── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  const isProduction = process.env.NODE_ENV === "production";

  // Always log the full error server-side
  if (statusCode >= 500) {
    logger.error(`[ErrorHandler] ${err.message}`, { stack: err.stack });
  } else {
    logger.warn(`[ErrorHandler] ${statusCode} — ${err.message}`);
  }

  const body = {
    success: false,
    error: {
      message:
        isProduction && statusCode === 500
          ? "An unexpected error occurred. Please try again later."
          : err.message,
      statusCode,
      ...(isProduction ? {} : { stack: err.stack }),
    },
  };

  res.status(statusCode).json(body);
};

module.exports = { notFoundHandler, errorHandler };
