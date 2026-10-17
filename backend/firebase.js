const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

// Di server deploy, simpan JSON credentials dalam secret FIREBASE_SERVICE_ACCOUNT_JSON.
// Pada development, tempatkan firebase-service-account.json di folder backend (gitignored).
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
} else {
    const file = path.join(__dirname, "firebase-service-account.json");
    if (!fs.existsSync(file)) {
        throw new Error("Firebase credentials tidak ditemukan. Set FIREBASE_SERVICE_ACCOUNT_JSON atau file privat firebase-service-account.json.");
    }
    serviceAccount = JSON.parse(fs.readFileSync(file,"utf8"));
}
initializeApp({ credential: cert(serviceAccount) });
module.exports = getFirestore();
