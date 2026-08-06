const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const userModel = require("../models/user.model");
const { JWT_SECRET, JWT_EXPIRES_IN, COOKIE_NAME } = require("../config/jwt");

const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      assigned_barangay: user.assigned_barangay,
      token_version: user.token_version ?? 0,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  };
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: COOKIE_MAX_AGE_MS });
}

function clearSessionCookie(res) {
  // clearCookie must be called with the same attributes the cookie was set
  // with (minus maxAge/expires) or some browsers won't recognize it as the
  // same cookie and silently keep the old one.
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

async function listUsers(req, res, next) {
  try {
    const { status } = req.query;
    const users = await userModel.findAll({ status });
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

    const token = signToken(user);
    setSessionCookie(res, token);
    const { password: _password, token_version: _tokenVersion, ...safeUser } = user;
    res.json({ user: safeUser, token });
  } catch (err) {
    next(err);
  }
}

async function logoutUser(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        // Bumping token_version invalidates this token on the server side
        // right away — the deleted cookie below only removes it from this
        // browser, but a copied/stolen token would still verify until it
        // naturally expired without this.
        await userModel.bumpTokenVersion(decoded.id);
      } catch (err) {
        // Token already invalid/expired — nothing server-side left to revoke.
      }
    }
    clearSessionCookie(res);
    res.json({ message: "Logged out" });
  } catch (err) {
    next(err);
  }
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
  loginUser,
  logoutUser,
  getCurrentUser,
  updateUserStatus,
};
