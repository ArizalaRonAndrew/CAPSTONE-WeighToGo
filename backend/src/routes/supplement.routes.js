const { Router } = require("express");
const {
  listSupplements,
  listDueSupplements,
  listComplianceMasterlist,
  getChildSupplementSchedule,
  getSupplement,
  createSupplement,
  updateSupplement,
  deleteSupplement,
} = require("../controllers/supplement.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = Router();

router.use(authenticate);

router.get("/due", listDueSupplements);
router.get("/compliance", listComplianceMasterlist);
router.get("/schedule", getChildSupplementSchedule);
router.get("/", listSupplements);
router.get("/:id", getSupplement);
router.post("/", authorize("BNS"), createSupplement);
router.patch("/:id", authorize("BNS"), updateSupplement);
router.delete("/:id", authorize("BNS"), deleteSupplement);

module.exports = router;
