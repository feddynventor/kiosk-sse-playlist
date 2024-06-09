
interface Idb {
  cache: (obj: Record) => Promise<void>
  load: (id: string) => Promise<Blob | null>
}

export interface Record {
  id: string
  url: string
  name: string
  blob?: Blob
}

declare global {
  interface Window {
    mozIndexedDB:any;
    webkitIndexedDB:any;
  }
}
var idb = window.indexedDB ||      // Use the standard DB API
          window.mozIndexedDB ||   // Or Firefox's early version of it
          window.webkitIndexedDB;  // Or Chrome's early version


export class Playlist implements Idb {
  dbOSName: string;
  dbInstance: IDBDatabase | null;

  constructor(name: string, callback?: Function) {
    this.dbOSName = name;
    this.dbInstance = null;

    const request: IDBOpenDBRequest = idb.open(name);
    request.addEventListener('error', ()=>{console.error("FATAL",request)});

    request.onsuccess = () => {
      console.log('Database opened successfully');
      this.dbInstance = request.result;
      console.log(request.result)

      if (callback) callback()
    };

    request.onupgradeneeded = (e: Event) => {
      if (!e.target) return;
      console.log("Upgrade needed")
      const db: IDBDatabase = (e.target as IDBRequest).result
      const objectStore: IDBObjectStore = db.createObjectStore(name, { keyPath: 'id' });
      
      // new obj must contain url and id
      objectStore.createIndex("id_idx", "id", { unique: true });
      objectStore.createIndex("url_idx", "url", { unique: false });

      console.log('Database setup complete');
    };
  }

  async cache(obj: Record): Promise<void> {
    return fetch(obj.url)
    .then(response => response.status==200 ? response.blob() : Promise.reject("Not found"))
    .then(blob => {
      if (!this.dbInstance) return Promise.reject('Database not initialized');
      const objectStore = this.dbInstance.transaction(this.dbOSName, 'readwrite').objectStore(this.dbOSName);
      // Add the record to IDB
      const request = objectStore.add({
        ...obj,
        blob
      });

      request.onsuccess = () => { return Promise.resolve() }
      request.onerror = (e) => {
        if ((e.target as IDBRequest).error?.code == 0) {
          console.log('Already cached', obj.id)
          return Promise.resolve()
        } else {
          console.error('Error', e)
          return Promise.reject()
        }
      }
    })
  }

  async load(id: string): Promise<Blob | null> {
    if (!this.dbInstance) return Promise.reject()
    const objectStore = this.dbInstance.transaction(this.dbOSName).objectStore(this.dbOSName);
    const request = objectStore.get(id);

    return new Promise((resolve, reject) => {
          request.onsuccess = () => {
            if (request.result) {
              console.log('Match found', request.result.id);
              resolve(request.result.blob);
            } else {
              resolve(null);
            }
          };
          request.onerror = () => {
            console.error(request.error);
            reject(request.error);
          }
    });
  }
}
