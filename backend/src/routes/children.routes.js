const { Router } = require("express");
const {
  listChildren,
  getChild,
  createChild,
  updateChild,
  deleteChild,
} = require("../controllers/children.controller");
const { authenticate } = require("../middleware/auth");

const router = Router();

router.use(authenticate);

router.get("/", listChildren);
router.get("/:id", getChild);
router.post("/", createChild);
router.patch("/:id", updateChild);
router.delete("/:id", deleteChild);

module.exports = router;
