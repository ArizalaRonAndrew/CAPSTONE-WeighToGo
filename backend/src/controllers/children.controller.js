const childrenModel = require("../models/children.model");
const { assertBarangayAccess } = require("../utils/access");

async function listChildren(req, res, next) {
  try {
    const { status } = req.query;
    let { barangay } = req.query;
    if (req.user.role === "BNS") {
      barangay = req.user.assigned_barangay;
    }
    const children = await childrenModel.findAll({ barangay, status });
    res.json(children);
  } catch (err) {
    next(err);
  }
}

async function getChild(req, res, next) {
  try {
    const child = await childrenModel.findById(req.params.id);
    assertBarangayAccess(req, child);
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

    const fields = { ...req.body };
    if (req.user.role === "BNS") {
      delete fields.barangay;
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
