export interface Idb {
  cache: (obj: Record) => Promise<void>
  delete: (id: string) => Promise<void>
  get: (id: string) => Promise<Record | null>
  getCurrent: (timeout?: number) => Promise<Record & {sequence: number} | null>
  list: () => Promise<Record[]>
  loadNext: (sequence?: number) => Promise<Record | null>
  getNext: (sequence?: number) => Promise<Record | null>
  update: (obj: Record | FetchedRecord) => Promise<Record | FetchedRecord>
  checkBlob: (record: FetchedRecord | null) => Promise<FetchedRecord>
  updateSequence: (sortedList: Record[]) => Promise<void>
}

export interface Record {
  id: string
  url: string
  title: string
  subtitle: string
  date: Date
  updated: Date
  expiry: Date
  status: boolean
  sequence?: number
  duration?: number
  contentType: "video"|"image"|"global"
}

export interface FetchedRecord extends Record {
  blobURL: string,
  blob: Blob
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
  contentType: string;
  dbInstance: IDBDatabase | null;
  current: Record | null;
  logging: boolean;

  constructor(name: string, contentType: string, oninit?: Function, logging?: boolean) {
    this.dbOSName = name;
    this.dbInstance = null;
    this.contentType = contentType;
    this.current = null;
    this.logging = logging || false;

    const request: IDBOpenDBRequest = idb.open(name);
    request.addEventListener('error', ()=>{console.error("FATAL",request)});

    request.onsuccess = () => {
      this.logger('Database opened successfully', request.result);
      this.dbInstance = request.result;

      if (oninit) oninit()
    };

    request.onupgradeneeded = (e: Event) => {
      if (!e.target) return;
      this.logger("Upgrade needed")
      const db: IDBDatabase = (e.target as IDBRequest).result
      const objectStore: IDBObjectStore = db.createObjectStore(name, { keyPath: 'id' });

      // new obj must contain these fields
      objectStore.createIndex("id_idx", "id", { unique: true });
      objectStore.createIndex("sequence_idx", "sequence", { unique: false });
      //TODO: on update sequence number, uniqueness can be broken, no indexing

      this.logger('Database setup complete');
    };
  }

  logger(...args: any[]) {
    if (this.logging) console.log(this.dbOSName, new Date().toISOString().slice(11,23), ...args)
  }

  /**
   * downloads the resource and stores a NEW Record in the DB
   * if id already exists, no update is operated
   * errors if download fails
   */
  async cache( obj: Record ): Promise<void> {
    if (!obj.url) return  // nothing to cache
    return fetch(obj.url, {mode: "cors"})
    .then(response => response.status==200 ? response.blob() : Promise.reject(response))
    .then( async blob => {
      if (!this.dbInstance) return Promise.reject('Database not initialized');
      const objectStore = this.dbInstance.transaction(this.dbOSName, 'readwrite').objectStore(this.dbOSName);
      // Add the record to IDB
      const request = objectStore.put({
        ...obj,
        status: obj.sequence!==undefined ? obj.status : false,  //if seq or status is missing, disable element by def
        sequence: obj.sequence,
        blobURL: URL.createObjectURL(blob),
        blob
      });

      request.onsuccess = (e) => {
        this.logger(`POST New Cached ID:${obj.id}`)
      }
      request.onerror = (e) => {
        if ((e.target as IDBRequest).error?.code == 0) {
          this.logger(`Already Cached ID:${obj.id}`)
        } else {
          console.error('Error', e)
        }
      }
    })
  }

  /**
   * updates a Record by overwriting partial properties
   * returns the GET Result from the DB
   */
  async update(obj: Record | FetchedRecord): Promise<Record | FetchedRecord> {
    if (!this.dbInstance) return Promise.reject('Database not initialized');
    const objectStore = this.dbInstance.transaction(this.dbOSName, 'readwrite').objectStore(this.dbOSName);
    this.logger("UPDATE",obj.id)
    // Update sequence number for selected record
    const request = objectStore.openCursor( IDBKeyRange.only(obj.id) )

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        if (!request.result) return reject()

        const cursor = request.result as IDBCursor
        const record = request.result?.value as Record
        this.logger("UPDATE ok",obj.id,{...record,...obj})
        const updateRequest = cursor.update({...record,...obj})
        updateRequest.onsuccess = () => {
          return resolve(this.get(obj.id).then(a => a as FetchedRecord))
        }
      }

