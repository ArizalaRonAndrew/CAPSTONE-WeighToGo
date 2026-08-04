const { Router } = require("express");
const {
  listSupplements,
  listDueSupplements,
  listComplianceMasterlist,
  getSupplement,
  createSupplement,
  updateSupplement,
  deleteSupplement,
} = require("../controllers/supplement.controller");
const { authenticate } = require("../middleware/auth");

const router = Router();

router.use(authenticate);

router.get("/due", listDueSupplements);
router.get("/compliance", listComplianceMasterlist);
router.get("/", listSupplements);
router.get("/:id", getSupplement);
router.post("/", createSupplement);
router.patch("/:id", updateSupplement);
router.delete("/:id", deleteSupplement);

module.exports = router;
