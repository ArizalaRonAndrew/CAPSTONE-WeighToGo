const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const routes = require("./routes");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

// Rate limiters (loginLimiter, aiLimiter) key off req.ip. Without this,
// behind any reverse proxy req.ip resolves to the proxy's own address for
// every request, collapsing all users into one shared bucket — turning
// brute-force protection into an accidental denial-of-service for a whole
// office network. `1` trusts exactly the first hop (the proxy itself), which
// is the correct setting for a single-reverse-proxy PaaS deployment (Render,
// Railway, Heroku, etc.) — unlike `true`, it won't trust an arbitrary chain
// of forwarded-for headers a client could spoof directly.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

// Every /api response carries data that's tied to the caller's session (or
// is only meaningful if fresh) — no-store keeps browsers, proxies, and the
// bfcache from serving a stale/authenticated snapshot after logout.
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});
app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
