/**
 * backend/controllers/authController.js
 * Handles manual (Email/Password with JWT & bcrypt) registration & login,
 * Google OAuth token verification, profile fetch, and profile update.
 */

const jwt = require("jsonwebtoken");
const admin = require("../config/firebase");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "stockpulse_jwt_secret_key_2026_super_secure";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "7d";

/** Sign a JWT containing the user's UID */
const signToken = (uid) =>
  jwt.sign({ uid }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

// ── POST /api/auth/register ───────────────────────────────────────────────────
/** Manual email + password registration with bcrypt */
const registerLocal = async (req, res) => {
  try {
    const { email, password, displayName } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        error: { message: "Email and password are required." },
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: { message: "Password must be at least 6 characters long." },
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: cleanEmail });

    if (existing) {
      return res.status(400).json({
        error: { message: "An account with this email already exists." },
      });
    }

    // Generate unique local UID
    const uid = `local_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const user = new User({
      uid,
      email: cleanEmail,
      password,
      displayName: displayName ? displayName.trim() : cleanEmail.split("@")[0],
      authProvider: "local",
      lastLoginAt: new Date(),
    });

    await user.save();

    const token = signToken(user.uid);

    return res.status(201).json({
      success: true,
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("[registerLocal]", err.message);
    return res.status(500).json({
      error: { message: "Registration failed. " + err.message },
    });
  }
};

// ── POST /api/auth/login ──────────────────────────────────────────────────────
/** Manual email + password login using bcrypt */
const loginLocal = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        error: { message: "Email and password are required." },
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail }).select("+password");

    if (!user) {
      return res.status(401).json({
        error: { message: "Invalid email or password." },
      });
    }

    // Compare bcrypt password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        error: { message: "Invalid email or password." },
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(user.uid);

    return res.status(200).json({
      success: true,
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("[loginLocal]", err.message);
    return res.status(500).json({
      error: { message: "Login failed. " + err.message },
    });
  }
};

// ── POST /api/auth/google ─────────────────────────────────────────────────────
/** Accepts a Firebase ID token, verifies server-side, upserts user */
const googleAuth = async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken) {
    return res.status(400).json({ error: { message: "idToken is required." } });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture } = decoded;

    const user = await User.findOneAndUpdate(
      { email: email ? email.toLowerCase() : `${uid}@google.com` },
      {
        $set: {
          uid,
          email: email ? email.toLowerCase() : `${uid}@google.com`,
          displayName: name || "",
          photoURL: picture || "",
          authProvider: "google",
          lastLoginAt: new Date(),
        },
        $setOnInsert: { uid },
      },
      { upsert: true, new: true, runValidators: true }
    );

    const token = signToken(user.uid);

    return res.status(200).json({
      token,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error("[googleAuth]", err.message);
    return res.status(401).json({
      error: { message: "Firebase token verification failed." },
    });
  }
};

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
const getMe = async (req, res) => {
  return res.status(200).json({ user: sanitizeUser(req.user) });
};

// ── PUT /api/auth/profile ─────────────────────────────────────────────────────
const updateProfile = async (req, res) => {
  const ALLOWED_FIELDS = ["displayName", "bio", "phone", "location", "website"];

  const updates = {};
  for (const field of ALLOWED_FIELDS) {
    if (req.body[field] !== undefined) {
      updates[field] = String(req.body[field]).trim();
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: { message: "No valid fields to update." } });
  }

  try {
    const user = await User.findOneAndUpdate(
      { uid: req.user.uid },
      { $set: updates },
      { new: true, runValidators: true }
    );
    return res.status(200).json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error("[updateProfile]", err.message);
    return res.status(500).json({ error: { message: "Failed to update profile." } });
  }
};

// ── Helper ────────────────────────────────────────────────────────────────────
const sanitizeUser = (user) => ({
  uid: user.uid,
  email: user.email,
  displayName: user.displayName,
  photoURL: user.photoURL,
  authProvider: user.authProvider,
  bio: user.bio,
  phone: user.phone,
  location: user.location,
  website: user.website,
  role: user.role,
  watchlist: user.watchlist,
  createdAt: user.createdAt,
  lastLoginAt: user.lastLoginAt,
});

module.exports = {
  registerLocal,
  loginLocal,
  googleAuth,
  getMe,
  updateProfile,
};