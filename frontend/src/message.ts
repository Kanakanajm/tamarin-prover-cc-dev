export type BroadcastMessage = {
    type: BroadcastMessageType,
    payload?: string | null
}

export type BroadcastMessageType = "ping" | "pong" | "close-popup" | "popup-closed" | "response-dotsrc" 