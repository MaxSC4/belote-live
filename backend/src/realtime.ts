import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";

type ClientId = string;

interface ClientInfo {
    id: ClientId;
    ws: WebSocket;
    nickname: string;
    roomCode?: string;
}

interface Room {
    code: string;
    clients: Set<ClientId>;
    createdAt: number;
}

const clients = new Map<ClientId, ClientInfo>();
const rooms = new Map<string, Room>();

function generateClientId(): ClientId {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface BaseMessage {
    type: string;
}

interface JoinRoomMessage extends BaseMessage {
    type: "join_room";
    payload: {
        roomCode: string;
        nickname: string;
    };
}

interface RoomUpdateMessage extends BaseMessage {
    type: "room_update";
    payload: {
        roomCode: string;
        players: { id: ClientId; nickname: string }[];
    };
}

interface ErrorMessage extends BaseMessage {
    type: "error";
    payload: {
        message: string;
    };
}

type IncomingMessage = JoinRoomMessage; // pour l’instant

function send(ws: WebSocket, message: BaseMessage) {
    ws.send(JSON.stringify(message));
}

function broadcastRoomUpdate(roomCode: string) {
    const room = rooms.get(roomCode);
    if (!room) return;

    const players = Array.from(room.clients)
        .map((clientId) => clients.get(clientId))
        .filter((c): c is ClientInfo => Boolean(c))
        .map((c) => ({
        id: c.id,
        nickname: c.nickname,
        }));

    const payload: RoomUpdateMessage = {
        type: "room_update",
        payload: {
        roomCode,
        players,
        },
    };

    for (const clientId of room.clients) {
        const client = clients.get(clientId);
        if (!client) continue;
        if (client.ws.readyState === WebSocket.OPEN) {
        send(client.ws, payload);
        }
    }
}

function handleJoinRoomMessage(client: ClientInfo, message: JoinRoomMessage) {
    const roomCode = message.payload.roomCode.trim().toUpperCase();
    const nickname = message.payload.nickname.trim();

    if (!roomCode || !nickname) {
        const error: ErrorMessage = {
        type: "error",
        payload: { message: "roomCode et nickname sont obligatoires." },
        };
        send(client.ws, error);
        return;
    }

    let room = rooms.get(roomCode);
    if (!room) {
        room = {
        code: roomCode,
        clients: new Set(),
        createdAt: Date.now(),
        };
        rooms.set(roomCode, room);
    }

    if (room.clients.size >= 4 && !room.clients.has(client.id)) {
        const error: ErrorMessage = {
        type: "error",
        payload: { message: "Cette table est déjà pleine (4 joueurs)." },
        };
        send(client.ws, error);
        return;
    }

    // Si le client était déjà dans une autre room, on le retire
    if (client.roomCode && client.roomCode !== roomCode) {
        const oldRoom = rooms.get(client.roomCode);
        if (oldRoom) {
        oldRoom.clients.delete(client.id);
        if (oldRoom.clients.size === 0) {
            rooms.delete(oldRoom.code);
        } else {
            broadcastRoomUpdate(oldRoom.code);
        }
        }
    }

    client.nickname = nickname;
    client.roomCode = roomCode;
    room.clients.add(client.id);

    broadcastRoomUpdate(roomCode);
}

function handleClientDisconnect(clientId: ClientId) {
    const client = clients.get(clientId);
    if (!client) return;

    if (client.roomCode) {
        const room = rooms.get(client.roomCode);
        if (room) {
        room.clients.delete(clientId);
        if (room.clients.size === 0) {
            rooms.delete(room.code);
        } else {
            broadcastRoomUpdate(room.code);
        }
        }
    }

    clients.delete(clientId);
}

export function setupWebSocketServer(httpServer: Server) {
    const wss = new WebSocketServer({
        server: httpServer,
        path: "/ws",
    });

    wss.on("connection", (ws: WebSocket) => {
        const clientId = generateClientId();
        const client: ClientInfo = {
        id: clientId,
        ws,
        nickname: `Joueur-${clientId.slice(-4)}`,
        };

        clients.set(clientId, client);

        ws.on("message", (data: Buffer) => {
        let parsed: IncomingMessage;
        try {
            parsed = JSON.parse(data.toString());
        } catch (error) {
            const msg: ErrorMessage = {
            type: "error",
            payload: { message: "Message JSON invalide." },
            };
            send(ws, msg);
            return;
        }

        if (parsed.type === "join_room") {
            handleJoinRoomMessage(client, parsed);
        } else {
            const msg: ErrorMessage = {
            type: "error",
            payload: { message: `Type de message inconnu: ${parsed.type}` },
            };
            send(ws, msg);
        }
        });

        ws.on("close", () => {
        handleClientDisconnect(clientId);
        });

        ws.on("error", () => {
        handleClientDisconnect(clientId);
        });
    });

    console.log("WebSocket server initialized on path /ws");
}
