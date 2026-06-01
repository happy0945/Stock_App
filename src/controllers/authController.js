/**
 * backend/controllers/authController.js
 * Handles Google OAuth token exchange, profile fetch, and profile update.
 */

const jwt   = require("jsonwebtoken");
const admin = require("../config/firebase");
const User  = require("../models/User");

const JWT_SECRET  = process.env.JWT_SECRET  || "change_me_in_production";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "7d";

/** Sign a short-lived app JWT containing the Firebase UID */
const signToken = (uid) =>
  jwt.sign({ uid }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

// ── POST /api/auth/google ─────────────────────────────────────────────────────
/**
 * Accepts a Firebase ID token, verifies it server-side, then upserts the
 * user document in MongoDB and returns an app-level JWT.
 */
const googleAuth = async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ error: { message: "idToken is required." } });
  }

  try {
    // 1. Verify the Firebase ID token
    const decoded = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture } = decoded;

    // 2. Upsert the user in MongoDB
    const user = await User.findOneAndUpdate(
      { uid },
      {
        $set: {
          email:       email  || "",
          displayName: name   || "",
          photoURL:    picture|| "",
          lastLoginAt: new Date(),
        },
        $setOnInsert: { uid }, // ensures uid is set on new docs
      },
      { upsert: true, new: true, runValidators: true }
    );

    console.log(req.body)
    // 3. Issue app JWT
    const token = signToken(uid);

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
/** Returns the currently authenticated user's MongoDB profile. */
const getMe = async (req, res) => {
  return res.status(200).json({ user: sanitizeUser(req.user) });
};

// ── PUT /api/auth/profile ─────────────────────────────────────────────────────
/** Updates editable profile fields for the authenticated user. */
const updateProfile = async (req, res) => {
  const ALLOWED_FIELDS = ["displayName", "bio", "phone", "location", "website"];

  // Pick only the allowed fields from the request body
  const updates = {};
  for (const field of ALLOWED_FIELDS) {
    console.log(req.body)
    console.log(updates)
    if (req.body[field] !== undefined) {
      console.log(req.body)
      console.log(updates)

      updates[field] = String(req.body[field]).trim();
    }
  }
  console.log(req.body)
  console.log(updates)

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
/** Strip sensitive / internal fields before sending to the client */
const sanitizeUser = (user) => ({
  uid:         user.uid,
  email:       user.email,
  displayName: user.displayName,
  photoURL:    user.photoURL,
  bio:         user.bio,
  phone:       user.phone,
  location:    user.location,
  website:     user.website,
  role:        user.role,
  watchlist:   user.watchlist,
  createdAt:   user.createdAt,
  lastLoginAt: user.lastLoginAt,
});

module.exports = { googleAuth, getMe, updateProfile };