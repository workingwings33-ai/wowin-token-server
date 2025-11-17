// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Use whichever token lib you installed:
const { RtcTokenBuilder, RtcRole } = require('agora-token');
// if you installed '@agoraio/agora-access-token', change import accordingly.

const APP_ID = process.env.AGORA_APP_ID || '';
const APP_CERT = process.env.AGORA_APP_CERT || '';
const PORT = process.env.PORT || 3000;

if (!APP_ID || !APP_CERT) {
  console.warn('AGORA_APP_ID or AGORA_APP_CERT missing. Tokens will fail until set.');
}

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.get('/', (req, res) => res.send('Agora token server is running'));

/**
 * POST /token
 * body: { channelName: string, uid?: number|string, ttl?: number }
 */
app.post('/token', (req, res) => {
  try {
    const { channelName, uid, ttl } = req.body;
    if (!channelName) return res.status(400).json({ error: 'channelName required' });

    const privilegeExpireSeconds = Number(ttl) || 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const expireTimestamp = currentTimestamp + privilegeExpireSeconds;

    const uidNum = (uid === undefined || uid === null) ? 0 : Number(uid) || 0;

    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERT,
      channelName,
      uidNum,
      RtcRole.PUBLISHER,
      expireTimestamp
    );

    return res.json({ token, expiresAt: expireTimestamp });
  } catch (err) {
    console.error('Error building token', err);
    return res.status(500).json({ error: 'token_generation_failed' });
  }
});
// CALL API — send FCM notification to callee
app.post('/call', async (req, res) => {
  const { callerName, callerArea, callerCity, callerPhone, calleeId, channelName } = req.body;

  if (!calleeId || !channelName) {
    return res.status(400).json({ error: "Missing calleeId or channelName" });
  }

  try {
    const admin = require("firebase-admin");

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
      });
    }

    // Fetch callee's FCM token
    const db = admin.firestore();
    const calleeDoc = await db.collection("users").doc(calleeId).get();

    const fcmToken = calleeDoc.get("fcmToken");
    if (!fcmToken) return res.status(400).json({ error: "callee FCM token missing" });

    // Build notification
    const message = {
      token: fcmToken,
      data: {
        type: "INCOMING_CALL",
        channelName,
        callerName,
        callerArea,
        callerCity,
        callerPhone,
      }
    };

    await admin.messaging().send(message);

    return res.json({ success: true });
  } catch (err) {
    console.error("CALL ERROR", err);
    return res.status(500).json({ error: "call_failed" });
  }
});


app.listen(PORT, () => {
  console.log(`Agora token server listening on port ${PORT}`);
});
