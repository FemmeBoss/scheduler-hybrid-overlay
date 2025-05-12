console.log("✅ [idb.js] Hybrid IndexedDB + Firebase Storage loaded");

import { storage } from './firebase-config.js';
import { ref, uploadString, getDownloadURL } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js';

const DB_NAME = 'fbWatermarkDB';
const WATERMARK_STORE = 'watermarks';
const PENDING_UPLOADS_STORE = 'pendingUploads';
const DB_VERSION = 2;

export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject("❌ Failed to open IndexedDB");

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(WATERMARK_STORE)) {
        db.createObjectStore(WATERMARK_STORE);
        console.log(`✅ Created object store: ${WATERMARK_STORE}`);
      }
      if (!db.objectStoreNames.contains(PENDING_UPLOADS_STORE)) {
        db.createObjectStore(PENDING_UPLOADS_STORE, { keyPath: 'id', autoIncrement: true });
        console.log(`✅ Created object store: ${PENDING_UPLOADS_STORE}`);
      }
    };

    request.onsuccess = () => resolve(request.result);
  });
}

// Save watermark locally and to Firebase Storage
export async function saveWatermark(pageId, dataUrl) {
  const db = await openDatabase();
  const tx = db.transaction(WATERMARK_STORE, 'readwrite');
  const store = tx.objectStore(WATERMARK_STORE);
  store.put(dataUrl, pageId);

  // 🔥 Save to Firebase Storage too
  const storageRef = ref(storage, `watermarks/${pageId}.jpg`);
  await uploadString(storageRef, dataUrl, 'data_url');
  console.log(`[DB+Cloud] Watermark saved for ${pageId}`);

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject("❌ Failed to save watermark");
  });
}

// Get watermark from IndexedDB first, fallback to Firebase Storage
export async function getWatermark(pageId) {
  const db = await openDatabase();
  const tx = db.transaction(WATERMARK_STORE, 'readonly');
  const store = tx.objectStore(WATERMARK_STORE);

  return new Promise((resolve, reject) => {
    const request = store.get(pageId);

    request.onsuccess = async () => {
      const result = request.result || null;
      if (result) {
        console.log(`[DB] Retrieved watermark for pageId: ${pageId}`);
        resolve(result);
      } else {
        console.warn(`[DB] No local watermark for ${pageId}, attempting cloud fallback...`);
        try {
          const cloudUrl = await getDownloadURL(ref(storage, `watermarks/${pageId}.jpg`));
          const fetched = await fetch(cloudUrl);
          const blob = await fetched.blob();
          const reader = new FileReader();
          reader.onloadend = async () => {
            const dataUrl = reader.result;
            // 🛡️ Restore into local IndexedDB
            await saveWatermark(pageId, dataUrl);
            console.log(`[CLOUD] Restored watermark into IndexedDB for ${pageId}`);
            resolve(dataUrl);
          };
          reader.readAsDataURL(blob);
        } catch (cloudErr) {
          console.error("🔥 No watermark found in cloud either:", cloudErr.message);
          resolve(null);
        }
      }
    };

    request.onerror = () => reject("❌ Failed to retrieve watermark");
  });
}

// Save pending upload
export async function savePendingUpload(uploadData) {
  const db = await openDatabase();
  const tx = db.transaction(PENDING_UPLOADS_STORE, 'readwrite');
  const store = tx.objectStore(PENDING_UPLOADS_STORE);
  await store.add(uploadData);
  console.log(`[DB] Pending upload saved: ${uploadData.caption}`);
}

// Get all pending uploads
export async function getAllPendingUploads() {
  const db = await openDatabase();
  const tx = db.transaction(PENDING_UPLOADS_STORE, 'readonly');
  const store = tx.objectStore(PENDING_UPLOADS_STORE);

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject("❌ Failed to fetch pending uploads");
  });
}

// Clear all pending uploads
export async function clearPendingUploads() {
  const db = await openDatabase();
  const tx = db.transaction(PENDING_UPLOADS_STORE, 'readwrite');
  await tx.objectStore(PENDING_UPLOADS_STORE).clear();
  console.log("✅ Pending uploads cleared");
}