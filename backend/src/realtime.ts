import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";

import {
    GameState,
    GamePhase,
    startNewGame,
    chooseTrump,
    ChooseTrumpPayload,
    validatePlay,
    playCard,
} from "./game/gameState";

import { Card, PlayerId } from "./game/types";

type ClientId = string;

interface ClientInfo {
    id: ClientId;
    ws: WebSocket;
    nickname: string;
    roomCode?: string;
    seat?: PlayerId; // 0..3
}

interface Room {
    code: string;
    clients: Set<ClientId>;
    createdAt: number;
    seats: (ClientId | null)[]; // index = seat (0..3)
    gameState?: GameState;
}

const clients = new Map<ClientId, ClientInfo>();
const rooms = new Map<string, Room>();

function generateClientId(): ClientId {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// --------- Messages ---------

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

interface StartGameMessage extends BaseMessage {
    type: "start_game";
}

interface PlayCardMessage extends BaseMessage {
    type: "play_card";
    payload: {
        card: Card;
    };
}

interface RoomUpdateMessage extends BaseMessage {
    type: "room_update";
    payload: {
        roomCode: string;
        players: { id: ClientId; nickname: string; seat: PlayerId | null }[];
    };
}

interface GameStateMessage extends BaseMessage {
    type: "game_state";
    payload: {
        state: GameState;
    };
}

interface ErrorMessage extends BaseMessage {
    type: "error";
    payload: {
        message: string;
    };
}

interface ChooseTrumpMessage extends BaseMessage {
    type: "choose_trump";
    payload: ChooseTrumpPayload; // importé depuis gameState
}

type IncomingMessage =
    | JoinRoomMessage
    | StartGameMessage
    | PlayCardMessage
    | ChooseTrumpMessage;

// --------- Utils envoi ---------

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
        seat: c.seat ?? null,
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

function broadcastGameState(room: Room) {
    if (!room.gameState) return;

    const message: GameStateMessage = {
        type: "game_state",
        payload: {
        state: room.gameState,
        },
    };

    for (const clientId of room.clients) {
        const client = clients.get(clientId);
        if (!client) continue;
        if (client.ws.readyState === WebSocket.OPEN) {
        send(client.ws, message);
        }
    }
}

// --------- Handlers ---------

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
        seats: [null, null, null, null],
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

    // Retirer de l'ancienne room si besoin
    if (client.roomCode && client.roomCode !== roomCode) {
        const oldRoom = rooms.get(client.roomCode);
        if (oldRoom) {
        oldRoom.clients.delete(client.id);
        if (client.seat !== undefined) {
            const seatIndex = client.seat;
            if (oldRoom.seats[seatIndex] === client.id) {
            oldRoom.seats[seatIndex] = null;
            }
        }

        if (oldRoom.clients.size === 0) {
            rooms.delete(oldRoom.code);
        } else {
            broadcastRoomUpdate(oldRoom.code);
        }
        }
    }

    client.nickname = nickname;
    client.roomCode = roomCode;

    // Assigner un siège s'il n'en a pas déjà
    if (client.seat === undefined) {
        let assignedSeat: PlayerId | undefined;
        for (let i = 0; i < 4; i++) {
        if (room.seats[i] === null || room.seats[i] === client.id) {
            assignedSeat = i as PlayerId;
            room.seats[i] = client.id;
            break;
        }
        }

        if (assignedSeat === undefined) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Impossible d'assigner un siège à ce joueur." },
        };
        send(client.ws, error);
        return;
        }

        client.seat = assignedSeat;
    }

    room.clients.add(client.id);
    broadcastRoomUpdate(roomCode);
}

