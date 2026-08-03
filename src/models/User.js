/**
 * backend/models/User.js
 * Mongoose schema for StockPulse users (supporting both local JWT/bcrypt & Firebase/Google Auth).
 */

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    // UID — identifier (Firebase UID for Google users, or generated for local users)
    uid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      select: false, // Do not include in queries by default
    },

    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },

    displayName: {
      type: String,
      trim: true,
      default: "",
    },

    photoURL: {
      type: String,
      default: "",
    },

    // User-editable profile fields
    bio: {
      type: String,
      maxlength: 280,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    website: {
      type: String,
      trim: true,
      default: "",
    },

    // App-level role
    role: {
      type: String,
      enum: ["user", "pro", "admin"],
      default: "user",
    },

    // Watchlist synced to MongoDB
    watchlist: {
      type: [String],
      default: [],
    },

    lastLoginAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving if modified
userSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password helper
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);