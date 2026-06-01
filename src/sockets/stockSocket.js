/**
 * src/sockets/stockSocket.js
 *
 * Manages the persistent WebSocket connection to Finnhub's real-time feed.
 *
 * Architecture:
 *  ┌─────────┐  subscribe/    ┌──────────────────────┐   Finnhub WS   ┌──────────┐
 *  │ Frontend│─unsubscribe──▶│  FinnhubSocketManager │◀─────────────▶│ Finnhub  │
 *  │ clients │◀──live trades─│  (this module)        │               │   API    │
 *  └─────────┘               └──────────────────────┘               └──────────┘
 *
 * Responsibilities:
 *  1. Open + maintain a single WebSocket to Finnhub (auto-reconnect on drop).
 *  2. Track which symbols are currently subscribed.
 *  3. On each trade event: broadcast to all connected Socket.io clients and
 *     bust the REST cache so subsequent REST calls get fresh data.
 *  4. Expose `subscribe(symbol)` and `unsubscribe(symbol)` so Socket.io
 *     clients can dynamically add/remove symbols without a server restart.
 */

const WebSocket = require("ws");
const finnhubConfig = require("../config/finnhub");
const logger = require("../utils/logger");
const { bustCache } = require("../services/stockService");

class FinnhubSocketManager {
  /**
   * @param {import("socket.io").Server} io  The Socket.io server instance
   */
  constructor(io) {
    this.io = io;
    this.ws = null;

    /** @type {Set<string>} symbols currently subscribed with Finnhub */
    this.subscribedSymbols = new Set();

    this._reconnectAttempts = 0;
    this._reconnectTimer = null;
    this._isShuttingDown = false;

    // Track latest price per symbol for quick delta detection
    this._lastPrices = new Map();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Open the Finnhub WebSocket and wire up all event handlers. */
  connect() {
    if (this.ws) {
      logger.warn("[FinnhubWS] connect() called while a socket already exists");
      return;
    }

    const url = `${finnhubConfig.wsUrl}?token=${finnhubConfig.apiKey}`;
    logger.info("[FinnhubWS] Connecting to Finnhub WebSocket…");

    this.ws = new WebSocket(url);

    this.ws.on("open", () => this._onOpen());
    this.ws.on("message", (raw) => this._onMessage(raw));
    this.ws.on("error", (err) => this._onError(err));
    this.ws.on("close", (code, reason) => this._onClose(code, reason));
  }

  /** Gracefully close the socket and prevent reconnects. */
  disconnect() {
    this._isShuttingDown = true;
    clearTimeout(this._reconnectTimer);
    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }
    logger.info("[FinnhubWS] Disconnected.");
  }

  // ── Subscription management ────────────────────────────────────────────────

  /**
   * Subscribe to real-time trades for `symbol`.
   * Safe to call multiple times — duplicate subscriptions are ignored.
   *
   * @param {string} symbol  e.g. "AAPL"
   */
  subscribe(symbol) {
    const s = symbol.toUpperCase();
    if (this.subscribedSymbols.has(s)) {
      logger.debug(`[FinnhubWS] Already subscribed to ${s}`);
      return;
    }
    this.subscribedSymbols.add(s);
    this._sendSubscribe(s);
    logger.info(`[FinnhubWS] Subscribed to ${s}`);
  }

  /**
   * Unsubscribe from real-time trades for `symbol`.
   *
   * @param {string} symbol  e.g. "AAPL"
   */
  unsubscribe(symbol) {
    const s = symbol.toUpperCase();
    if (!this.subscribedSymbols.has(s)) return;
    this.subscribedSymbols.delete(s);
    this._sendUnsubscribe(s);
    logger.info(`[FinnhubWS] Unsubscribed from ${s}`);
  }

  /** Return a snapshot of the currently subscribed symbols. */
  getSubscribedSymbols() {
    return [...this.subscribedSymbols];
  }

  // ── WebSocket event handlers ───────────────────────────────────────────────

  _onOpen() {
    this._reconnectAttempts = 0;
    logger.info("[FinnhubWS] Connection established.");

    // Re-subscribe to all tracked symbols (handles reconnect scenario too)
    for (const symbol of this.subscribedSymbols) {
      this._sendSubscribe(symbol);
    }

    // Subscribe default symbols on first connect if none are tracked yet
    if (this.subscribedSymbols.size === 0) {
      for (const symbol of finnhubConfig.defaultSymbols) {
        this.subscribe(symbol);
      }
    }

    // Notify all frontend clients that the upstream feed is live
    this.io.emit("finnhub:status", { connected: true });
  }

  _onMessage(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      logger.warn("[FinnhubWS] Received non-JSON message:", raw.toString());
      return;
    }

