import { Record } from "./idb"
interface APIRecord {
    author: string
    category: string
    classgroup: number //sequence number of group
    creation_date: Date
    domain: string //domain or website
    err_message: null
    expiry_date: Date //put by the CMS
    heading: string
    id: number
    image: string
    override: string //override title
    slug: string //alternative ID
    status: "fetched" //must be
    subtitle: string
    title: string
    update_date: Date //of the CMS
    vimeo: {
        static_url: string
        duration: number
        expires: Date
    }
}


export const totalFetch = async (): Promise<Record[]> => fetch(
        'http://192.168.0.238:8989/api/cache/onair?type=video&vimeo=true',
        { credentials: 'include' })
    .then( res => res.status==200 ? res.json() : Promise.reject(res.json()) )
    .then( debug => {
        console.log(debug)
        return debug
    })
    .then( (data: APIRecord[]) => data.map( (v, index) => ({
        id: v.id.toString(),
        url: v.vimeo.static_url,
        title: v.title,
        subtitle: v.subtitle,
        status: true,
        sequence: index
    })))