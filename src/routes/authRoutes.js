/**
 * backend/routes/authRoutes.js
 * Mounts all /api/auth endpoints.
 */

const express = require("express");
const router = express.Router();

const {
  registerLocal,
  loginLocal,
  googleAuth,
  getMe,
  updateProfile,
} = require("../controllers/authController");
const { requireAuth } = require("../middleware/authMiddleware");

// Public authentication routes
router.post("/register", registerLocal);
router.post("/login", loginLocal);
router.post("/google", googleAuth);

// Protected user routes
router.get("/me", requireAuth, getMe);
router.put("/profile", requireAuth, updateProfile);

module.exports = router;