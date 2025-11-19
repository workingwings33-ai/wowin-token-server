require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { RtcTokenBuilder, RtcRole } = require("agora-token");
const admin = require("firebase-admin");

// ENV vars
const APP_ID = process.env.AGORA_APP_ID || "";
const APP_CERT = process.env.AGORA_APP_CERT || "";
const PORT = process.env.PORT || 3000;

if (!APP_ID || !APP_CERT) {
  console.warn("⚠️ Missing AGORA_APP_ID or AGORA_APP_CERT");
}

// ------------------------------------------
// Firebase Admin Initialization
// ------------------------------------------
try {
  if (!admin.apps.length) {
    // If using JSON file path:
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;

    admin.initializeApp({
      credential: admin.credential.cert(require(serviceAccountPath))
    });

    console.log("✅ Firebase Admin initialized");
  }
} catch (e) {
  console.error("❌ Firebase Admin init failed:", e);
}

const db = admin.firestore();

// ------------------------------------------
const app = express();
app.use(cors());
app.use(bodyParser.json());

// ------------------------------------------
app.get("/", (req, res) => {
  res.send("🔥 Wowin Agora Token Server is running");
});

// ------------------------------------------
// TOKEN GENERATION
// ------------------------------------------
app.post("/token", (req, res) => {
  try {
    const { channelName, uid, ttl } = req.body;

    if (!channelName) {
      return res.status(400).json({ error: "channelName required" });
    }

    const expireTime = Math.floor(Date.now() / 1000) + (ttl || 3600);
    const numericUid = Number(uid) || 0;

    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERT,
      channelName,
      numericUid,
      RtcRole.PUBLISHER,
      expireTime
    );

    return res.json({ token, expiresAt: expireTime });
  } catch (err) {
    console.error("❌ TOKEN ERROR:", err);
    return res.status(500).json({ error: "token_generation_failed" });
  }
});

// ------------------------------------------
// SEND INCOMING CALL PUSH
// ------------------------------------------
app.post("/call", async (req, res) => {
  try {
    const {
      callerName,
      callerArea,
      callerCity,
      callerPhone,
      calleeId,
      channelName
    } = req.body;

    if (!calleeId || !channelName) {
      return res
        .status(400)
        .json({ error: "Missing calleeId or channelName" });
    }

    const doc = await db.collection("users").doc(calleeId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Callee not found" });
    }

    const fcmToken = doc.get("fcmToken");

    if (!fcmToken) {
      return res.status(400).json({ error: "Callee FCM token missing" });
    }

    const message = {
      token: fcmToken,
      data: {
        type: "INCOMING_CALL",
        callerName,
        callerArea,
        callerCity,
        callerPhone,
        channelName
      },
      android: {
        priority: "high"
      }
    };

    await admin.messaging().send(message);

    console.log("📞 Incoming call push sent to:", fcmToken);

    return res.json({ success: true });
  } catch (err) {
    console.error("❌ CALL ERROR:", err);
    return res.status(500).json({ error: "call_failed" });
  }
});

// ------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Wowin Token Server running on port ${PORT}`);
});
