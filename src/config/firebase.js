/**
 * backend/config/firebase.js
 * Initialises the Firebase Admin SDK (server-side).
 * Used to verify Firebase ID tokens sent from the frontend.
 */

// const admin = require("firebase-admin");

// // Option A — service-account JSON file path (recommended for production):
// //   Set GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
// //   and leave FIREBASE_SERVICE_ACCOUNT_JSON unset.
// //
// // Option B — inline JSON via env var (useful for Docker / Heroku / Railway):
// //   Set FIREBASE_SERVICE_ACCOUNT_JSON to the full JSON string of the
// //   service-account key.

// let credential;

// if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
//   const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
//   credential = admin.credential.cert(serviceAccount);
// } else {
//   // Falls back to GOOGLE_APPLICATION_CREDENTIALS env variable
//   credential = admin.credential.applicationDefault();
// }

// if (!admin.apps.length) {
//   admin.initializeApp({ credential });
// }

// module.exports = admin;










const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;