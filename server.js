// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

// Agora Token Builder
const { RtcTokenBuilder, RtcRole } = require("agora-token");

// Firebase Admin SDK
const admin = require("firebase-admin");

// ENV Vars
const APP_ID = process.env.AGORA_APP_ID || "";
const APP_CERT = process.env.AGORA_APP_CERT || "";
const PORT = process.env.PORT || 3000;

if (!APP_ID || !APP_CERT) {
  console.warn("⚠️ AGORA_APP_ID or AGORA_APP_CERT not found!");
}

// Firebase Admin init
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(
        JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      ),
    });
    console.log("✅ Firebase Admin initialized");
  }
} catch (e) {
  console.error("❌ Firebase Admin init failed", e);
}

const db = admin.firestore();

// Express setup
const app = express();
app.use(cors());
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("🔥 Wowin Agora Token Server is running");
});

/**
 * POST /token
 * Generate Agora RTC token
 */
app.post("/token", (req, res) => {
  console.log("📩 /token request:", req.body);

  try {
    const { channelName, uid, ttl } = req.body;

    if (!channelName) {
      return res.status(400).json({ error: "channelName required" });
    }

    const expireSeconds = Number(ttl) || 3600;
    const now = Math.floor(Date.now() / 1000);
    const expire = now + expireSeconds;

    const uidNum =
      uid === undefined || uid === null ? 0 : Number(uid) || 0;

    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERT,
      channelName,
      uidNum,
      RtcRole.PUBLISHER,
      expire
    );

    console.log("🎉 Token generated for:", channelName);

    return res.json({ token, expiresAt: expire });
  } catch (err) {
    console.error("❌ TOKEN ERROR:", err);
    return res.status(500).json({ error: "token_generation_failed" });
  }
});

/**
 * POST /call
 * Sends FCM push to callee for incoming call
 */
app.post("/call", async (req, res) => {
  console.log("📩 /call request:", req.body);

  const {
    callerName,
    callerArea,
    callerCity,
    callerPhone,
    calleeId,
    channelName,
  } = req.body;

  if (!calleeId || !channelName) {
    return res
      .status(400)
      .json({ error: "Missing calleeId or channelName" });
  }

  try {
    // Get callee Firestore document
    const doc = await db.collection("users").doc(calleeId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Callee not found" });
    }

    const fcmToken = doc.get("fcmToken");

    if (!fcmToken) {
      console.log("❌ Callee FCM token missing");
      return res.status(400).json({ error: "callee FCM token missing" });
    }

    console.log("📨 Sending FCM to:", fcmToken);

    const message = {
      token: fcmToken,
      data: {
        type: "INCOMING_CALL",
        channelName,
        callerName,
        callerArea,
        callerCity,
        callerPhone,
      },
      android: {
        priority: "high",
      },
    };

    await admin.messaging().send(message);

    console.log("📞 Incoming call push sent successfully");

    return res.json({ success: true });
  } catch (err) {
    console.error("❌ CALL ERROR:", err);
    return res.status(500).json({ error: "call_failed" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Wowin Token Server running on port ${PORT}`);
});
