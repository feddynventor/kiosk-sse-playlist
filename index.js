const request = window.indexedDB.open('playlist', 1);
request.addEventListener('error', () => console.error('Database failed to open'));

let db;
request.addEventListener('success', () => {
  console.log('Database opened successfully');
  db = request.result;

  const objectStore = db.transaction('playlist').objectStore('playlist');

  // sample flow
  videos.forEach( v => {
    const cachedVideo = objectStore.get(v.id);
    cachedVideo.addEventListener('success', () => {
      if(cachedVideo.result) {
        console.log('taking videos from IDB', cachedVideo.result);
        displayVideo(cachedVideo.result.blob, cachedVideo.result.url);
      } else {
        cacheVideo(v);
      }
    });
  })
});

// Setup the database tables if this has not already been done
request.addEventListener('upgradeneeded', e => {
  const db = e.target.result;
  const objectStore = db.createObjectStore('playlist', { keyPath: 'id' });

  objectStore.createIndex('blob_idx', 'blob', { unique: false });
  objectStore.createIndex('url_idx', 'url', { unique: false });

  console.log('Database setup complete');
});

// sample data
const videos = [
  {
    name: "video1",
    url: 'http://192.168.0.238:8001/samples/video11.mp4',
    id: 1
  },
  {
    name: "video2",
    url: 'http://192.168.0.238:8001/samples/video12.mp4',
    id: 2
  },
  {
    name: "video_enorme",
    url: 'http://192.168.0.238:8001/samples/big.mp4',
    id: 3
  },
  {
    name: "video4",
    url: 'http://192.168.0.238:8001/samples/video13.mp4',
    id: 4
  }
]

function init() {
}

function cacheVideo(obj){
  fetch(obj.url)
  .then(response => response.blob())
  .then(blob => {
    const objectStore = db.transaction(['playlist'], 'readwrite').objectStore('playlist');
    // Add the record to IDB
    const request = objectStore.add({
      blob,
      ...obj
    });
  
    request.addEventListener('success', () => console.log('Record addition attempt finished for', obj.id));
    request.addEventListener('error', () => console.error(request.error));
  })
}

// sample app workflow
// Define the displayVideo() function
function displayVideo(blob, url) {
  const h2 = document.createElement('h2');
  h2.textContent = url;
  document.querySelector('body').appendChild(h2);

  const video = document.createElement('video');
  video.controls = true;
  video.autoplay = true;
  const source1 = document.createElement('source');
  source1.src = URL.createObjectURL(blob);
  source1.type = 'video/mp4';
  video.appendChild(source1);

  document.querySelector('body').appendChild(video);
}

