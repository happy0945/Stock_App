
require("dotenv").config();

const http    = require("http");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const app    = require("./app");           // ← Express app (fully configured)
const logger = require("./utils/logger");

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

const ALL_ORIGINS = [
  ...new Set([...ALLOWED_ORIGINS, "http://localhost:3001", "http://localhost:5173"]),
];

const io = new Server(server, {
  cors: {
    origin:      ALL_ORIGINS,
    methods:     ["GET", "POST"],
    credentials: true,
  },
  // Allows the client to fall back to long-polling if WS is blocked
  transports: ["websocket", "polling"],
});

// Make `io` accessible inside Express routes/controllers via req.app.get("io")
app.set("io", io);

// ── 3. Socket.IO connection handler ───────────────────────────────────────────
io.on("connection", (socket) => {
  logger.info(`[Socket] Client connected: ${socket.id}`);

  socket.on("subscribe", (symbol) => {
    socket.join(symbol);
    logger.debug(`[Socket] ${socket.id} subscribed to ${symbol}`);
  });

  socket.on("unsubscribe", (symbol) => {
    socket.leave(symbol);
    logger.debug(`[Socket] ${socket.id} unsubscribed from ${symbol}`);
  });

  socket.on("disconnect", (reason) => {
    logger.info(`[Socket] Client disconnected: ${socket.id} (${reason})`);
  });
});

// ── 4. Connect to MongoDB, then start the server ──────────────────────────────
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    logger.info("✅  MongoDB connected");

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