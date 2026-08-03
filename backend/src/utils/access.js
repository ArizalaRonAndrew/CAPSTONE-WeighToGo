function assertBarangayAccess(req, child) {
  if (req.user.role === "BNS" && child.barangay !== req.user.assigned_barangay) {
    const err = new Error("You do not have access to this barangay's records");
    err.status = 403;
    throw err;
  }
}

module.exports = { assertBarangayAccess };
