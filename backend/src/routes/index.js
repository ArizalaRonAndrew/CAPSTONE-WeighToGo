const { Router } = require("express");
const healthRoutes = require("./health.routes");
const userRoutes = require("./user.routes");
const childrenRoutes = require("./children.routes");
const assessmentRoutes = require("./assessment.routes");
const supplementRoutes = require("./supplement.routes");
const reportsRoutes = require("./reports.routes");
const barangayRoutes = require("./barangay.routes");
const aiRoutes = require("./ai.routes");

const router = Router();

router.use("/health", healthRoutes);
router.use("/users", userRoutes);
router.use("/children", childrenRoutes);
router.use("/assessments", assessmentRoutes);
router.use("/supplements", supplementRoutes);
router.use("/reports", reportsRoutes);
router.use("/barangays", barangayRoutes);
router.use("/ai", aiRoutes);

module.exports = router;
