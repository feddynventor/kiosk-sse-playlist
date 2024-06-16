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
const metadata = document.createElement('h4')
elem.autoplay = true;
elem.controls = true;

window.onload = async () => {
    let first = await seekNext(main_playlist)
    console.log('onload', first)
    if (!first) first = await Promise
        .all( (await totalFetch())
            .map(function(v: Record, i: number) {  //arrow function cancels bindings
                return main_playlist.cache({...v, sequence: i})  //override sequence number with one from server
            })
        )
        .then( function() {
            return seekNext(main_playlist, 0)
        })

    if (!first) return
    
    elem.src = URL.createObjectURL(first.blob)
    metadata.innerHTML = JSON.stringify({...first, blob: null})

    elem.setAttribute("custom", first.id)
    elem.play()
}

elem.onplay = async (e: Event) => {
    console.log("STARTED", await main_playlist.getCurrent())
}

elem.onended = async () => {
    const next = await seekNext(main_playlist)
    if (next) {
        // console.log("LOADED", next)
        elem.src = URL.createObjectURL(next.blob)
        metadata.innerHTML = JSON.stringify({...next, blob: null})
    }
    elem.play()
}

const seekNext = async (p: Playlist, n?: number): Promise<Record & {blob: Blob} | null> => {
    if (n==10) return Promise.resolve(null)
    if (n && n>0) console.log("seeking retry",n)
    return p.loadNext( n===undefined ? 0 : n )
    .then( video => {
        if (video && video.blob && (video.status||true)) return video as Record & {blob: Blob}
        else return new Promise((resolve, reject)=>{
            setTimeout( ()=>{ resolve(seekNext(p, n===undefined?0:++n)) }, 500 )
        })
    })
}


window.document.body.appendChild(elem)
window.document.body.appendChild(metadata)