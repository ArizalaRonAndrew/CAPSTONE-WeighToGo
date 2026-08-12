const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const routes = require("./routes");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
// Default 100kb is too small for the Barangay Map AI explainer, which can
// carry a few base64-encoded screenshots (capped at 4MB raw / image, 3
// images max — see ai.controller.js) alongside its JSON payload.
app.use(express.json({ limit: "16mb" }));
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
