const { Router } = require("express");
const {
  getNutritionReport,
  getMonthlyMasterlistReport,
  getVitaminReport,
  getGrowthSummaryReport,
  getTrends,
  getBarangayComparison,
  getBarangayHealthStatus,
  submitMonthlyReport,
  getSubmissionStatus,
  getSyncStatus,
  getMasterlistSummary,
  getMasterlistRows,
} = require("../controllers/reports.controller");
const { authenticate, authorize } = require("../middleware/auth");
const { cacheGet, cacheGetShared } = require("../middleware/cache");

const router = Router();

router.use(authenticate);

router.get("/nutrition", cacheGet("reports:nutrition", 300), getNutritionReport);
router.get("/monthly-masterlist", cacheGet("reports:monthly-masterlist", 300), getMonthlyMasterlistReport);
router.get("/vitamins", cacheGet("reports:vitamins", 300), getVitaminReport);
router.get("/growth-summary", cacheGet("reports:growth-summary", 300), getGrowthSummaryReport);
router.get("/trends", authorize("MNAO"), cacheGetShared("shared:trends", 8 * 60 * 60), getTrends);
router.get("/barangay-comparison", authorize("MNAO"), cacheGetShared("shared:trends:barangay-comparison", 8 * 60 * 60), getBarangayComparison);
router.get("/barangay-health-status", authorize("MNAO"), cacheGet("reports:barangay-health-status", 300), getBarangayHealthStatus);
router.get("/submission-status", cacheGet("reports:submission-status", 60), getSubmissionStatus);
// Revision counters for rev-gated caching — deliberately NOT response-cached.
router.get("/sync-status", getSyncStatus);
// Admin split of the legacy full-rows monthly-masterlist (left untouched for
// the BNS page): KPIs without rows, plus one server-paginated page of rows.
router.get("/monthly-masterlist/summary", cacheGetShared("shared:masterlist:summary", 8 * 60 * 60), getMasterlistSummary);
router.get("/monthly-masterlist/rows", cacheGetShared("shared:masterlist:rows", 8 * 60 * 60), getMasterlistRows);
router.post("/submit", authorize("BNS"), submitMonthlyReport);

module.exports = router;