
interface Idb {
  sequence: number
  cache: (obj: Record & {sequence?:number}) => Promise<void>
  load: (id: string) => Promise<Record | null>
  loadNext: (sequence?: number) => Promise<Record | null>
  getCurrent: () => Promise<Record | null>
  list: () => Promise<Record[]>
  updateStatus: (id: string, status: boolean) => Promise<Record | null>
}

export interface Record {
  id: string
  url: string
  title: string
  subtitle: string
  blob?: Blob
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
    this.sequence = -1;

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
      objectStore.createIndex("sequence_idx", "sequence", { unique: true });

      console.log('Database setup complete');
    };
  }

  async cache( obj: Record & {sequence?:number} ): Promise<void> {
    return fetch(obj.url)
    .then(response => response.status==200 ? response.blob() : Promise.reject("Not found"))
    .then( async blob => {
      if (!this.dbInstance) return Promise.reject('Database not initialized');
      const totalItems = await this.totalItems()
      const objectStore = this.dbInstance.transaction(this.dbOSName, 'readwrite').objectStore(this.dbOSName);
      // Add the record to IDB
      const request = objectStore.add({
        ...obj,
        status: obj.status || false,
        sequence: obj.sequence || totalItems+1,
        blob
      });

      request.onsuccess = Promise.resolve
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

  async load(id: string): Promise<Record | null> {
    if (!this.dbInstance) return Promise.reject()
    const objectStore = this.dbInstance.transaction(this.dbOSName).objectStore(this.dbOSName);
    const request = objectStore.get(id);

    return new Promise((resolve, reject) => {
          request.onsuccess = () => {
            if (request.result) {
              console.log('Match found', request.result.id);
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
    this.sequence = sequence || ( (await this.totalItems() == this.sequence) ? 0 : this.sequence+1 )  //STUDY must be before transaction
    console.log("IDB seeking", this.sequence)
    
    const objectStore = this.dbInstance.transaction(this.dbOSName).objectStore(this.dbOSName);
    const request = objectStore.openCursor( IDBKeyRange.only(this.sequence) )

    return new Promise((resolve, reject) => {
          request.onsuccess = () => {
            if (request.result) {
              console.log('Next vid found', request.result.value.id);
              resolve(request.result.value as Record);
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

  async getCurrent(): Promise<Record | null> {
    if (!this.dbInstance) return Promise.reject()
    const objectStore = this.dbInstance.transaction(this.dbOSName).objectStore(this.dbOSName);
    // Get by sequence number
    console.log("IDB giving current", this.sequence)
    const request = objectStore.openCursor( IDBKeyRange.only(this.sequence==-1 ? 0 : this.sequence) )  //-1 or 0 is equal state

    return new Promise((resolve, reject) => {
          request.onsuccess = () => {
            if (request.result) {
              console.log('Current vid found', request.result.value.id);
              resolve(request.result.value as Record);
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

  async updateStatus(id: string, status: boolean): Promise<Record | null> {
    if (!this.dbInstance) return Promise.reject('Database not initialized');
    const objectStore = this.dbInstance.transaction(this.dbOSName, 'readwrite').objectStore(this.dbOSName);
    // Update status for selected record
    const request = objectStore.openCursor( IDBKeyRange.only(id) )

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        if (!request.result) return resolve(null)

        const cursor = request.result
        const obj = request.result?.value as Record
        const updateRequest = cursor.update({
          ...obj,
          status
        })
        updateRequest.onsuccess = () => {
          return resolve(obj)
        }
      }
      request.onerror = reject

    })

  }

  async totalItems(): Promise<number> {
    if (!this.dbInstance) return Promise.reject('Database not initialized');
    const objectStore = this.dbInstance.transaction(this.dbOSName, 'readwrite').objectStore(this.dbOSName);
    // API count records
    const countRequest = objectStore.count();
    
    return new Promise((resolve, reject) => {
      countRequest.onsuccess = () => {
        resolve(countRequest.result)
      }
      countRequest.onerror = reject
    })
  }
}
