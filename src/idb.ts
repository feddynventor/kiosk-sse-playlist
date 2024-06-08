
interface Idb {
  cache: (obj: Record) => Promise<void>
  load: (id: string) => Promise<Blob>
}

export interface Record {
  id: string
  url: string
  name: string
  blob?: Blob
}


export class Playlist implements Idb {
  dbName: string;
  dbInstance: IDBDatabase | null;

  constructor(name: string, fields: string[], callback?: Function) {
    this.dbName = name;
    this.dbInstance = null;
    console.log(arguments)

    const request = window.indexedDB.open(name, 1);
    request.addEventListener('error', (e)=>{console.error("FATAL",e)});

    request.addEventListener('success', (() => {
      console.log('Database opened successfully');
      this.dbInstance = request.result;
      console.log(request.result)

      if (callback) callback()
    }).bind(this));

    request.addEventListener('upgradeneeded', (e: Event) => {
      if (!e.target) return;
      console.log("Upgrade needed")
      const db = (e.target as IDBRequest).result
      const objectStore: IDBObjectStore = db.createObjectStore(name, { keyPath: 'id' });
      
      // new obj must contain url and id
      objectStore.createIndex("id_idx", "id", { unique: true });
      objectStore.createIndex("url_idx", "url", { unique: false });

      console.log("Creating indexes", fields)
      fields.forEach( field => {
        objectStore.createIndex(field+"_idx", field, { unique: false });
      });

      console.log('Database setup complete');
    });
  }

  async cache(obj: Record): Promise<void> {
    return fetch(obj.url)
    .then(response => response.status==200 ? response.blob() : Promise.reject("Not found"))
    .then(blob => {
      if (!this.dbInstance) return Promise.reject('Database not initialized');
      const objectStore = this.dbInstance.transaction(this.dbName, 'readwrite').objectStore(this.dbName);
      // Add the record to IDB
      const request = objectStore.add({
        ...obj,
        blob
      });

      request.addEventListener('success', () => console.log('Record addition attempt finished for', obj.id));
      request.addEventListener('error', Promise.reject);
    })
  }

  async load(id: string): Promise<Blob> {
    if (!this.dbInstance) return Promise.reject()
    const objectStore = this.dbInstance.transaction(this.dbName).objectStore(this.dbName);
    const request = objectStore.get(id);

    return new Promise((resolve, reject) => {
          request.addEventListener('success', () => {
            if (request.result) {
              console.log('Match found', request.result.id);
              resolve(request.result.blob);
            } else {
              reject('No match found');
            }
          });
    });
  }
}
