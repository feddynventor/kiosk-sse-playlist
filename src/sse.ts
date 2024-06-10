
export default class Events {
    source: EventSource | null = null;

    constructor(url: string, callback: Function) {
        this.source = new EventSource( url );

        this.source.onmessage = (msg: MessageEvent) => {
            callback(msg.data)
        }
    }

}