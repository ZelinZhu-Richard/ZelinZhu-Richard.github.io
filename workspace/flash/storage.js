const databaseName = 'richard-flash-station';
let connection;
function database() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('designs');
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); connection = null; };
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Storage is busy in another tab.'));
  }).catch(error => { connection = null; throw error; });
  return connection;
}
export async function loadDesign() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('designs', 'readonly');
    const request = transaction.objectStore('designs').get('current');
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}
export async function saveDesign(card) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('designs', 'readwrite');
    transaction.objectStore('designs').put({ format: 'flash-card', version: 1, card }, 'current');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Save interrupted.'));
  });
}
