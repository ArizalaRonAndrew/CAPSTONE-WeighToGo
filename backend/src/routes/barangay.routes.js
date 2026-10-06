const { Router } = require("express");
const { listBarangays } = require("../controllers/barangay.controller");
const { authenticate } = require("../middleware/auth");
const { cacheGet } = require("../middleware/cache");

const router = Router();

router.get("/", authenticate, cacheGet("barangays:list", 300), listBarangays);

module.exports = router;
