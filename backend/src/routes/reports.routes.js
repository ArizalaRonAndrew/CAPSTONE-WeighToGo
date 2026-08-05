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
} = require("../controllers/reports.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = Router();

router.use(authenticate);

router.get("/nutrition", getNutritionReport);
router.get("/monthly-masterlist", getMonthlyMasterlistReport);
router.get("/vitamins", getVitaminReport);
router.get("/growth-summary", getGrowthSummaryReport);
router.get("/trends", authorize("MNAO"), getTrends);
router.get("/barangay-comparison", authorize("MNAO"), getBarangayComparison);
router.get("/barangay-health-status", authorize("MNAO"), getBarangayHealthStatus);
router.get("/submission-status", getSubmissionStatus);
router.post("/submit", authorize("BNS"), submitMonthlyReport);

module.exports = router;
