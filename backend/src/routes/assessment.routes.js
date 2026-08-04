const { Router } = require("express");
const {
  listAssessments,
  getAssessment,
  createAssessment,
  previewAssessment,
  updateAssessment,
  deleteAssessment,
} = require("../controllers/assessment.controller");
const { authenticate } = require("../middleware/auth");

const router = Router();

router.use(authenticate);

router.get("/", listAssessments);
router.post("/preview", previewAssessment);
router.get("/:id", getAssessment);
router.post("/", createAssessment);
router.patch("/:id", updateAssessment);
router.delete("/:id", deleteAssessment);

module.exports = router;
