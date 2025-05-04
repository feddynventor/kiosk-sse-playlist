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


interface CMSEvent {
    type: "update"|"delete"|"insert",
    payload: UpdateEvent | APIRecord
}

const elem = document.createElement('video');
const metadata = document.createElement('h4')
elem.autoplay = true;
elem.controls = true;

const events = new EventSource('http://192.168.0.238:8989/events', { withCredentials: true })
events.onmessage = (ev: MessageEvent) => {
    const event = JSON.parse(ev.data as string) as CMSEvent
    console.log("SSE", event)
    if (event.type == "update")
        return update(main_playlist, event.payload as UpdateEvent)
    if (event.type == "insert") 
        return insert(main_playlist, event.payload as APIRecord)
        .then( (sorted: (Record|null)[]) => {
            if (elem.paused && sorted[0] && sorted[0].blob) elem.src = URL.createObjectURL(sorted[0].blob)
        })
}

const db_onload = async () => {
    const first = await main_playlist.loadNext(0)
    if (!!first) {
        metadata.innerHTML = JSON.stringify({...first, blob: null})
        elem.src = URL.createObjectURL(first.blob)
        elem.play()
    }

    // sync with backend DB, calculating the elements differences
    loadNew()
    .then( v => Promise.allSettled(v.map(function(v: Record) {  //arrow function cancels bindings
        return main_playlist.cache(v)
    })) )
    .then( sortedList )  // from cloud api
    .then( playlist => Promise.race(playlist.map( (v,i) => main_playlist.updateSequence(v.id, i+1) )) )  //seq minimo =1
    .then( async function() {
        if (!elem.paused) return;
        // else is blocked
        const first = await main_playlist.loadNext(0)
        if (!first) return
        metadata.innerHTML = JSON.stringify({...first, blob: null})
        elem.src = URL.createObjectURL(first.blob)
        elem.play()
    })
}

const main_playlist = new Playlist('videos', db_onload)

elem.onplay = async (e: Event) => {
    console.log("STARTED", await main_playlist.getCurrent())
}

elem.onended = async () => {
    const next = await main_playlist.loadNext()
    if (next) {
        elem.src = URL.createObjectURL(next.blob)
        metadata.innerHTML = JSON.stringify({...next, blob: null})
    }
    elem.play()
}

window.document.body.appendChild(elem)
window.document.body.appendChild(metadata)

const loadNew = async () => {
    const cloud = await totalFetch() as Record[]
    const local = (await main_playlist.list()).map( v => v.id ) as string[]

    const c = cloud.filter( v => !local.includes( v.id ) )
    console.log("FOUND NEW", c)
    return c
}