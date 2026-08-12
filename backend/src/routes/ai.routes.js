const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { analyzeBarangaySignificance } = require("../controllers/ai.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = Router();

// Every call spends Gemini tokens (and can carry image uploads), so it's
// capped independently of the general API rate limits.
const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI requests. Please wait a few minutes and try again." },
});

router.use(authenticate);

router.post("/barangay-analysis", authorize("MNAO"), aiLimiter, analyzeBarangaySignificance);

module.exports = router;