function handleStartGameMessage(client: ClientInfo) {
    if (!client.roomCode) {
        const error: ErrorMessage = {
        type: "error",
        payload: { message: "Vous n'êtes pas dans une room." },
        };
        send(client.ws, error);
        return;
    }

    const room = rooms.get(client.roomCode);
    if (!room) {
        const error: ErrorMessage = {
        type: "error",
        payload: { message: "Room introuvable côté serveur." },
        };
        send(client.ws, error);
        return;
    }

    if (room.clients.size !== 4) {
        const error: ErrorMessage = {
        type: "error",
        payload: { message: "Il faut 4 joueurs pour lancer la partie." },
        };
        send(client.ws, error);
        return;
    }

    // Pour l'instant, donneur fixe = siège 0
    const dealer: PlayerId = 0;
    room.gameState = startNewGame(dealer);

    broadcastGameState(room);
    }

    function handlePlayCardMessage(client: ClientInfo, message: PlayCardMessage) {
    if (!client.roomCode) {
        const error: ErrorMessage = {
        type: "error",
        payload: { message: "Vous n'êtes pas dans une room." },
        };
        send(client.ws, error);
        return;
    }

    const room = rooms.get(client.roomCode);
    if (!room || !room.gameState) {
        const error: ErrorMessage = {
        type: "error",
        payload: { message: "Aucune partie en cours dans cette room." },
        };
        send(client.ws, error);
        return;
    }

    if (client.seat === undefined) {
        const error: ErrorMessage = {
        type: "error",
        payload: { message: "Vous n'avez pas de siège assigné." },
        };
        send(client.ws, error);
        return;
    }

    const state = room.gameState;

    if (state.phase !== GamePhase.PlayingTricks) {
        const error: ErrorMessage = {
        type: "error",
        payload: { message: "La partie n'est pas en phase de plis." },
        };
        send(client.ws, error);
        return;
    }

    if (state.currentPlayer !== client.seat) {
        const error: ErrorMessage = {
        type: "error",
        payload: { message: "Ce n'est pas votre tour." },
        };
        send(client.ws, error);
        return;
    }

    const validationError = validatePlay(state, client.seat, message.payload.card);
    if (validationError) {
        const error: ErrorMessage = {
        type: "error",
        payload: { message: validationError },
        };
        send(client.ws, error);
        return;
    }

    try {
        playCard(state, client.seat, message.payload.card);
        broadcastGameState(room);
    } catch (e: any) {
        const error: ErrorMessage = {
        type: "error",
        payload: { message: e?.message ?? "Erreur lors du jeu de la carte." },
        };
        send(client.ws, error);
    }
}

function handleChooseTrumpMessage(client: ClientInfo, message: ChooseTrumpMessage) {
    if (!client.roomCode) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Vous n'êtes pas dans une room." },
        };
        send(client.ws, error);
        return;
    }

    const room = rooms.get(client.roomCode);
    if (!room || !room.gameState) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Aucune partie en cours dans cette room." },
        };
        send(client.ws, error);
        return;
    }

    if (client.seat === undefined) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Vous n'avez pas de siège assigné." },
        };
        send(client.ws, error);
        return;
    }

    // Appliquer la logique de prise
    room.gameState = chooseTrump(room.gameState, client.seat, message.payload);

    // Diffuser le nouvel état à tout le monde
    broadcastGameState(room);
}


function handleClientDisconnect(clientId: ClientId) {
    const client = clients.get(clientId);
    if (!client) return;

    if (client.roomCode) {
        const room = rooms.get(client.roomCode);
        if (room) {
        room.clients.delete(clientId);

        if (client.seat !== undefined) {
            const seatIndex = client.seat;
            if (room.seats[seatIndex] === clientId) {
            room.seats[seatIndex] = null;
            }
        }

        if (room.clients.size === 0) {
            rooms.delete(room.code);
        } else {
            broadcastRoomUpdate(room.code);
        }
        }
    }

    clients.delete(clientId);
}

// --------- Setup WebSocket ---------

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
        } catch {
            const msg: ErrorMessage = {
            type: "error",
            payload: { message: "Message JSON invalide." },
            };
            send(ws, msg);
            return;
        }

        switch (parsed.type) {
            case "join_room":
                handleJoinRoomMessage(client, parsed);
                break;
            case "start_game":
                handleStartGameMessage(client);
                break;
            case "play_card":
                handlePlayCardMessage(client, parsed);
                break;
            case "choose_trump":
                handleChooseTrumpMessage(client, parsed);
                break;
            default: {
                const msg: ErrorMessage = {
                    type: "error",
                    payload: { message: "Type de message inconnu." },
                };
                send(ws, msg);
                break;
            }
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
