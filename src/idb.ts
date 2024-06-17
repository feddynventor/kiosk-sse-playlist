
interface Idb {
  sequence: number
  cache: (obj: Record & {sequence?:number}) => Promise<void>
  get: (id: string) => Promise<Record | null>
  loadNext: (sequence?: number) => Promise<Record | null>
  getCurrent: () => Promise<Record | null>
  list: () => Promise<Record[]>
  update: (obj: Record) => Promise<void>
  updateSequence: (id: string, sequence: number) => Promise<Record | null>
}

export interface Record {
  id: string
  url: string
  title: string
  subtitle: string
  heading: string
  date: Date
  blob: Blob
  status: boolean
  sequence: number
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
  sequence: number;

  constructor(name: string, callback?: Function) {
    this.dbOSName = name;
    this.dbInstance = null;
    this.sequence = 0;

    const request: IDBOpenDBRequest = idb.open(name);
    request.addEventListener('error', ()=>{console.error("FATAL",request)});

    request.onsuccess = () => {
      console.log('Database opened successfully', request.result);
      this.dbInstance = request.result;

      if (callback) callback()
    };

    request.onupgradeneeded = (e: Event) => {
      if (!e.target) return;
      console.log("Upgrade needed")
      const db: IDBDatabase = (e.target as IDBRequest).result
      const objectStore: IDBObjectStore = db.createObjectStore(name, { keyPath: 'id' });
      
      // new obj must contain these fields
      objectStore.createIndex("id_idx", "id", { unique: true });
      objectStore.createIndex("sequence_idx", "sequence", { unique: false });
      //TODO: on update sequence number, uniqueness would be broken, no indexing

      console.log('Database setup complete');
    };
  }

  async cache( obj: Record & {sequence?:number} ): Promise<void> {
    if (!obj.url) return  // nothing to cache
    return fetch(obj.url, {mode: "cors"})
    .then(response => response.status==200 ? response.blob() : Promise.reject("Not found"))
    .then( async blob => {
      if (!this.dbInstance) return Promise.reject('Database not initialized');
      const objectStore = this.dbInstance.transaction(this.dbOSName, 'readwrite').objectStore(this.dbOSName);
      // Add the record to IDB
      const request = objectStore.put({
        ...obj,
        status: obj.sequence ? obj.status || false : false,  //if seq or status is missing, disable element by def
        sequence: obj.sequence, // if undefined, it wont be showed upon `sequence` update
        blob
      });

      request.onsuccess = (e) => {
        console.log(`New Cached ID:${obj.id} SEQ:${obj.sequence}`)
        return Promise.resolve()
      }
      request.onerror = (e) => {
        if ((e.target as IDBRequest).error?.code == 0) {
          console.log(`Already Cached ID:${obj.id} SEQ:${obj.sequence}`)
          return Promise.resolve()
        } else {
          console.error('Error', e)
          return Promise.reject()
        }
      }
    })
  }

  async update(obj: Record): Promise<void> {
    if (!this.dbInstance) return Promise.reject('Database not initialized');
    const objectStore = this.dbInstance.transaction(this.dbOSName, 'readwrite').objectStore(this.dbOSName);
    // Add the record to IDB
    const request = objectStore.put(obj);

    request.onsuccess = (e) => {
      console.log(`Updated ID:${obj.id} SEQ:${obj.sequence}`)
      return Promise.resolve()
    }
    request.onerror = (e) => {
      if ((e.target as IDBRequest).error?.code == 0) {
        console.log(`Already Cached ID:${obj.id} SEQ:${obj.sequence}`)
        return Promise.resolve()
      } else {
        console.error('Error', e)
        return Promise.reject()
      }
    }
  }

  async get(id: string): Promise<Record | null> {
    if (!this.dbInstance) return Promise.resolve(null)
    const objectStore = this.dbInstance.transaction(this.dbOSName).objectStore(this.dbOSName);
    const request = objectStore.get(id);

    return new Promise((resolve, reject) => {
          request.onsuccess = () => {
            if (request.result) {
              console.log(`Match found ID:${request.result.id} SEQ:${request.result.sequence}`)
              resolve(request.result as Record);
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

  async loadNext(sequence?: number): Promise<Record | null> {
    if (!this.dbInstance) return Promise.reject()
    // Get by sequence number
    return this.list()
    .then( playlist => {
      if (playlist.length == 0) return null
      if (playlist.filter( v => v.sequence!==undefined ).at(-1)?.sequence == this.sequence) this.sequence=0
      console.log("Loading next after current sequence number", this.sequence)
      const el = playlist.filter(v => v.sequence > (sequence ? sequence : this.sequence))[0]
      if (!!!sequence && el !== null) this.sequence=el.sequence
      return el
    })
  }

  async getCurrent(): Promise<Record | null> {
    // Get by sequence number
    return this.list()
    .then( playlist => {
      console.log("Currently at index", this.sequence)
      return playlist.filter(v => v.sequence == this.sequence)[0]
    })
    .catch( ()=>Promise.resolve(null) )
  }

  async list(): Promise<Record[]> {
    if (!this.dbInstance) return Promise.reject()
    const objectStore = this.dbInstance.transaction(this.dbOSName).objectStore(this.dbOSName);
    const request = objectStore.getAll();

    return new Promise((resolve, reject) => {
          request.onsuccess = () => {
            const array = request.result as Record[]
            array.sort((a, b) => a.sequence - b.sequence );
            resolve(array);
          };
          request.onerror = () => {
            console.error(request.error);
            reject(request.error);
          }
    });
  }

  async updateSequence(id: string, sequence: number): Promise<Record | null> {
    if (!this.dbInstance) return Promise.reject('Database not initialized');
    const objectStore = this.dbInstance.transaction(this.dbOSName, 'readwrite').objectStore(this.dbOSName);
    // Update sequence number for selected record
    const request = objectStore.openCursor( IDBKeyRange.only(id) )

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        if (!request.result) return resolve(null)

        const cursor = request.result as IDBCursor
        const obj = request.result?.value as Record
        const updateRequest = cursor.update({
          ...obj,
          status: true,
          sequence
        })
        cursor.continue()
        updateRequest.onsuccess = () => {
          return resolve(obj)
        }
      }
      request.onerror = (e)=>{console.log(e)}

    })

  }
}
