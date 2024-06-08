import { Playlist, Record } from './idb.js';

// sample data
const videos: Record[] = [
    {
        name: "video1",
        url: 'http://10.0.0.35:8001/samples/video11.mp4',
        id: '1'
    },
    {
        name: "video2",
        url: 'http://10.0.0.35:8001/samples/video12.mp4',
        id: '2'
    },
    // {
    //     name: "video_enorme",
    //     url: 'http://127.0.0.1:8001/samples/big.mp4',
    //     id: '3'
    // },
    {
        name: "video4",
        url: 'http://127.0.0.1:8001/samples/video13.mp4',
        id: '4'
    }
]


const p = new Playlist('videos', ['name', 'url'])

videos.forEach(video => {
//    p.cache(video as Record)
//    .then( () => console.log('Cached', video.id) )
//    .then( () => p.load(video.id) )
//    .then( displayVideo )
//    .catch( e => console.error(e) )
})

function displayVideo(blob: Blob) {
    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = true;
    const source1 = document.createElement('source');
    source1.src = URL.createObjectURL(blob);
    source1.type = 'video/mp4';
    video.appendChild(source1);

    document.querySelector('body')?.appendChild(video);
}
