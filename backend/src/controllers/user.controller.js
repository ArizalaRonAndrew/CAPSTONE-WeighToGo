const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const userModel = require("../models/user.model");
const { JWT_SECRET, JWT_EXPIRES_IN, COOKIE_NAME } = require("../config/jwt");

const SALT_ROUNDS = 10;
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, assigned_barangay: user.assigned_barangay },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

async function listUsers(req, res, next) {
  try {
    const users = await userModel.findAll();
    res.json(users);
  } catch (err) {
    next(err);
  }
}

async function getUser(req, res, next) {
  try {
    const user = await userModel.findById(req.params.id);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function registerUser(req, res, next) {
  try {
    const { email, password, role, assigned_barangay } = req.body;
    if (!email || !password || !role) {
      return res.status(400).json({ error: "email, password, and role are required" });
    }

    const existing = await userModel.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await userModel.create({ email, passwordHash, role, assigned_barangay });
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
}

async function loginUser(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = await userModel.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (user.status !== "active") {
      return res.status(403).json({ error: "This account is not active" });
    }

    const { password: _password, ...safeUser } = user;
    const token = signToken(safeUser);
    setSessionCookie(res, token);
    res.json({ user: safeUser, token });
  } catch (err) {
    next(err);
  }
}

function logoutUser(req, res) {
  res.clearCookie(COOKIE_NAME);
  res.json({ message: "Logged out" });
}

async function getCurrentUser(req, res, next) {
  try {
    const user = await userModel.findById(req.user.id);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

async function updateUserStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!["active", "reject"].includes(status)) {
      return res.status(400).json({ error: "status must be 'active' or 'reject'" });
    }
    const user = await userModel.updateStatus(req.params.id, status);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listUsers,
  getUser,
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  updateUserStatus,
};
