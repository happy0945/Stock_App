# 📈 Real-time Stock Market Backend

Production-ready Node.js + Express backend that streams live stock prices from
the [Finnhub API](https://finnhub.io) to frontend clients over Socket.io.

---

## Stack

| Layer | Technology |
|---|---|
| HTTP server | Node.js + Express |
| Real-time | Socket.io + Finnhub WebSocket |
| REST calls | Axios |
| Caching | node-cache |
| Rate limiting | express-rate-limit |
| Logging | Winston |
| Config | dotenv |

---

## Folder Structure

```
src/
 ├── config/
 │    └── finnhub.js          # Centralised Finnhub constants
 ├── controllers/
 │    └── stockController.js  # Route handlers (thin, delegates to services)
 ├── services/
 │    └── stockService.js     # Finnhub REST client + in-memory cache
 ├── sockets/
 │    └── stockSocket.js      # Finnhub WebSocket manager + Socket.io bridge
 ├── routes/
 │    └── stockRoutes.js      # Express router
 ├── utils/
 │    └── logger.js           # Winston logger
 ├── middleware/
 │    ├── errorHandler.js     # 404 + global error handler
 │    └── rateLimiter.js      # express-rate-limit config
 ├── app.js                   # Express app factory
 └── server.js                # Entry point: HTTP + Socket.io + graceful shutdown
```

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# → edit .env and set FINNHUB_API_KEY

# 3. Run in development (with auto-reload)
npm run dev

# 4. Run in production
NODE_ENV=production npm start
```

---

## REST Endpoints

### `GET /api/stocks?symbol=AAPL`
Fetch a real-time quote for one symbol.

**Response**
```json
{
  "success": true,
  "data": {
    "symbol": "AAPL",
    "currentPrice": 189.84,
    "change": -0.96,
    "percentChange": -0.5028,
    "highPrice": 191.05,
    "lowPrice": 188.18,
    "openPrice": 190.33,
    "previousClose": 190.80,
    "timestamp": "2024-07-08T19:59:59.000Z",
    "fetchedAt": "2024-07-08T20:00:01.123Z",
    "fromCache": false
  }
}
```

---

### `GET /api/stocks/multiple?symbols=AAPL,TSLA,MSFT`
Fetch quotes for up to 20 symbols in parallel.

**Response**
```json
{
  "success": true,
  "requested": 3,
  "resolved": 3,
  "failed": 0,
  "data": [
    { "symbol": "AAPL", "data": { ... } },
    { "symbol": "TSLA", "data": { ... } },
    { "symbol": "MSFT", "data": { ... } }
  ]
}
```

---

### `GET /api/stocks/subscriptions`
List all symbols the server is streaming from Finnhub.

### `POST /api/stocks/subscribe`  `{ "symbol": "NVDA" }`
Subscribe the Finnhub WebSocket to a new symbol at runtime.

### `DELETE /api/stocks/subscribe`  `{ "symbol": "NVDA" }`
Unsubscribe a symbol.

### `GET /api/stocks/health`
Returns uptime, cache stats, and WebSocket status.

---

## WebSocket (Socket.io)

Connect from your frontend:

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:5000");

// Subscribe to a symbol room
socket.emit("subscribe", { symbol: "AAPL" });

// Receive live trade updates
socket.on("stock:trade", (trade) => {
  console.log(trade);
  // {
  //   symbol: "AAPL",
  //   price: 189.91,
  //   volume: 250,
  //   timestamp: "2024-07-08T20:00:05.000Z",
  //   priceChange: 0.07,
  //   priceChangePercent: 0.0369
  // }
});

// Global Finnhub connection status
socket.on("finnhub:status", ({ connected }) => {
  console.log("Feed connected:", connected);
});

// Unsubscribe
socket.emit("unsubscribe", { symbol: "AAPL" });
```

---

## Environment Variables

See [`.env.example`](.env.example) for all options.

| Variable | Default | Description |
|---|---|---|
| `FINNHUB_API_KEY` | — | **Required.** Your Finnhub API key |
| `PORT` | `5000` | HTTP server port |
| `NODE_ENV` | `development` | `development` or `production` |
| `CACHE_TTL` | `15` | Quote cache TTL in seconds |
| `DEFAULT_SYMBOLS` | `AAPL,TSLA,MSFT,AMZN,GOOGL` | Symbols subscribed on startup |
| `WS_RECONNECT_INTERVAL_MS` | `5000` | Base delay between WS reconnects |
| `WS_MAX_RECONNECT_ATTEMPTS` | `10` | Max reconnect attempts |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window (ms) |
| `RATE_LIMIT_MAX` | `200` | Max requests per window (global) |

---

## Caching

Quotes are cached in-memory for `CACHE_TTL` seconds. The cache is automatically
busted whenever a live trade arrives over the WebSocket, ensuring REST responses
stay fresh after a real-time update.

## Rate Limiting

Two tiers:
- **Global limiter** — 200 requests / minute per IP (all routes)
- **Stock limiter** — 60 requests / minute per IP (data routes only, mirrors Finnhub free tier)

---

## Get a Free Finnhub API Key

1. Visit [finnhub.io](https://finnhub.io)
2. Sign up for a free account
3. Copy your API key from the dashboard
4. Paste it into your `.env` file

Free tier: 60 API calls/minute, real-time US stock data included.
