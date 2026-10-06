const { Router } = require("express");
const {
  listChildren,
  getChild,
  createChild,
  updateChild,
  deleteChild,
} = require("../controllers/children.controller");
const { authenticate, authorize } = require("../middleware/auth");
const { cacheGet } = require("../middleware/cache");
const { idempotency } = require("../middleware/idempotency");

const router = Router();

router.use(authenticate);

router.get("/", cacheGet("children:list", 120), listChildren);
router.get("/:id", getChild);
router.post("/", authorize("BNS"), idempotency(), createChild);
router.patch("/:id", authorize("BNS"), updateChild);
router.delete("/:id", authorize("BNS"), deleteChild);

module.exports = router;
