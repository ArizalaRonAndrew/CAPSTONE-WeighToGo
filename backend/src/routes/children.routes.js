const { Router } = require("express");
const {
  listChildren,
  getChild,
  createChild,
  updateChild,
  deleteChild,
} = require("../controllers/children.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = Router();

router.use(authenticate);

router.get("/", listChildren);
router.get("/:id", getChild);
router.post("/", authorize("BNS"), createChild);
router.patch("/:id", authorize("BNS"), updateChild);
router.delete("/:id", authorize("BNS"), deleteChild);

module.exports = router;
