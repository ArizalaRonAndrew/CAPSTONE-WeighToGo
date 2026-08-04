// Admins only see assessment rows once the assigned BNS has marked them
// submitted (tbl_assessments.submission_status = "submitted"). BNS users
// always see their own data live, including drafts.
function filterSubmittedForRole(req, rows) {
  if (req.user.role !== "MNAO") return rows;
  return rows.filter((row) => row.submission_status === "submitted");
}

module.exports = { filterSubmittedForRole };
