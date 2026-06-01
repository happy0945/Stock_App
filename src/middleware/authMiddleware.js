/**
 * backend/middleware/authMiddleware.js
 * Verifies the app-issued JWT on protected routes.
 */

const jwt   = require("jsonwebtoken");
const User  = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "change_me_in_production";

/**
 * requireAuth — attach req.user (MongoDB doc) or return 401.
 */
const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: { message: "No token provided." } });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user    = await User.findOne({ uid: payload.uid });
    if (!user) {
      return res.status(401).json({ error: { message: "User not found." } });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: { message: "Invalid or expired token." } });
  }
};

module.exports = { requireAuth };