// ===== FIREBASE CONFIG — FUTEBOL TV =====
const firebaseConfig = {
    apiKey: "AIzaSyAjZwn53tctIJyzd3jsDcLoQQ4l4ptNZHw",
    authDomain: "futebol-tv-app.firebaseapp.com",
    projectId: "futebol-tv-app",
    storageBucket: "futebol-tv-app.firebasestorage.app",
    messagingSenderId: "423105965265",
    appId: "1:423105965265:web:eee525254dad21d2a9e9f0",
    measurementId: "G-07J2Y6ZVTS"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
