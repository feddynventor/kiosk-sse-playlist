import { Playlist, Record } from './idb.js';

export interface UpdateEvent {
    domain: string
    id: number
    status: boolean
}

export const update = (ev: UpdateEvent)=>{
    //playlist.filter( p => p.id == ev.id )[0]
}