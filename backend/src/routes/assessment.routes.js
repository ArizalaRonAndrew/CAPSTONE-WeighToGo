const { Router } = require("express");
const {
  listAssessments,
  getAssessment,
  createAssessment,
  previewAssessment,
  updateAssessment,
  deleteAssessment,
} = require("../controllers/assessment.controller");
const { authenticate, authorize } = require("../middleware/auth");
const { cacheGet } = require("../middleware/cache");
const { idempotency } = require("../middleware/idempotency");

const router = Router();

router.use(authenticate);

router.get("/", cacheGet("assessments:list", 60), listAssessments);
router.post("/preview", previewAssessment);
router.get("/:id", getAssessment);
router.post("/", authorize("BNS"), idempotency(), createAssessment);
router.patch("/:id", authorize("BNS"), updateAssessment);
router.delete("/:id", authorize("BNS"), deleteAssessment);

module.exports = router;
