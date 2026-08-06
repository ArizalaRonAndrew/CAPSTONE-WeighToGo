const childrenModel = require("../models/children.model");
const assessmentModel = require("../models/assessment.model");
const { assertBarangayAccess } = require("../utils/access");
const { isValidPhContact } = require("../utils/phone");
const { pickFields } = require("../utils/pickFields");

const CHILD_UPDATE_FIELDS = ["name", "dob", "parent_name", "parent_contact", "barangay", "purok", "gender", "is_ip"];

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
    res.json(child);
  } catch (err) {
    next(err);
  }
}

module.exports = { listChildren, getChild, createChild, updateChild, deleteChild };
