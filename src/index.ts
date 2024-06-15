import { Playlist, Record } from './idb.js';
import { totalFetch } from './api.js';
import { UpdateEvent, update } from './event.js';

const main_playlist = new Playlist('videos')

interface CMSEvent {
    type: "update"|"delete"|"insert",
    payload: UpdateEvent
}

const events = new EventSource('http://192.168.0.238:8989/events', { withCredentials: true })
events.onmessage = (ev: MessageEvent) => {
    const event = JSON.parse(ev.data as string) as CMSEvent
    if (event.type == "update") return update(event.payload)
}

const elem = document.createElement('video');
elem.autoplay = true;
elem.controls = true;

window.onload = async () => {
    // main_playlist.list().then(console.log)
    // return
    const first = await goNext(main_playlist)
    console.log('onload', first)
    // REVIEW TRANSACTIONS MATTER
    if (!first) await Promise
        .all( (await totalFetch()).map(function(v: Record) {  //arrow function cancels bindings
            main_playlist.cache(v)
        }) )
        .then( async function() {
            const v = await main_playlist.getCurrent()
            console.log(v?.title)
            if (!v || !v.blob) return
            elem.src = URL.createObjectURL(v.blob)
        })
    //else elem.src = URL.createObjectURL(first.blob)

    elem.setAttribute("custom", "asa")
    elem.play()
}

elem.onplay = async (e: Event) => {
    console.log("STARTED", await main_playlist.getCurrent())
}

elem.onended = async () => {
    // elem.src = await goNext(main_playlist).then(v=>v.blob).then(URL.createObjectURL)
    elem.play()
}

const goNext = async (p: Playlist, n?: number): Promise<Record & {blob: Blob} | null> => {
    if (n==3) return Promise.resolve(null)
    console.log("retry",n)
    const video = await p.loadNext()
    if (video && video.blob && (video.status||true)) return video as Record & {blob: Blob}
    else return new Promise((resolve, reject)=>{
        setTimeout( ()=>{ resolve(goNext(p, n===undefined?0:++n)) }, 500 )
    })
}


window.document.body.appendChild(elem)