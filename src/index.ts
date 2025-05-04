import { FetchedRecord, Record, Playlist } from './idb';
import { totalFetch } from './api';
import { UpdateEvent } from './event';
import * as constants from "./constants"

/**
 * UI Declarations
 */

const video = document.createElement('video');
video.setAttribute("type", "video/mp4")
video.autoplay = true;
video.controls = true;
video.muted = true;

const video_metadata: {
    title: HTMLElement,
    subtitle: HTMLElement
} = {
    title: document.querySelector("#video_title") || document.createElement("p"),
    subtitle: document.querySelector("#video_subtitle") || document.createElement("p"),
}

window.document.body.appendChild(video)

/**
 * Event handlers
 * placeholder
 */

interface CMSEvent {
    type: "update"|"delete"|"insert",
    payload: UpdateEvent
}

const events = new EventSource(constants.CMS_URL+'/events', { withCredentials: true })

/**
 * Playlist 'video'
 * Avvia il resync (creazione promise)
 * Istanzia event handlers della Video Web API
 * Viene gestito il fetch del next invece che di quello attuale
 * Con l'ottenimento di k, faccio fetch di k+1
 */

const main_playlist = new Playlist('videos', 'video', async () => {
    let next: FetchedRecord | null = null

    // sync with backend DB, calculating the elements differences
    const resync = sync(main_playlist)
    .then( async function() {
        const first = await main_playlist.loadNext(0)
        // seek della playlist non bloccante
        const a = await main_playlist.getNext()
        if (!!a) next = await main_playlist.checkBlob(a)
        // primo playback
        if (!first) return
        if (!video.paused) return;
        // else entire playout is blocked
        setElement(video_metadata, first, "hidden")
        video.src = first.blobURL
        video.play()
        console.log("CURRENTLY PLAYING", first);
    })

    let waitNext: Promise<any> | null = null  // se Promise è valorizzata (eventuale check su _pending_)
    video.ontimeupdate = function(e) {
        // ottenimento del successivo - eventualmente aggiornato - 6 secondi prima della fine
        if (!waitNext && !isNaN(video.duration) && video.duration > 6 && video.currentTime >= video.duration-6) waitNext = promiseTimeout(
            main_playlist.getNext(),
            function(){ return next },  // già ottenuto in precedenza tra la fine e l'inizio del video attuale
            5800  // return della Promise piu veloce
        ).then( async record => {
            Object.values(video_metadata).forEach(e => e.style.removeProperty("animation"));
            if (!!!record) return
            // save & check blob
            next = await main_playlist.checkBlob(record)
        })
    }
    
    video.onended = async function() {
        Object.values(video_metadata).forEach( el => el.classList.add("hidden") )
        if (next !== null) {
            // comando asincrono di refresh playlist
            main_playlist.isLast(next).then( function(t) {if(t) return sync(main_playlist)} )
            // play da next in cache
            console.log("CURRENTLY PLAYING", next);
            video.src = next.blobURL
            video.play()
            setElement(video_metadata, next, "hidden")
            // conferma seek dello stesso next
            main_playlist
            .loadNext()
            .then( () => {
                // reset controllo timeout
                waitNext = null
            })
            .catch( async () => await resync )
        } else return await resync
    }
}, true) //logging

/**
 * Effettua la sincronizzazione con il backend
 * Rimuove i post scaduti
 * Rimouve i post non presenti sul cloud
 * @param p playlist su cui fare i controlli locali
 * @returns lista dei post nuovi e i post modificati
 */
const loadNew = async (p: Playlist, url?: string): Promise<{insert: Record[], updated: Record[]}> => {
    // delete expired
    // await p.list(v => v.expiry < new Date() || v.sequence===undefined)
    // .then( toDelete => Promise.all(toDelete.map( v => p.delete(v.id) )) )

    const cloud = (await totalFetch(p.contentType as "video"|"image") as Record[])
    const local = await p.list()

    // ELIMINA
    // quelli presenti in locale ma non dettati dal CMS
    const d = local.filter( v => !cloud.map(i=>i.id).includes( v.id ) )
    console.log(p.dbOSName, "REMOVING", d)
    await Promise.all( d.map( v => p.delete(v.id) ) )

    // RITORNA
    // quelli presenti su CMS ma non in locale -- o se local presenta quello CMS ma con data aggiornata o URL aggiornato
    const insert = cloud.filter( v => !local.map(i=>i.id).includes( v.id ) )
    const updated = cloud.filter( v => local.filter( i => v.id==i.id && (v.updated > i.updated || v.url!==i.url)).length>0 )
    console.log(p.dbOSName, "FOUND NEW", insert)
    console.log(p.dbOSName, "FOUND UPD", updated)
    return { insert, updated }
}

/**
 * Commit delle operazioni di aggiornamento nel DB 
 * @param p playlist da aggiornare
 * @returns reject di cache, update, API per sortedList, IndexedDB per record da aggiornare mancante
 */
const sync = async function(p: Playlist, url?: string){
    console.log("SYNC",p.dbOSName)
    return loadNew(p, url)
    .then( list => Promise.allSettled([
            awaitSequentially(p.cache.bind(p), list.insert),
            awaitSequentially(p.update.bind(p), list.updated)
        ])
    )
    // .then( ()=>sortedList(p.contentType as "video"|"image", url) )
    // .then( p.updateSequence.bind(p) )
}

/**
 * UTILITY FUNCTIONS
 */

/**
 * Imposta i dati sulla grafica
 * @param set di elementi
 * @param data con rispettivi valori
 * @param className della transizione di entrata e uscita
 */
const setElement = (
    set: {
        title: HTMLElement,
        subtitle: HTMLElement
    },
    data: Record,
    className?: string,
    smaller?: boolean
) => {
    Object.entries(set).forEach( element => {
        const key: string = element[0].valueOf()
        const el: HTMLElement = element[1]
        if (!el) return
        el.innerHTML = data[key as "title"|"subtitle"]
    } )
}

/**
 * 
 * @param promise da eseguire
 * @param callback in caso la promise tardi
 * @param timeout tempo massimo per il quale considerare la promise
 * @returns una promise con il valore che prima arriva
 */
const promiseTimeout = (promise: Promise<any>, callback: Function, timeout: number, minTime?: number) => minTime===undefined 
? Promise.race([
    promise,
    new Promise( (resolve) => setTimeout(()=>{resolve(callback())}, timeout))
])
: Promise.allSettled([
    Promise.race([
        promise,
        new Promise( (resolve) => setTimeout(()=>{resolve(callback())}, timeout))
    ]),
    new Promise( (resolve) => setTimeout(resolve, minTime))
]).then( promises => promises[0].status==="fulfilled" ? promises[0].value : null )

/**
 * Utility per aspettare una promise per volta
 * @param fn 
 * @param tasks 
 * @returns 
 */
const awaitSequentially = async (fn: (arg0: Record)=>Promise<any>, tasks: Record[]) => {
    for (const task of tasks) {
        try {
            await fn(task)   //crea Promise qui, and so await it
        } catch (e) {}
    }
    return
};

/**
 * @param date 
 * @param n di ore per il calcolo del range
 * @returns boolean
 */
function isInLastHours(date: Date, n?: number) {
    const ago = new Date(Date.now() - (n || 1) * 3600 * 1000);
    return date > ago && date <= new Date();
}