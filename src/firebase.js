// src/firebase.js
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Gebruik je bestaande config of zet hier je nieuwe:
const firebaseConfig = {
    apiKey: "XXX",
    authDomain: "XXX",
    databaseURL: "XXX",
    projectId: "XXX",
    storageBucket: "XXX",
    messagingSenderId: "XXX",
    appId: "XXX"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
