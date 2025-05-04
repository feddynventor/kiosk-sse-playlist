import { Record } from "./idb"
import * as constants from "./constants"

/**
 * Records are descriptive of the resource
 * @returns 
 */

export const totalFetch = async (type: "video"|"image"): Promise<Record[]> => [{
    id: "011",
    sequence: 1,
    title: "video11",
    subtitle: "This is video 1",
    status: true,
    contentType: type,
    url: "samples/video11.mp4",
    date: new Date(),
    updated: new Date(),
    expiry: new Date((new Date()).getTime() + 3 * 60 * 60 * 1000)
} as Record, {
    id: "012",
    sequence: 2,
    title: "video12",
    subtitle: "This is video 2",
    status: true,
    contentType: type,
    url: "samples/video12.mp4",
    date: new Date(),
    updated: new Date(),
    expiry: new Date((new Date()).getTime() + 3 * 60 * 60 * 1000)
} as Record, {
    id: "013",
    sequence: 3,
    title: "video13",
    subtitle: "This is video 3",
    status: true,
    contentType: type,
    url: "samples/video13.mp4",
    date: new Date(),
    updated: new Date(),
    expiry: new Date((new Date()).getTime() + 3 * 60 * 60 * 1000)
} as Record, {
    id: "014",
    sequence: 4,
    title: "video14",
    subtitle: "This is video 4",
    status: true,
    contentType: type,
    url: "samples/video14.mp4",
    date: new Date(),
    updated: new Date(),
    expiry: new Date((new Date()).getTime() + 3 * 60 * 60 * 1000)
} as Record]
