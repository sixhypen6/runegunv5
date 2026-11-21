/* =========================================================
   RUNEGUN · Firebase config — co-op signaling only.
   The Realtime Database carries ONLY the WebRTC handshake for the
   join-code flow; once the peers connect, the room is deleted and
   all game traffic is phone-to-phone.

   SETUP (one time):
   1. console.firebase.google.com → project `runegunp`
   2. Build → Realtime Database → Rules → paste firebase.rules.json (repo root)
   3. Project settings → Your apps → Web app (</>) → the config below
      (these values are public identifiers, not secrets — shipping them
      in source is normal)

   DISTINCT LOCATION: this build signals under <ROOMS_ROOT> in signal.js
   (default `rooms_v1`), NOT the plain `rooms` tree. The newer build owns
   `rooms`; keeping this one on its own branch of the database means the two
   versions can share one Firebase project without their join codes ever
   colliding or one build reading the other's handshake. See firebase.rules.json,
   which mirrors the `rooms` validation block under `rooms_v1` for exactly this.
   ========================================================= */
"use strict";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAYNwA6RzUEbfyCWqbT3P27ti705QGfL2c",
  authDomain: "runegunp.firebaseapp.com",
  databaseURL: "https://runegunp-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "runegunp",
  storageBucket: "runegunp.firebasestorage.app",
  messagingSenderId: "867814511521",
  appId: "1:867814511521:web:fd00305baa3dce103ef1e0",
};
/* measurementId is deliberately omitted — no Analytics SDK is loaded, so it
   would be dead weight. storageBucket / messagingSenderId are unused too, but
   kept so this object still matches what the Firebase console shows you. */

/* true once a real config has been pasted in — the CO-OP button uses this
   to explain itself instead of failing on a dead endpoint */
function firebaseConfigured() {
  return FIREBASE_CONFIG.apiKey.indexOf("PASTE-") !== 0;
}