    // Finnhub sends { type: "trade", data: [...] } or { type: "ping" }
    switch (parsed.type) {
      case "trade":
        this._handleTradeData(parsed.data || []);
        break;
      case "ping":
        // Respond to keep-alive pings
        this._safeSend(JSON.stringify({ type: "pong" }));
        break;
      case "error":
        logger.error("[FinnhubWS] Server-side error:", parsed.msg);
        break;
      default:
        logger.debug("[FinnhubWS] Unknown message type:", parsed.type);
    }
  }

  _onError(err) {
    logger.error("[FinnhubWS] WebSocket error:", err.message);
  }

  _onClose(code, reason) {
    this.ws = null;
    logger.warn(
      `[FinnhubWS] Connection closed — code: ${code}, reason: ${reason?.toString() || "none"}`
    );

    // Notify all frontend clients that the upstream feed is down
    this.io.emit("finnhub:status", { connected: false });

    if (!this._isShuttingDown) {
      this._scheduleReconnect();
    }
  }

  // ── Data processing ────────────────────────────────────────────────────────

  /**
   * Process an array of trade objects from Finnhub and broadcast to clients.
   *
   * Finnhub trade shape:
   *   { s: "AAPL", p: 150.25, t: 1234567890000, v: 100, c: [...conditions] }
   */
  _handleTradeData(trades) {
    if (!trades.length) return;

    // Group trades by symbol and keep only the latest price per symbol
    const latestBySymbol = new Map();

    for (const trade of trades) {
      const existing = latestBySymbol.get(trade.s);
      if (!existing || trade.t > existing.t) {
        latestBySymbol.set(trade.s, trade);
      }
    }

    for (const [symbol, trade] of latestBySymbol) {
      const previous = this._lastPrices.get(symbol);
      const priceChange = previous != null ? trade.p - previous : 0;
      const priceChangePercent =
        previous != null && previous !== 0
          ? ((trade.p - previous) / previous) * 100
          : 0;

      const payload = {
        symbol,
        price: trade.p,
        volume: trade.v,
        timestamp: new Date(trade.t).toISOString(),
        conditions: trade.c || [],
        priceChange: parseFloat(priceChange.toFixed(4)),
        priceChangePercent: parseFloat(priceChangePercent.toFixed(4)),
      };

      // Update last-known price
      this._lastPrices.set(symbol, trade.p);

      // Bust REST cache so next HTTP request returns up-to-date data
      bustCache(symbol);

      // Broadcast to all Socket.io clients (global room)
      this.io.emit("stock:trade", payload);

      // Also emit on a per-symbol room for clients that only care about one ticker
      this.io.to(`symbol:${symbol}`).emit("stock:trade", payload);

      logger.debug(
        `[FinnhubWS] Trade → ${symbol} @ $${trade.p} (vol: ${trade.v})`
      );
    }
  }

  // ── Reconnect logic ────────────────────────────────────────────────────────

  _scheduleReconnect() {
    if (
      this._reconnectAttempts >= finnhubConfig.wsMaxReconnectAttempts
    ) {
      logger.error(
        "[FinnhubWS] Max reconnect attempts reached. Will not retry automatically."
      );
      this.io.emit("finnhub:status", {
        connected: false,
        fatal: true,
        message: "Real-time feed unavailable. Please refresh.",
      });
      return;
    }

    this._reconnectAttempts++;
    const delay =
      finnhubConfig.wsReconnectInterval * this._reconnectAttempts; // linear back-off

    logger.info(
      `[FinnhubWS] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts}/${finnhubConfig.wsMaxReconnectAttempts})…`
    );

    this._reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Send a subscribe message only when the socket is open. */
  _sendSubscribe(symbol) {
    this._safeSend(JSON.stringify({ type: "subscribe", symbol }));
  }

  /** Send an unsubscribe message only when the socket is open. */
  _sendUnsubscribe(symbol) {
    this._safeSend(JSON.stringify({ type: "unsubscribe", symbol }));
  }

  /** Guard: only send if the WS is in OPEN state. */
  _safeSend(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    }
  }
}

// ── Bootstrap helper ─────────────────────────────────────────────────────────

/**
 * Initialise the Finnhub socket manager and wire Socket.io client events.
 *
 * @param {import("socket.io").Server} io
 * @returns {FinnhubSocketManager}
 */
const initFinnhubSocket = (io) => {
  const manager = new FinnhubSocketManager(io);
  manager.connect();

  // ── Socket.io — handle frontend client connections ──────────────────────
  io.on("connection", (socket) => {
    logger.info(`[Socket.io] Client connected: ${socket.id}`);

    // Send the current subscription list to the newly connected client
    socket.emit("stock:subscriptions", {
      symbols: manager.getSubscribedSymbols(),
    });

    // Client wants to subscribe to a specific symbol's room
    socket.on("subscribe", ({ symbol } = {}) => {
      if (!symbol || typeof symbol !== "string") {
        socket.emit("error", { message: "symbol is required to subscribe" });
        return;
      }
      const s = symbol.toUpperCase();
      socket.join(`symbol:${s}`);           // Join per-symbol room
      manager.subscribe(s);                 // Ensure Finnhub is subscribed
      logger.debug(`[Socket.io] ${socket.id} subscribed to ${s}`);
      socket.emit("subscribe:ack", { symbol: s, success: true });
    });

    // Client wants to unsubscribe from a specific symbol's room
    socket.on("unsubscribe", ({ symbol } = {}) => {
      if (!symbol || typeof symbol !== "string") {
        socket.emit("error", { message: "symbol is required to unsubscribe" });
        return;
      }
      const s = symbol.toUpperCase();
      socket.leave(`symbol:${s}`);
      logger.debug(`[Socket.io] ${socket.id} unsubscribed from ${s}`);
      socket.emit("unsubscribe:ack", { symbol: s, success: true });
    });

    // Client disconnected
    socket.on("disconnect", (reason) => {
      logger.info(`[Socket.io] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  return manager;
};

module.exports = { FinnhubSocketManager, initFinnhubSocket };
