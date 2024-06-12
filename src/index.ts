import { Playlist, Record } from './idb.js';
import Events from './sse.js';

const main_playlist = new Playlist('videos')

// sample data
const videos: Record[] = [
    {
        name: "video1",
        url: 'http://127.0.0.1:8001/samples/video11.mp4',
        id: '1'
    },
    {
        name: "video2",
        url: 'http://127.0.0.1:8001/samples/video12.mp4',
        id: '2'
    },
    {
        name: "video4",
        url: 'http://127.0.0.1:8001/samples/video13.mp4',
        id: '4'
    }
]
const events = new Events('http://127.0.0.1:8000/events', (data: string) => {
    videos.push(JSON.parse(data) as Record)
})

let index = 0;
const elem = document.createElement('video');
elem.autoplay = true;
elem.controls = true;

window.onload = async () => {
    console.log('onload', videos[0])
    elem.src = await getVideoBlob(videos[0]).then(URL.createObjectURL)
    elem.play()
}

elem.onended = async () => {
    index++;
    elem.src = await getVideoBlob(videos[index]).then(URL.createObjectURL)
    elem.play()
}

window.document.body.appendChild(elem)

async function getVideoBlob(video: Record): Promise<Blob> {
    const blob = await main_playlist.load(video.id)
    if (blob) return Promise.resolve( blob )
    else return main_playlist.cache(video)
        .then(() => main_playlist.load(video.id))
        .then(blob => blob ? Promise.resolve(blob) : Promise.reject('Blob not found'))
}