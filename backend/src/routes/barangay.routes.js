const { Router } = require("express");
const { listBarangays } = require("../controllers/barangay.controller");
const { authenticate } = require("../middleware/auth");

const router = Router();

router.get("/", authenticate, listBarangays);

module.exports = router;
