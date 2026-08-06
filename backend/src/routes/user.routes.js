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
// unauthenticated route, so it's the only real brute-force surface left;
// keyed per-IP, generous enough not to bother a real user mistyping a
// password a few times.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});

router.post("/login", loginLimiter, loginUser);
router.post("/logout", logoutUser);
router.get("/me", authenticate, getCurrentUser);

router.get("/", authenticate, authorize("MNAO"), listUsers);
router.get("/:id", authenticate, authorize("MNAO"), getUser);
router.patch("/:id/status", authenticate, authorize("MNAO"), updateUserStatus);

module.exports = router;
