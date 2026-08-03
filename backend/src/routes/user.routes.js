const { Router } = require("express");
const {
  listUsers,
  getUser,
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  updateUserStatus,
} = require("../controllers/user.controller");
const { authenticate, authorize } = require("../middleware/auth");

const router = Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.get("/me", authenticate, getCurrentUser);

router.get("/", authenticate, authorize("MNAO"), listUsers);
router.get("/:id", authenticate, authorize("MNAO"), getUser);
router.patch("/:id/status", authenticate, authorize("MNAO"), updateUserStatus);

module.exports = router;
