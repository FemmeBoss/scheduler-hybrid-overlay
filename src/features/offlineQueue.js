// offlineQueue.js

const DB_NAME = 'offlineQueueDB';
const STORE_NAME = 'pendingWrites';
const DB_VERSION = 1;

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject("❌ Failed to open queue database");
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export async function savePendingWrite(collectionPath, data) {
  const db = await openQueueDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  await store.add({ collectionPath, data });
  console.log(`📦 Queued Firestore write for collection: ${collectionPath}`);
}

export async function processPendingWrites(dbInstance) {
  const db = await openQueueDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const all = await new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject("❌ Failed to fetch pending writes");
  });

  if (all.length === 0) return;

  console.log(`🔄 Retrying ${all.length} queued Firestore writes...`);

  const writePromises = all.map(async (item) => {
    const { collectionPath, data, id } = item;
    try {
      const { collection, addDoc } = await import('https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js');
      const colRef = collection(dbInstance, collectionPath);
      await addDoc(colRef, data);
      console.log(`✅ Successfully re-uploaded queued write (ID: ${id})`);
      await deletePendingWrite(id);
    } catch (error) {
      console.error(`❌ Failed retry for write ID ${id}:`, error.message);
    }
  });

  await Promise.all(writePromises);
}

async function deletePendingWrite(id) {
  const db = await openQueueDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  await store.delete(id);
}