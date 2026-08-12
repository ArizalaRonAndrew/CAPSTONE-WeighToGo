const childrenModel = require("../models/children.model");
const assessmentModel = require("../models/assessment.model");
const supplementModel = require("../models/supplement.model");
const barangayModel = require("../models/barangay.model");
const { assertBarangayAccess } = require("../utils/access");
const { isValidPhContact } = require("../utils/phone");
const { pickFields } = require("../utils/pickFields");

const CHILD_UPDATE_FIELDS = ["name", "dob", "parent_name", "parent_contact", "barangay", "purok", "gender", "is_ip"];
const REQUIRED_CHILD_FIELDS = ["name", "dob", "parent_name", "barangay", "purok", "gender"];

// A typo'd or since-renamed barangay silently drops a child out of the
// Barangay Map and every barangay-scoped report (they just don't match any
// bucket, with no error surfaced anywhere) — validate against the same
// static list those reports are built from.
const VALID_BARANGAYS = new Set(barangayModel.getAll().map((b) => b.name));

function isValidBarangay(name) {
  return VALID_BARANGAYS.has(name);
}

async function listChildren(req, res, next) {
  try {
    const { status } = req.query;
    let { barangay } = req.query;
    if (req.user.role === "BNS") {
      barangay = req.user.assigned_barangay;
    }
    let children = await childrenModel.findAll({ barangay, status });

    // Admins only see a child once the assigned BNS has submitted at least
    // one checked-up assessment for them. BNS users always see their own
    // full roster, checked or still pending.
    if (req.user.role === "MNAO") {
      const submittedChildIds = await assessmentModel.findSubmittedChildIds(children.map((c) => c.id));
      children = children.filter((c) => submittedChildIds.has(c.id));
    }

    res.json(children);
  } catch (err) {
    next(err);
  }
}

async function getChild(req, res, next) {
  try {
    const child = await childrenModel.findById(req.params.id);
    assertBarangayAccess(req, child);

    if (req.user.role === "MNAO") {
      const submittedChildIds = await assessmentModel.findSubmittedChildIds([child.id]);
      if (!submittedChildIds.has(child.id)) {
        const err = new Error("This child has no submitted checkups yet");
        err.status = 404;
        throw err;
      }
    }

    res.json(child);
  } catch (err) {
    next(err);
  }
}

async function createChild(req, res, next) {
  try {
    const { name, dob, parent_name, purok, gender } = req.body;
    let { barangay } = req.body;
    if (req.user.role === "BNS") {
      barangay = req.user.assigned_barangay;
    }
    if (!name || !dob || !parent_name || !barangay || !purok || !gender) {
      return res.status(400).json({
        error: "name, dob, parent_name, barangay, purok, and gender are required",
      });
    }
    if (!isValidBarangay(barangay)) {
      return res.status(400).json({ error: "barangay must be one of the municipality's registered barangays" });
    }
    if (req.body.parent_contact && !isValidPhContact(req.body.parent_contact)) {
      return res.status(400).json({
        error: "parent_contact must be an 11-digit mobile number starting with 09",
      });
    }
    const child = await childrenModel.create({ ...req.body, barangay });
    res.status(201).json(child);
  } catch (err) {
    next(err);
  }
}

async function updateChild(req, res, next) {
  try {
    const existing = await childrenModel.findById(req.params.id);
    assertBarangayAccess(req, existing);

    const fields = pickFields(req.body, CHILD_UPDATE_FIELDS);
    if (req.user.role === "BNS") {
      delete fields.barangay;
    }

    // pickFields only whitelists which fields CAN be touched — it doesn't
    // stop a touched required field from being patched to blank/empty, which
    // previously sailed through and produced things like an Invalid Date
    // from dob:"" further downstream.
    const merged = { ...existing, ...fields };
    const missing = REQUIRED_CHILD_FIELDS.filter((key) => !merged[key]);
    if (missing.length) {
      return res.status(400).json({ error: `${missing.join(", ")} cannot be blank` });
    }
    if (fields.barangay && !isValidBarangay(fields.barangay)) {
      return res.status(400).json({ error: "barangay must be one of the municipality's registered barangays" });
    }
    if (fields.parent_contact && !isValidPhContact(fields.parent_contact)) {
      return res.status(400).json({
        error: "parent_contact must be an 11-digit mobile number starting with 09",
      });
    }
    const child = await childrenModel.update(req.params.id, fields);
    res.json(child);
  } catch (err) {
    next(err);
  }
}

async function deleteChild(req, res, next) {
  try {
    const existing = await childrenModel.findById(req.params.id);
    assertBarangayAccess(req, existing);

    const child = await childrenModel.softDelete(req.params.id);
    // Cascade the delete: without this, the child's checkups/supplement
    // records stayed "active" and kept counting in every report and the
    // Barangay Map even though the child itself was gone.
    await Promise.all([
      assessmentModel.rejectAllForChild(req.params.id),
      supplementModel.rejectAllForChild(req.params.id),
    ]);
    res.json(child);
  } catch (err) {
    next(err);
  }
}

module.exports = { listChildren, getChild, createChild, updateChild, deleteChild };
