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
    announceBelote
} from "./game/gameState";

import { Card, PlayerId } from "./game/types";
import { supabaseAdmin, hasSupabaseConfig } from "./supabase";

type ClientId = string;

interface ClientInfo {
    id: ClientId;
    ws: WebSocket;
    nickname: string;
    roomCode?: string;
    seat?: PlayerId; // 0..3
    userId?: string;
    avatarUrl?: string | null;
    profileStats?: {
        wins: number;
        games: number;
    };
}

interface Room {
    code: string;
    clients: Set<ClientId>;
    createdAt: number;
    seats: (ClientId | null)[];
    gameState?: GameState;

    matchScores: {
        team0: number;
        team1: number;
    };

    dealNumber: number;
    reactions: (PlayerReactionState | null)[];
    reactionTimeouts: (NodeJS.Timeout | null)[];
}

interface PlayerReactionState {
    emoji: string;
    expiresAt: number;
}

interface ProfileRecord {
    id: string;
    username: string;
    avatar_url: string | null;
    wins: number;
    games: number;
}

const REACTION_DURATION_MS = 5000;

const clients = new Map<ClientId, ClientInfo>();
const rooms = new Map<string, Room>();
const ALLOWED_REACTION_EMOJIS = new Set(["😡", "😄", "😢", "🤔", "😎", "🎉"]);

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
        nickname?: string;
        accessToken: string;
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
        players: {
            id: ClientId;
            nickname: string;
            seat: PlayerId | null;
            userId?: string | null;
            avatarUrl?: string | null;
            stats?: {
                wins: number;
                games: number;
                winrate: number;
            };
        }[];
    };
}

interface GameStateMessage extends BaseMessage {
    type: "game_state";
    payload: {
        state: GameState & {
            matchScores: {
                team0: number;
                team1: number;
            };

            dealNumber: number;
            playerReactions: Record<string, PlayerReactionState>;
        };
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

interface AnnounceBeloteMessage extends BaseMessage {
    type: "announce_belote";
}

interface PlayerReactionMessage extends BaseMessage {
    type: "player_reaction";
    payload: {
        emoji: string;
    };
}

type IncomingMessage =
    | JoinRoomMessage
    | StartGameMessage
    | PlayCardMessage
    | ChooseTrumpMessage
    | AnnounceBeloteMessage
    | PlayerReactionMessage
    | SyncProfileMessage;

interface SyncProfileMessage extends BaseMessage {
    type: "sync_profile";
    payload: {
        accessToken: string;
    };
}

// --------- Utils envoi ---------

function send(ws: WebSocket, message: BaseMessage | any) {
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
        userId: c.userId ?? null,
        avatarUrl: c.avatarUrl ?? null,
        stats: c.profileStats
            ? {
                wins: c.profileStats.wins,
                games: c.profileStats.games,
                winrate:
                    c.profileStats.games > 0
                        ? c.profileStats.wins / c.profileStats.games
                        : 0,
            }
            : undefined,
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
            state: {
                ...room.gameState,
                matchScores: room.matchScores,
                dealNumber: room.dealNumber,
                playerReactions: serializeReactions(room),
            },
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

function serializeReactions(room: Room) {
    const payload: Record<string, PlayerReactionState> = {};
    room.reactions.forEach((reaction, seatIndex) => {
        if (!reaction) return;
        payload[String(seatIndex)] = reaction;
    });
    return payload;
}

function scheduleReactionTimeout(room: Room, seat: PlayerId) {
    const existing = room.reactionTimeouts[seat];
    if (existing) {
        clearTimeout(existing);
    }
    room.reactionTimeouts[seat] = setTimeout(() => {
        room.reactionTimeouts[seat] = null;
        if (room.reactions[seat]) {
            room.reactions[seat] = null;
            broadcastGameState(room);
        }
    }, REACTION_DURATION_MS);
}

function clearReactionForSeat(room: Room, seat: PlayerId, shouldBroadcast = true) {
    const existing = room.reactionTimeouts[seat];
    if (existing) {
        clearTimeout(existing);
        room.reactionTimeouts[seat] = null;
    }
    if (room.reactions[seat]) {
        room.reactions[seat] = null;
        if (shouldBroadcast) {
            broadcastGameState(room);
        }
    }
}


// --------- Handlers ---------

async function handleJoinRoomMessage(client: ClientInfo, message: JoinRoomMessage) {
    const roomCode = message.payload.roomCode.trim().toUpperCase();
    const accessToken = message.payload.accessToken?.trim();

    if (!roomCode || !accessToken) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "roomCode et accessToken sont obligatoires." },
        };
        send(client.ws, error);
        return;
    }

