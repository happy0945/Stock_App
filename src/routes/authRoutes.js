/**
 * backend/routes/authRoutes.js
 * Mounts all /api/auth endpoints.
 */

const express = require("express");
const router  = express.Router();

const { googleAuth, getMe, updateProfile } = require("../controllers/authController");
const { requireAuth } = require("../middleware/authMiddleware");

// Public — exchange Firebase ID token for app JWT
router.post("/google", googleAuth);

// Protected — require valid app JWT
router.get ("/me",      requireAuth, getMe);
router.put ("/profile", requireAuth, updateProfile);

module.exports = router;