/**
 * src/utils/logger.js
 *
 * Application-wide logger built on Winston.
 * - Writes human-readable coloured logs to the console in development.
 * - Writes structured JSON logs to files in production (errors → error.log,
 *   everything else → combined.log).
 * - Import and use `logger.info()`, `logger.warn()`, `logger.error()`, etc.
 *   throughout the codebase instead of raw `console.log`.
 */

const { createLogger, format, transports } = require("winston");
const path = require("path");

const { combine, timestamp, printf, colorize, errors, json } = format;

const isProduction = process.env.NODE_ENV === "production";

// ── Custom console format ────────────────────────────────────────────────────
const consoleFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

// ── Transports ───────────────────────────────────────────────────────────────
const logTransports = [
  new transports.Console({
    format: combine(
      colorize({ all: true }),
      timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      errors({ stack: true }),
      consoleFormat
    ),
  }),
];

// In production also persist logs on disk
if (isProduction) {
  logTransports.push(
    new transports.File({
      filename: path.join(__dirname, "../../logs/error.log"),
      level: "error",
      format: combine(timestamp(), errors({ stack: true }), json()),
    }),
    new transports.File({
      filename: path.join(__dirname, "../../logs/combined.log"),
      format: combine(timestamp(), errors({ stack: true }), json()),
    })
  );
}

// ── Logger instance ──────────────────────────────────────────────────────────
const logger = createLogger({
  level: isProduction ? "info" : "debug",
  transports: logTransports,
  // Prevent Winston from crashing the process on unhandled exceptions
  exitOnError: false,
});

module.exports = logger;