    if (!supabaseAdmin || !hasSupabaseConfig) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Supabase n'est pas configuré côté serveur." },
        };
        send(client.ws, error);
        return;
    }

    let supabaseUser;
    try {
        supabaseUser = await requireSupabaseUser(accessToken);
    } catch (err: any) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: err?.message ?? "Token Supabase invalide." },
        };
        send(client.ws, error);
        return;
    }

    const usernameFallback =
        message.payload.nickname?.trim() ||
        supabaseUser.user_metadata?.username ||
        supabaseUser.email ||
        `Joueur-${supabaseUser.id.slice(0, 4)}`;

    let profile: ProfileRecord;
    try {
        profile = await fetchOrCreateProfile(supabaseUser.id, usernameFallback);
    } catch (err: any) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: err?.message ?? "Profil Supabase indisponible." },
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
            matchScores: { team0: 0, team1: 0 },
            dealNumber: 0,
            reactions: [null, null, null, null],
            reactionTimeouts: [null, null, null, null],
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
            clearReactionForSeat(oldRoom, seatIndex);
        }

        if (oldRoom.clients.size === 0) {
            rooms.delete(oldRoom.code);
        } else {
            broadcastRoomUpdate(oldRoom.code);
        }
        }
    }

    client.nickname = profile.username;
    client.avatarUrl = profile.avatar_url ?? null;
    client.userId = profile.id;
    client.profileStats = {
        wins: profile.wins ?? 0,
        games: profile.games ?? 0,
    };
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
        return send(client.ws, {
            type: "error",
            payload: { message: "Vous n'êtes pas dans une room." },
        });
    }

    const room = rooms.get(client.roomCode);
    if (!room) {
        return send(client.ws, {
            type: "error",
            payload: { message: "Room introuvable côté serveur." },
        });
    }

    if (room.clients.size !== 4) {
        return send(client.ws, {
            type: "error",
            payload: { message: "Il faut 4 joueurs pour lancer la partie." },
        });
    }

    // Empêcher de relancer une donne déjà en cours
    if (room.gameState && room.gameState.phase !== GamePhase.Finished) {
        return send(client.ws, {
            type: "error",
            payload: { message: "Une donne est déjà en cours." },
        });
    }

    // Donneur : 0 la première fois, puis rotation
    const previousDealer = room.gameState?.dealer ?? 0;
    const dealer: PlayerId =
        room.dealNumber === 0
            ? 0
            : (((previousDealer + 1) % 4) as PlayerId);

    // Nouvelle donne
    const newState = startNewGame(dealer);

    // Ajouter dealNumber au gameState SANS modifier startNewGame
    room.dealNumber += 1;
    newState["dealNumber"] = room.dealNumber;

    // Stocker la nouvelle donne
    room.gameState = newState;
    broadcastGameState(room);
}



async function handlePlayCardMessage(client: ClientInfo, message: PlayCardMessage) {
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

        if (state.phase as GamePhase === GamePhase.Finished) {
            const ms = room.matchScores;
            ms.team0 += state.scores.team0;
            ms.team1 += state.scores.team1;

            let winningTeam: 0 | 1 | null = null;
            if (state.scores.team0 !== state.scores.team1) {
                winningTeam = state.scores.team0 > state.scores.team1 ? 0 : 1;
            }
            try {
                await updatePlayerStats(room, winningTeam);
            } catch (err) {
                console.error("Impossible de mettre à jour les stats Supabase", err);
            }
        }

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

function handleAnnounceBeloteMessage(client: ClientInfo){
    if (!client.roomCode){
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Vous n'êtes pas dans une room." }
        };
        send(client.ws, error);
        return;
    }

    const room = rooms.get(client.roomCode);
    if (!room || !room.gameState) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Aucune partie en cours dans cette room." }
        };
        send(client.ws, error);
        return;
    }

    if (client.seat === undefined) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Vous n'avez pas de siège assigné." }
        };
        send(client.ws, error);
        return;
    }

    const err = announceBelote(room.gameState, client.seat);
    if (err) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: err },
        };
        send(client.ws, error);
        return;
    }

    broadcastGameState(room);
}

