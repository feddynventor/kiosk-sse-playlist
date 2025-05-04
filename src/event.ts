/**
 * any event triggers a call to the playlist element
 * or eventually can request a double check to the API
 */

// import { APIRecord, sortedList } from './api';
import { Playlist } from './idb';

export interface UpdateEvent {
    uuid: string
    domain?: string
    id?: number
    update_date: Date
    classgroup?: number
    status?: boolean
    title?: string
    override?: string
    subtitle?: string
    heading?: string
    expiry_date?: string
}