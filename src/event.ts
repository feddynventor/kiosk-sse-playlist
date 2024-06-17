import { APIRecord, dataSynthesis, singleFetch, sortedList } from './api.js';
import { Playlist } from './idb.js';

export interface UpdateEvent {
    domain: string
    id: number
    status?: boolean
    title?: string
}

export const update = (p: Playlist, ev: UpdateEvent)=>{
    return p.get(`${ev.domain}@${ev.id}`)
    .then( async record => {
        if (record !== null)
            return p.update({
                ...record,
                status: ev.status!=undefined ? ev.status : record.status,
                title: ev.title!=undefined ? ev.title : record.title  // per esempio
            })
        else 
            return singleFetch(ev.domain, ev.id)
            .then(function(toCache){p.cache(toCache)})  // will be cached as disabled, but after a sort will be done
    })
    .then( sortedList )  // from cloud api
    .then( playlist => Promise.all(playlist.map( (v,i) => p.updateSequence(v.id, i+1) )) )  //seq minimo =1
}

export const insert = (p: Playlist, ev: APIRecord)=>{
    return p.cache({
        ...dataSynthesis(ev),
        status: false
    })
    .then( sortedList )  // from cloud api
    .then( playlist => Promise.all(playlist.map( (v,i) => p.updateSequence(v.id, i+1) )) )  //seq minimo =1
}