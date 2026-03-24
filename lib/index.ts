import { useState } from 'react'
import uuid from 'uuid'

export type ResultExtender<ResultType> = {
    uuid: string
    data: Partial<ResultType>
}

export type SRLExtenderPacket<ResultType> = {
    isInitPacket: false
    resultExtender: ResultExtender<ResultType>
}

export type SRLInitPacket<ResultType> = {
    isInitPacket: true
    fullList: Partial<ResultType>[]
}

export type SRLJSONPacket<ResultType> =
    | SRLInitPacket<ResultType>
    | SRLExtenderPacket<ResultType>

// TODO: implement providable function which auto checks if at least n specified props are the same for an old result as for a new and merge them if so

export class StreamableResultList<ResultType> {
    private exportableState = useState<Partial<ResultType>[]>([])
    private internalList: Partial<ResultType>[] = []
    private subscribers: Function[] = []
    private extenderPacketHandlers: Function[] = []

    constructor() {}

    private updateTick() {
        this.exportableState[1](this.internalList) // Calls react state setter

        // Call subscribers
        for (const fn of this.subscribers) {
            fn(this.internalList)
        }
    }

    onExtenderPacket(
        handlerFn: (packet: {
            isInitPacket: SRLExtenderPacket<ResultType>
        }) => void
    ) {
        this.extenderPacketHandlers.push(handlerFn)
    }

    requestInitPacket(): SRLInitPacket<ResultType> {
        return {
            isInitPacket: true,
            fullList: this.internalList
        }
    }

    publish(result: Partial<ResultType>) {
        const id = uuid.v7()
        const packet: SRLExtenderPacket<ResultType> = {
            isInitPacket: false,
            resultExtender: {
                uuid: id,
                data: result
            }
        }
        this.internalList.push(result)
        this.updateTick()

        // Call extender packet handlers
        for (const fn of this.extenderPacketHandlers) {
            fn(packet)
        }
    }

    subscribe(
        subscriptionHandlerFn: (resultList: Partial<ResultType>[]) => void
    ) {
        this.subscribers.push(subscriptionHandlerFn)
    }

    subscribeAsState() {
        return this.exportableState[0]
    }

    handlePacket(packet: SRLJSONPacket<ResultType>) {
        if (packet.isInitPacket) {
            this.internalList = packet.fullList
            this.updateTick()
        } else {
        }
    }
}

/////////////////// EXAMPLE USAGE /////////////////////////////

/* ## SERVER ## */
type MusicSchema = {
    name: string
    artist: string
    coverUrl: string
}

const results = new StreamableResultList<MusicSchema>()

const diamonds = results.publish({
    name: 'Diamonds',
    artist: 'Rihanna'
})

diamonds.extend({
    coverUrl:
        'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/45369a4d-49b0-4199-8099-39262f50cc39/dlnqzh8-37dcf805-daa4-40fd-8abb-d3811a2a38fb.png/v1/fit/w_640,h_640,q_70,strp/diamond_by_duanxx_dlnqzh8-375w-2x.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9NjQwIiwicGF0aCI6Ii9mLzQ1MzY5YTRkLTQ5YjAtNDE5OS04MDk5LTM5MjYyZjUwY2MzOS9kbG5xemg4LTM3ZGNmODA1LWRhYTQtNDBmZC04YWJiLWQzODExYTJhMzhmYi5wbmciLCJ3aWR0aCI6Ijw9NjQwIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmltYWdlLm9wZXJhdGlvbnMiXX0.TCVsi2-yjCqytrLMJNtFWCQNMBldTxXtkcGo3uE9pVo'
})

/* ## CLIENT ## */
const state = results.subscribeAsState()
// or via http:
const remoteResults = new StreamableResultList<MusicSchema>()
// onArrival(packet) => remoteResults.handlePacket(packet) // pseudo-code ofc