      request.onerror = reject

    })
  }

  /**
   * gets Record by indexed ID
   * resolves null if not found
   */
  async get(id: string): Promise<Record | null> {
    if (!this.dbInstance) return Promise.resolve(null)
    const objectStore = this.dbInstance.transaction(this.dbOSName).objectStore(this.dbOSName);
    const request = objectStore.get(id);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
            if (request.result) {
              this.logger(`GET found ID:${request.result.id} SEQ:${request.result.sequence}`)
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

  /**
   * type guard for just checking if the fetch had happened
   */
  private isFetched(record: Record): record is FetchedRecord {
    return (record as FetchedRecord).blobURL !== undefined
  }

  /**
   * returns the playable Record (fetched) with the next sequence number to the current one
   */
  async getNext(sequence?: number): Promise<FetchedRecord> {
    if (!this.dbInstance) return Promise.reject()
    // Get played by current ID (with updated sequence number)
    const current = await this.getCurrent()
    this.logger("GET NEXT from", current?.id || this.current?.sequence || sequence, "was", !!current?.db ? "up to date": "outdated", "with DB")
    // Get by sequence number
    return this.list( v => this.isFetched(v) && v.sequence!==undefined && v.status==true && v.expiry>=new Date() && v.date<=new Date() && v.id!==current?.id )  //last check triggers also with `no current`
    .then( playlist => {
      // empty
      if (playlist.length == 0) return Promise.reject()
      // find next -- il primo con SEQ maggiore del corrente
      const last = playlist.at(-1)
      const next: Record = playlist.filter(v => // priorità di condizioni
          !!sequence    // seq specificata -- sequence settato da filtro padre
            ? v.sequence! > sequence
        : !!current && !!last && last.sequence! <= current.sequence // loop, escludendo il current (ipotetico ultimo) dalla lista, last è il precedente con seq minore
            ? v.sequence! >= 0
        : !!current   // op normale ovvero seleziona i video con seq successive
            ? v.sequence! > current.sequence
        : !!!current && !!this.current && this.current.sequence!==undefined   // caso di video eliminato, ricorda il seq attuale
            ? v.sequence! > this.current.sequence
        : v.sequence! >= 0  // panic -- riprendi da inizio
      )[0]
      this.logger("GET NEXT returned", next.id, "sequence", next.sequence)
      return Promise.resolve(next as FetchedRecord)  // TODO: Promise.race is not triggered with only the `return value` statement
    })
  }

  /**
   * takes the next Record in sequence
   * and actually commits the `current` property
   * plus checks the Blob validity for reliable playback
   */
  async loadNext(sequence?: number): Promise<FetchedRecord | null> {
    this.logger("LOAD NEXT from", this.current?.sequence || sequence)
    return this
    .getNext(sequence)
    .then( this.checkBlob.bind(this) )
    .then( next => {
      this.current = next
      this.logger("LOAD NEXT seeked to", next?.sequence, next)
      return next
    })
  }

  /**
   * attempts a request to the blob storage
   * creates a new valid blob url otherwise
   */
  async checkBlob(record: FetchedRecord | null): Promise<FetchedRecord> {
    if (record == null) return Promise.reject()
    
    // Use XHR to check if the blobURL exists (using GET instead of HEAD for blob URLs)
    const blobExists = await new Promise(resolve => {
      const xhr = new XMLHttpRequest()
      
      xhr.onerror = () => {
        // This will catch net::ERR_FILE_NOT_FOUND
        resolve(false)
      }
      
      xhr.open('GET', record.blobURL)
      xhr.responseType = 'blob'
      xhr.setRequestHeader('Range', 'bytes=0-0')
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 2) {
          // Blob exists and is accessible
          resolve(true)
          xhr.abort();
        }
      }
      xhr.send()
    })

    if (!blobExists) {
      // Blob URL is invalid, check if we have the blob content
      if (record.blob) {
        this.logger("CHECK BLOB recreating blobURL from existing blob", record?.id)
        return this.update({
          ...record,
          blobURL: URL.createObjectURL(record.blob)
        }) as Promise<FetchedRecord>
      }
    }

    this.logger("CHECK BLOB from blobStorage", record?.id)
    return Promise.resolve(record)
  }

  /**
   * assures the updated `current` Record is returned
   * guarantees consistency if it had updated properties
   */
  async getCurrent(timeout?: number): Promise<Record & {sequence: number, db?: boolean} | null> {
    // Get updated record by ID
    if (!this.current) return null
    else if (timeout!==undefined) return Promise.race([
      this
        .get(this.current.id)
        .then( v => v?.sequence!==undefined ? {...v, db: true} : this.current),
        // if current has been just removed, return the committed data either way
      new Promise( (resolve) => setTimeout(()=>{
        if (!!this.current && this.current.sequence!==undefined)
          resolve(this.current)
        // IDB has a lock, so return the saved committed data
      }, timeout))
    ]) as Promise<Record & {sequence: number, db?: boolean}>
    else return this
      .get(this.current.id)
      .then( v => (v?.sequence!==undefined ? {...v, db: true} : this.current) as Record & {sequence: number, db?: boolean}) 
      // if current has been just removed, return the committed data either way
  }

  /** 
   * should apply the same filter of the getNext
   * checking if the next is the last in the roll
   */
  async isLast(record: Record): Promise<boolean> {
    return this
    .list( v => v.sequence!==undefined && v.status==true && v.expiry>=new Date() && v.date<=new Date() )
    .then( playlist => {
      const currentLast = playlist.at(-1)
      if (!currentLast) return false
      return currentLast.id === record.id || ((this.current?.sequence||-1) >= currentLast.sequence!)
    } )
  }

  /**
   * lists all Record items, with optional filter function
   */
  async list( filterfn?: (v:Record)=>boolean ): Promise<(Record | FetchedRecord)[]> {
    if (!this.dbInstance) return Promise.reject()
    const objectStore = this.dbInstance.transaction(this.dbOSName).objectStore(this.dbOSName);
    const request = objectStore.index("sequence_idx").getAll()

    return new Promise((resolve, reject) => {
          request.onsuccess = () => {
            const array = request.result as Record[]
            if (filterfn!=undefined) resolve(array.filter( filterfn ))
            else resolve(array);
          };
          request.onerror = () => {
            console.error(request.error);
            reject(request.error);
          }
    });
  }

  /**
   * Sync with the CMS the mandatory `sequence` e `status` fields
   */
  async updateSequence(sortedList: Record[]): Promise<void> {
    if (!this.dbInstance) return Promise.reject('Database not initialized');
    const objectStore = this.dbInstance.transaction(this.dbOSName, 'readwrite').objectStore(this.dbOSName);

    const request = objectStore.openCursor()
    return new Promise((resolve,reject)=>{
      request.onsuccess = (ev: Event) => {
        const cursor: IDBCursorWithValue = (ev.target as IDBRequest).result
        if (cursor) {
          const el = sortedList.find( (v=>v.id===cursor.key) )
          // if (el && el.sequence !== (cursor.value as Record).sequence) cursor.update({...cursor.value, sequence: el.sequence}).onsuccess = ()=>{this.logger("SEQUENCE updated",cursor.key,el?.sequence)}
          if (el) cursor.update({...cursor.value, sequence: el.sequence, status: el.status}).onsuccess = ()=>{this.logger("SEQUENCE updated",cursor.key,"to",el?.sequence)}
          cursor.continue()
        } else {
          objectStore.transaction.commit()
          resolve()
        }
      }
      
    })

  }

  async delete(id: string): Promise<void> {
    if (!this.dbInstance) return Promise.reject()
    const objectStore = this.dbInstance.transaction(this.dbOSName, 'readwrite').objectStore(this.dbOSName);
    const request = objectStore.delete(id);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        this.logger("DELETE", id)
        resolve();
      };
      request.onerror = () => {
        console.error(request.error);
        reject(request.error);
      }
    });
  }
}
