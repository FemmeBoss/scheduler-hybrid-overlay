import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js";

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyCUDcSDIlBN62KJHYNaB4Lr_cW404gF1gY",
  authDomain: "femme-boss-scheduler.firebaseapp.com",
  projectId: "femme-boss-scheduler",
  storageBucket: "femme-boss-scheduler.firebasestorage.app",
  messagingSenderId: "889666526161",
  appId: "1:889666526161:web:12f4e1276ea1322816def0",
  measurementId: "G-Y9M6QQN11M"
};

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);

// --- Exports ---
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// --- Upload Helper ---
export async function uploadImageToFirebase(file, filename) {
  const storageRef = ref(storage, `uploads/${filename}`);
  const snapshot = await uploadBytes(storageRef, file);
  return await getDownloadURL(snapshot.ref);
}