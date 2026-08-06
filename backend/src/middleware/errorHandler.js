function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  console.error(err);
  // err.status is only ever set by our own controllers throwing a deliberate,
  // safe-to-show message (validation, 403, 404, etc). Anything without it is
  // an unexpected failure — often a raw Supabase/Postgres error whose message
  // can contain table/column names — so it gets a generic message instead of
  // being forwarded to the client verbatim.
  const status = err.status || 500;
  const message = err.status ? err.message : "Internal server error";
  res.status(status).json({ error: message });
}

module.exports = { notFound, errorHandler };
