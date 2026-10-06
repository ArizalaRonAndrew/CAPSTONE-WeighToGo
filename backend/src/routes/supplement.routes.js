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
const { cacheGet } = require("../middleware/cache");
const { idempotency } = require("../middleware/idempotency");

const router = Router();

router.use(authenticate);

router.get("/due", cacheGet("supplements:due", 120), listDueSupplements);
router.get("/compliance", cacheGet("supplements:compliance", 120), listComplianceMasterlist);
router.get("/schedule", cacheGet("supplements:schedule", 120), getChildSupplementSchedule);
router.get("/", cacheGet("supplements:list", 120), listSupplements);
router.get("/:id", getSupplement);
router.post("/", authorize("BNS"), idempotency(), createSupplement);
router.patch("/:id", authorize("BNS"), updateSupplement);
router.delete("/:id", authorize("BNS"), deleteSupplement);

module.exports = router;
