/**
 * backend/models/User.js
 * Mongoose schema for StockPulse users authenticated via Firebase / Google.
 */

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // Firebase UID — primary identifier
    uid: {
      type:     String,
      required: true,
      unique:   true,
      index:    true,
    },

    // Google profile fields (populated on first sign-in)
    email: {
      type:     String,
      required: true,
      lowercase: true,
      trim:     true,
    },
    displayName: {
      type:    String,
      trim:    true,
      default: "",
    },
    photoURL: {
      type:    String,
      default: "",
    },

    // User-editable profile fields
    bio: {
      type:      String,
      maxlength: 280,
      default:   "",
    },
    phone: {
      type:    String,
      trim:    true,
      default: "",
    },
    location: {
      type:    String,
      trim:    true,
      default: "",
    },
    website: {
      type:    String,
      trim:    true,
      default: "",
    },

    // App-level role
    role: {
      type:    String,
      enum:    ["user", "pro", "admin"],
      default: "user",
    },

    // Watchlist synced to MongoDB (optional — Redux also holds it locally)
    watchlist: {
      type:    [String],
      default: [],
    },

    lastLoginAt: {
      type:    Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // adds createdAt + updatedAt
  }
);

module.exports = mongoose.model("User", userSchema);