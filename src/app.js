/**
 * app.js
 *
 * Express application factory — configures middleware, routes, error handlers.
 * Does NOT start the HTTP server (that is server.js's job).
 */

require("dotenv").config();

const express = require("express");
const cors    = require("cors");
const helmet  = require("helmet");

const { globalLimiter }                 = require("./middleware/rateLimiter");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const stockRoutes                       = require("./routes/stockRoutes");
const authRoutes                        = require("./routes/authRoutes");
const logger                            = require("./utils/logger");

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
// MUST be first — before every other middleware and route.

const ALLOWED_ORIGINS = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const DEV_ORIGINS = ["http://localhost:3001", "http://localhost:5173"];
const ALL_ORIGINS  = [...new Set([...ALLOWED_ORIGINS, ...DEV_ORIGINS])];

const corsOptions = {
  origin: (incomingOrigin, callback) => {
    // Allow Postman / curl / server-to-server (no Origin header)
    if (!incomingOrigin) return callback(null, true);
    if (ALL_ORIGINS.includes(incomingOrigin)) return callback(null, true);
    logger.warn(`CORS blocked origin: ${incomingOrigin}`);
    return callback(new Error(`CORS: origin ${incomingOrigin} not allowed`));
  },
  credentials:    true,
  methods:        ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // handle preflight for every route

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
app.use(globalLimiter);

// ── Request logger (dev only) ─────────────────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    logger.debug(`→ ${req.method} ${req.originalUrl}`);
    next();
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    service: "Real-time Stock Market API",
    version: "1.0.0",
    status:  "running",
    docs:    "/api/stocks/health",
  });
});

app.use("/api/stocks", stockRoutes);
app.use("/api/auth",   authRoutes);

// ── Error handling (always last) ──────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;