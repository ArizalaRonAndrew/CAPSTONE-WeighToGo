const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const {
  listUsers,
  getUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  updateUserStatus,
} = require("../controllers/user.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = Router();

// There's no public registration — every account (the one admin, every BNS)
// is created directly in Supabase. Login is still the app's only
// unauthenticated route, so it's the only real brute-force surface left.
//
// Two limiters, because a single per-IP bucket breaks on real office
// networks: an entire barangay office shares one public IP, so one person
// spamming bad passwords burned all 10 attempts for every device behind
// that IP (each other's phones included). Now:
//  - accountLimiter keys on the attempted email: guessing at one account
//    throttles that account only, never its neighbors;
//  - ipBackstop stays on the default per-IP key as a loose net against
//    spray-and-pray across many addresses from one source.
// Both skip successful logins, so a roomful of staff signing in at 8am
// never eats the failure budget.
const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `login:${String(req.body?.email || "").toLowerCase().trim() || req.ip}`,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many failed attempts for this account. Please try again later." },
});

const loginIpBackstop = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});

router.post("/login", loginIpBackstop, loginAccountLimiter, loginUser);
router.post("/logout", logoutUser);
router.get("/me", authenticate, getCurrentUser);

router.get("/", authenticate, authorize("MNAO"), listUsers);
router.get("/:id", authenticate, authorize("MNAO"), getUser);
router.patch("/:id/status", authenticate, authorize("MNAO"), updateUserStatus);

module.exports = router;
