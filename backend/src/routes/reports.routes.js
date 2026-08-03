const { Router } = require("express");
const {
  getNutritionReport,
  getMonthlyMasterlistReport,
  getVitaminReport,
  getTrends,
  getBarangayComparison,
} = require("../controllers/reports.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = Router();

router.use(authenticate);

router.get("/nutrition", getNutritionReport);
router.get("/monthly-masterlist", getMonthlyMasterlistReport);
router.get("/vitamins", getVitaminReport);
router.get("/trends", authorize("MNAO"), getTrends);
router.get("/barangay-comparison", authorize("MNAO"), getBarangayComparison);

module.exports = router;
