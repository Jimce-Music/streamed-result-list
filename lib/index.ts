import type React from 'react'
import { v7 } from 'uuid'

export type ResultExtender<ResultType> = {
    uuid: string
    data: Partial<ResultType>
}

export type SRLExtenderPacket<ResultType> = {
    isInitPacket: false
    destroy?: true
    resultExtender: ResultExtender<ResultType>
}

export type SRLInitPacket<ResultType> = {
    isInitPacket: true
    fullList: { id: string; data: Partial<ResultType> }[]
}

export type SRLJSONPacket<ResultType> =
    | SRLInitPacket<ResultType>
    | SRLExtenderPacket<ResultType>

// TODO: implement providable function which auto checks if at least n specified props are the same for an old result as for a new and merge them if so

export class StreamableResultList<ResultType> {
    private internalList: { id: string; data: Partial<ResultType> }[] = []
    private subscribers: ((resultList: Partial<ResultType>[]) => void)[] = []
    private extenderPacketHandlers: ((
        packet: SRLExtenderPacket<ResultType>
    ) => void)[] = []
    private onCloseHandlers: (() => void)[] = []

    isClosed: boolean = false

    constructor() {}

    /**
     * If provided with the getter and setter of an react state "useState()", this will always keep the state up-to-date with the StreamableResultList
     */
    hookToState(
        getter: Partial<ResultType>[],
        setter: React.Dispatch<React.SetStateAction<Partial<ResultType>[]>>
    ) {
        this.subscribe((resultList) => {
            setter(resultList)
        })
    }

    private updateTick() {
        // Call subscribers
        for (const fn of this.subscribers) {
            fn(this.internalList.map((e) => e.data))
        }
    }

    private triggerExtenderPacket(packet: SRLExtenderPacket<ResultType>) {
        for (const fn of this.extenderPacketHandlers) {
            fn(packet)
        }
    }

    close() {
        this.isClosed = true
        for (const handler of this.onCloseHandlers) {
            handler()
        }
    }

    onClose(fn: (typeof this.onCloseHandlers)[0]) {
        this.onCloseHandlers.push(fn)
    }

    onExtenderPacket(
        handlerFn: (packet: SRLExtenderPacket<ResultType>) => void
    ) {
        this.extenderPacketHandlers.push(handlerFn)
    }

    requestInitPacket(): SRLInitPacket<ResultType> {
        return {
            isInitPacket: true,
            fullList: this.internalList
        }
    }

    extend(id: string, result: Partial<ResultType>) {
        let i = 0
        for (const existingResult of this.internalList) {
            if (existingResult.id === id) {
                this.internalList[i] = {
                    id,
                    data: { ...existingResult.data, ...result } // merges existing result + new extended data (overwrites correctly)
                }
                this.updateTick()
                this.triggerExtenderPacket({
                    isInitPacket: false,
                    resultExtender: {
                        uuid: id,
                        data: { ...existingResult.data, ...result }
                    }
                })
                return
            }
            i += 1
        }
        // No existing result matches correctly
        this.internalList.push({
            id,
            data: result
        })
        this.updateTick()
        this.triggerExtenderPacket({
            isInitPacket: false,
            resultExtender: {
                uuid: id,
                data: result
            }
        })
    }

    destroy(id: string) {
        let i = 0
        for (const existingResult of this.internalList) {
            if (existingResult.id === id) {
                delete this.internalList[i]
            }
        }
        this.updateTick()
        this.triggerExtenderPacket({
            isInitPacket: false,
            destroy: true,
            resultExtender: { uuid: id, data: {} }
        })
    }

    publish(result: Partial<ResultType>) {
        const id = v7()
        const packet: SRLExtenderPacket<ResultType> = {
            isInitPacket: false,
            resultExtender: {
                uuid: id,
                data: result
            }
        }
        this.internalList.push({ id, data: result })
        this.updateTick()

        // Call extender packet handlers
        this.triggerExtenderPacket(packet)

        // Return object with further modification methods
        const p = this
        return {
            uuid: id,
            extend(result: Partial<ResultType>) {
                p.extend(id, result)
            },
            destroy() {
                p.destroy(id)
            }
        }
    }

    subscribe(
        subscriptionHandlerFn: (resultList: Partial<ResultType>[]) => void
    ) {
        subscriptionHandlerFn(this.internalList.map((e) => e.data))
        this.subscribers.push(subscriptionHandlerFn)
    }

    asArray() {
        return this.internalList.map((e) => e.data)
    }

    handlePacket(packet: SRLJSONPacket<ResultType>) {
        if (packet.isInitPacket) {
            this.internalList = packet.fullList
            this.updateTick()
        } else {
            if (packet.destroy) {
                this.destroy(packet.resultExtender.uuid)
            } else {
                this.extend(
                    packet.resultExtender.uuid,
                    packet.resultExtender.data
                )
            }
        }
    }
}

/////////////////// EXAMPLE USAGE /////////////////////////////

/* ## SERVER ## */
// type MusicSchema = {
//     name: string
//     artist: string
//     coverUrl: string
// }

// const results = new StreamableResultList<MusicSchema>()

// const diamonds = results.publish({
//     name: 'Diamonds',
//     artist: 'Rihanna'
// })

// results.subscribe(console.log)

// setTimeout(() => {
//     diamonds.extend({
//         coverUrl:
//             'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/45369a4d-49b0-4199-8099-39262f50cc39/dlnqzh8-37dcf805-daa4-40fd-8abb-d3811a2a38fb.png/v1/fit/w_640,h_640,q_70,strp/diamond_by_duanxx_dlnqzh8-375w-2x.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9NjQwIiwicGF0aCI6Ii9mLzQ1MzY5YTRkLTQ5YjAtNDE5OS04MDk5LTM5MjYyZjUwY2MzOS9kbG5xemg4LTM3ZGNmODA1LWRhYTQtNDBmZC04YWJiLWQzODExYTJhMzhmYi5wbmciLCJ3aWR0aCI6Ijw9NjQwIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmltYWdlLm9wZXJhdGlvbnMiXX0.TCVsi2-yjCqytrLMJNtFWCQNMBldTxXtkcGo3uE9pVo'
//     })
// }, 1000)

/* ## CLIENT ## */
// const [res, setRes] = useState<Partial<MusicSchema>>([])
// const rl = new StreamableResultList<MusicSchema>()
// rl.hookToState(res, setRes)
// // now access state with res in a react manner
// or via http:
// const remoteResults = new StreamableResultList<MusicSchema>()
// onArrival(packet) => remoteResults.handlePacket(packet) // pseudo-code ofc
