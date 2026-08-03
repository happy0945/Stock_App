
require("dotenv").config();

const http    = require("http");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const app    = require("./app");           // ← Express app (fully configured)
const logger = require("./utils/logger");

const { initFinnhubSocket } = require("./sockets/stockSocket");

const PORT = process.env.PORT || 5000;

// ── 1. Create ONE http.Server from the Express app ────────────────────────────
//   Both REST requests and WebSocket upgrades flow through this single server.
const server = http.createServer(app);

// ── 2. Attach Socket.IO to the same server ────────────────────────────────────
//   Socket.IO needs its OWN cors config — it does not inherit from Express.

const ALLOWED_ORIGINS = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
];

const ALL_ORIGINS = [
  ...new Set([...ALLOWED_ORIGINS, ...DEV_ORIGINS, "https://stockpulse-uaff.onrender.com"]),
];

const io = new Server(server, {
  cors: {
    origin: (incomingOrigin, callback) => {
      if (!incomingOrigin) return callback(null, true);
      if (ALL_ORIGINS.includes(incomingOrigin) || incomingOrigin.includes("localhost") || incomingOrigin.includes("127.0.0.1")) {
        return callback(null, true);
      }
      return callback(null, true); // Allow all during dev for WS upgrade
    },
    methods:     ["GET", "POST"],
    credentials: true,
  },
  // Allows the client to fall back to long-polling if WS is blocked
  transports: ["websocket", "polling"],
});

// Make `io` accessible inside Express routes/controllers via req.app.get("io")
app.set("io", io);

// ── 3. Initialize Finnhub WebSocket Manager & wire up Socket.IO events ──────
const finnhubManager = initFinnhubSocket(io);
app.locals.finnhubManager = finnhubManager;

// ── 4. Connect to MongoDB, then start the server ──────────────────────────────
const dbName = process.env.DB_NAME || "stockdb";
mongoose
  .connect(process.env.MONGODB_URI, { dbName })
  .then(() => {
    logger.info(`✅  MongoDB connected to database: ${dbName}`);

    server.listen(PORT, () => {
      logger.info(`🚀  StockPulse API   → http://localhost:${PORT}`);
      logger.info(`🔌  Socket.IO ready  → ws://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    logger.error(`❌  MongoDB connection failed: ${err.message}`);
    process.exit(1);
  });

// ── 5. Graceful shutdown ──────────────────────────────────────────────────────
const shutdown = (signal) => {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    mongoose.connection.close(false, () => {
      logger.info("MongoDB connection closed");
      process.exit(0);
    });
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));