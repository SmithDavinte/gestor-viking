// Firebase Compat SDK Configuration
// This file runs as a standard script and defines globals: 'db', 'auth', 'JOBS_COLLECTION'

const firebaseConfig = {
  apiKey: "AIzaSyDP2W5j3W5f5PyI3MsGxvRx-b8FbT8P_jw",
  authDomain: "gestor-viking.firebaseapp.com",
  projectId: "gestor-viking",
  storageBucket: "gestor-viking.firebasestorage.app",
  messagingSenderId: "739404542840",
  appId: "1:739404542840:web:f3cb02556ef847f49b4e8d",
  measurementId: "G-P3RGHHJ9LY"
};

// Initialize Firebase (Compat)
firebase.initializeApp(firebaseConfig);

// Export Globals
const db = firebase.firestore();
const auth = firebase.auth();
const JOBS_COLLECTION = "servicos";

console.log("Firebase Compat Initialized");