async function handleSyncProfileMessage(client: ClientInfo, message: SyncProfileMessage) {
    if (!client.roomCode || !client.userId) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Vous n'êtes pas dans une room." },
        };
        send(client.ws, error);
        return;
    }

    if (!supabaseAdmin || !hasSupabaseConfig) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Supabase indisponible." },
        };
        send(client.ws, error);
        return;
    }

    const token = message.payload.accessToken?.trim();
    if (!token) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Token requis pour synchroniser le profil." },
        };
        send(client.ws, error);
        return;
    }

    try {
        const supabaseUser = await requireSupabaseUser(token);
        if (supabaseUser.id !== client.userId) {
            throw new Error("Token ne correspondant pas à l'utilisateur courant.");
        }
        const profile = await fetchOrCreateProfile(
            supabaseUser.id,
            supabaseUser.user_metadata?.username || supabaseUser.email || client.nickname
        );
        client.nickname = profile.username;
        client.avatarUrl = profile.avatar_url ?? null;
        client.profileStats = {
            wins: profile.wins ?? 0,
            games: profile.games ?? 0,
        };
        broadcastRoomUpdate(client.roomCode);
    } catch (err: any) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: err?.message ?? "Impossible de synchroniser le profil." },
        };
        send(client.ws, error);
    }
}

function handlePlayerReactionMessage(client: ClientInfo, message: PlayerReactionMessage) {
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

    const emoji = message.payload?.emoji;
    if (typeof emoji !== "string" || !ALLOWED_REACTION_EMOJIS.has(emoji)) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Emoji non autorisé." },
        };
        send(client.ws, error);
        return;
    }

    room.reactions[client.seat] = {
        emoji,
        expiresAt: Date.now() + REACTION_DURATION_MS,
    };
    scheduleReactionTimeout(room, client.seat);
    broadcastGameState(room);
}

async function requireSupabaseUser(accessToken: string) {
    if (!supabaseAdmin) {
        throw new Error("Supabase non configuré.");
    }
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (error || !data?.user) {
        throw new Error("Token Supabase invalide.");
    }
    return data.user;
}

async function fetchOrCreateProfile(userId: string, usernameFallback: string): Promise<ProfileRecord> {
    if (!supabaseAdmin) {
        throw new Error("Supabase non configuré.");
    }
    const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("id, username, avatar_url, wins, games")
        .eq("id", userId)
        .maybeSingle();

    if (error && error.code !== "PGRST116") {
        throw new Error("Impossible de récupérer le profil Supabase.");
    }

    if (data) {
        return {
            id: data.id,
            username: data.username ?? usernameFallback,
            avatar_url: data.avatar_url ?? null,
            wins: data.wins ?? 0,
            games: data.games ?? 0,
        };
    }

    const profile: ProfileRecord = {
        id: userId,
        username: usernameFallback,
        avatar_url: null,
        wins: 0,
        games: 0,
    };

    const { error: insertError } = await supabaseAdmin.from("profiles").insert(profile);
    if (insertError) {
        throw new Error("Impossible de créer le profil Supabase.");
    }

    return profile;
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
            clearReactionForSeat(room, seatIndex);
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

async function updatePlayerStats(room: Room, winningTeam: 0 | 1 | null) {
    if (!supabaseAdmin || !hasSupabaseConfig) return;
    for (let seatIndex = 0; seatIndex < room.seats.length; seatIndex += 1) {
        const clientId = room.seats[seatIndex];
        if (!clientId) continue;
        const client = clients.get(clientId);
        if (!client || !client.userId) continue;
        if (!client.profileStats) {
            client.profileStats = { wins: 0, games: 0 };
        }
        client.profileStats.games += 1;
        const seatTeam: 0 | 1 = seatIndex % 2 === 0 ? 0 : 1;
        if (winningTeam !== null && seatTeam === winningTeam) {
            client.profileStats.wins += 1;
        }

        await supabaseAdmin
            .from("profiles")
            .update({
                wins: client.profileStats.wins,
                games: client.profileStats.games,
            })
            .eq("id", client.userId);
    }

    broadcastRoomUpdate(room.code);
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

        ws.on("message", async (data: Buffer) => {
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
                await handleJoinRoomMessage(client, parsed);
                break;
            case "start_game":
                handleStartGameMessage(client);
                break;
            case "play_card":
                await handlePlayCardMessage(client, parsed);
                break;
            case "choose_trump":
                handleChooseTrumpMessage(client, parsed);
                break;
            case "announce_belote":
                handleAnnounceBeloteMessage(client);
                break;
            case "player_reaction":
                handlePlayerReactionMessage(client, parsed);
                break;
            case "sync_profile":
                await handleSyncProfileMessage(client, parsed);
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
