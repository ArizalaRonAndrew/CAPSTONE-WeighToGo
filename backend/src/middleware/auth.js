const jwt = require("jsonwebtoken");
const { JWT_SECRET, COOKIE_NAME } = require("../config/jwt");
const userModel = require("../models/user.model");

function getTokenFromRequest(req) {
  if (req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) return authHeader.slice(7);
  return null;
}

async function authenticate(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  try {
    const currentVersion = await userModel.getTokenVersion(decoded.id);
    // A logged-out (or force-invalidated) token still verifies fine
    // cryptographically until it naturally expires — this DB check is what
    // actually revokes it early, on this and every subsequent request.
    if (currentVersion !== undefined && decoded.token_version !== currentVersion) {
      return res.status(401).json({ error: "Session has been invalidated. Please log in again." });
    }
  } catch (err) {
    return next(err);
  }

  req.user = decoded;
  next();
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to perform this action" });
    }
    next();
  };
}

module.exports = { authenticate, authorize, getTokenFromRequest };
