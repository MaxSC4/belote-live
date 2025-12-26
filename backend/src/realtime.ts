import { randomUUID, createHmac } from "crypto";
import { WebSocket, WebSocketServer } from "ws";
import { Server } from "http";

import {
    ChooseTrumpPayload,
    GamePhase,
    GameState,
    announceBelote,
    chooseTrump,
    playCard,
    startNewGame,
    validatePlay,
} from "./game/gameState";
import { Card, PlayerId } from "./game/types";
import { hasSupabaseConfig, supabaseAdmin } from "./supabase";

type ClientId = string;
type SessionId = string;

interface ClientInfo {
    id: ClientId;
    ws: WebSocket;
    nickname: string;
    sessionId?: SessionId;
    roomCode?: string;
    seat?: PlayerId; // 0..3
    userId?: string;
    avatarUrl?: string | null;
    profileStats?: {
        wins: number;
        games: number;
    };
    isGuest?: boolean;
    lastPongAt: number;
}

interface PlayerSession {
    sessionId: SessionId;
    sessionToken: string;
    roomCode: string;
    seat: PlayerId;
    identityKey: string;
    nickname: string;
    userId?: string;
    avatarUrl?: string | null;
    profileStats?: {
        wins: number;
        games: number;
    };
    isGuest: boolean;
    createdAt: number;
    lastSeenAt: number;
    status: "connected" | "disconnected";
    socketId?: ClientId;
    graceTimeout?: NodeJS.Timeout | null;
    tokenExpiresAt: number;
}

interface Room {
    code: string;
    sessionIds: Set<SessionId>;
    createdAt: number;
    seats: (SessionId | null)[];
    gameState?: GameState;
    matchScores: {
        team0: number;
        team1: number;
    };
    dealNumber: number;
    reactions: (PlayerReactionState | null)[];
    reactionTimeouts: (NodeJS.Timeout | null)[];
    emptyTimeout?: NodeJS.Timeout | null;
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

interface SessionTokenPayload {
    sessionId: SessionId;
    roomCode: string;
    userId?: string;
    identityKey: string;
    isGuest: boolean;
    issuedAt: number;
    expiresAt: number;
}

const REACTION_DURATION_MS = 5000;
const GRACE_PERIOD_MS = getEnvNumber("GRACE_PERIOD_MS", 120_000);
const HEARTBEAT_INTERVAL_MS = getEnvNumber("HEARTBEAT_INTERVAL_MS", 15_000);
const HEARTBEAT_TIMEOUT_MS = getEnvNumber("HEARTBEAT_TIMEOUT_MS", 30_000);
const EMPTY_ROOM_TTL_MS = getEnvNumber("EMPTY_ROOM_TTL_MS", 30_000);
const SESSION_TOKEN_TTL_MS = getEnvNumber("SESSION_TOKEN_TTL_MS", 24 * 60 * 60 * 1000);
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-session-secret";

const ALLOWED_REACTION_EMOJIS = new Set(["😡", "😄", "😢", "🤔", "😎", "🎉"]);

const clients = new Map<ClientId, ClientInfo>();
const sessions = new Map<SessionId, PlayerSession>();
const rooms = new Map<string, Room>();

function generateClientId(): ClientId {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function generateSessionId(): SessionId {
    return randomUUID();
}

// --------- Messages ---------

interface BaseMessage {
    type: string;
}

interface JoinTableMessage extends BaseMessage {
    type: "join_table" | "join_room";
    payload: {
        roomCode: string;
        nickname?: string;
        accessToken?: string;
        guest?: {
            id: string;
            username: string;
            avatarUrl?: string | null;
        };
    };
}

interface RejoinTableMessage extends BaseMessage {
    type: "rejoin_table";
    payload: {
        sessionToken: string;
        roomCode?: string;
    };
}

interface SyncStateMessage extends BaseMessage {
    type: "sync_state";
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
            id: SessionId;
            nickname: string;
            seat: PlayerId | null;
            userId?: string | null;
            avatarUrl?: string | null;
            stats?: {
                wins: number;
                games: number;
                winrate: number;
            };
            connected: boolean;
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
    payload: ChooseTrumpPayload;
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

interface SessionEstablishedMessage extends BaseMessage {
    type: "session_established";
    payload: {
        sessionId: SessionId;
        sessionToken: string;
        roomCode: string;
        seat: PlayerId;
        nickname: string;
        isGuest: boolean;
        expiresAt: number;
        rejoined?: boolean;
    };
}

interface SessionKickedMessage extends BaseMessage {
    type: "session_kicked";
    payload: {
        reason: string;
    };
}

interface TableClosedMessage extends BaseMessage {
    type: "table_closed";
    payload: {
        roomCode: string;
        reason: string;
    };
}

interface SyncProfileMessage extends BaseMessage {
    type: "sync_profile";
    payload: {
        accessToken: string;
    };
}

type IncomingMessage =
    | JoinTableMessage
    | RejoinTableMessage
    | StartGameMessage
    | PlayCardMessage
    | ChooseTrumpMessage
    | AnnounceBeloteMessage
    | PlayerReactionMessage
    | SyncProfileMessage
    | SyncStateMessage;

// --------- Utils envoi ---------

function send(ws: WebSocket, message: BaseMessage | any) {
    ws.send(JSON.stringify(message));
}

function sendToSession(session: PlayerSession, message: BaseMessage | any) {
    if (!session.socketId) return;
    const client = clients.get(session.socketId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;
    send(client.ws, message);
}

function buildRoomUpdate(room: Room): RoomUpdateMessage {
    const players = Array.from(room.sessionIds)
        .map((sessionId) => sessions.get(sessionId))
        .filter((s): s is PlayerSession => Boolean(s))
        .map((s) => ({
            id: s.sessionId,
            nickname: s.nickname,
            seat: s.seat ?? null,
            userId: s.userId ?? null,
            avatarUrl: s.avatarUrl ?? null,
            connected: s.status === "connected",
            stats: s.profileStats
                ? {
                      wins: s.profileStats.wins,
                      games: s.profileStats.games,
                      winrate:
                          s.profileStats.games > 0
                              ? s.profileStats.wins / s.profileStats.games
                              : 0,
                  }
                : undefined,
        }));

    const payload: RoomUpdateMessage = {
        type: "room_update",
        payload: {
            roomCode: room.code,
            players,
        },
    };

    return payload;
}

function broadcastRoomUpdate(roomCode: string) {
    const room = rooms.get(roomCode);
    if (!room) return;

    const payload = buildRoomUpdate(room);

    for (const sessionId of room.sessionIds) {
        const session = sessions.get(sessionId);
        if (!session) continue;
        sendToSession(session, payload);
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

    for (const sessionId of room.sessionIds) {
        const session = sessions.get(sessionId);
        if (!session) continue;
        sendToSession(session, message);
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

function getEnvNumber(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function signSessionToken(payload: Omit<SessionTokenPayload, "issuedAt" | "expiresAt">): {
    token: string;
    expiresAt: number;
} {
    const issuedAt = Date.now();
    const expiresAt = issuedAt + SESSION_TOKEN_TTL_MS;
    const fullPayload: SessionTokenPayload = {
        ...payload,
        issuedAt,
        expiresAt,
    };
    const encoded = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
    const signature = createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
    return {
        token: `${encoded}.${signature}`,
        expiresAt,
    };
}

function verifySessionToken(token: string): SessionTokenPayload | null {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) return null;
    const expected = createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
    if (expected !== signature) return null;
    try {
        const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionTokenPayload;
        if (payload.expiresAt && payload.expiresAt < Date.now()) {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
}

function getRoom(roomCode: string): Room {
    let room = rooms.get(roomCode);
    if (!room) {
        room = {
            code: roomCode,
            sessionIds: new Set(),
            createdAt: Date.now(),
            seats: [null, null, null, null],
            matchScores: { team0: 0, team1: 0 },
            dealNumber: 0,
            reactions: [null, null, null, null],
            reactionTimeouts: [null, null, null, null],
            emptyTimeout: null,
        };
        rooms.set(roomCode, room);
        console.info(`[room] created ${roomCode}`);
    }
    return room;
}

function connectedSessionsInRoom(room: Room): PlayerSession[] {
    return Array.from(room.sessionIds)
        .map((sid) => sessions.get(sid))
        .filter((s): s is PlayerSession => Boolean(s && s.status === "connected"));
}

function activeSessionsInRoom(room: Room): PlayerSession[] {
    return Array.from(room.sessionIds)
        .map((sid) => sessions.get(sid))
        .filter((s): s is PlayerSession => Boolean(s));
}

function scheduleRoomCleanup(room: Room) {
    if (room.emptyTimeout) {
        clearTimeout(room.emptyTimeout);
        room.emptyTimeout = null;
    }
    const hasConnected = connectedSessionsInRoom(room).length > 0;
    const hasReserved = activeSessionsInRoom(room).length > 0;

    if (!hasConnected && !hasReserved) {
        room.emptyTimeout = setTimeout(() => closeRoom(room.code, "empty_room"), EMPTY_ROOM_TTL_MS);
    } else if (!hasConnected && hasReserved) {
        // Give grace + TTL before cleaning sessions that did not reappear
        room.emptyTimeout = setTimeout(() => {
            const refreshedRoom = rooms.get(room.code);
            if (!refreshedRoom) return;
            const stillConnected = connectedSessionsInRoom(refreshedRoom).length > 0;
            const stillReserved = activeSessionsInRoom(refreshedRoom).length > 0;
            if (!stillConnected && !stillReserved) {
                closeRoom(room.code, "empty_after_grace");
            }
        }, GRACE_PERIOD_MS + EMPTY_ROOM_TTL_MS);
    }
}

function closeRoom(roomCode: string, reason: string) {
    const room = rooms.get(roomCode);
    if (!room) return;
    room.reactionTimeouts.forEach((timeout) => timeout && clearTimeout(timeout));
    if (room.emptyTimeout) {
        clearTimeout(room.emptyTimeout);
    }
    for (const sessionId of room.sessionIds) {
        const session = sessions.get(sessionId);
        if (!session) continue;
        if (session.graceTimeout) {
            clearTimeout(session.graceTimeout);
        }
        sendToSession(session, { type: "table_closed", payload: { roomCode, reason } } as TableClosedMessage);
        if (session.socketId) {
            const client = clients.get(session.socketId);
            if (client?.ws.readyState === WebSocket.OPEN) {
                client.ws.close(1000, "table_closed");
            }
        }
        sessions.delete(sessionId);
    }
    rooms.delete(roomCode);
    console.info(`[room] closed ${roomCode} (${reason})`);
}

function attachSessionToClient(session: PlayerSession, client: ClientInfo) {
    session.socketId = client.id;
    session.status = "connected";
    session.lastSeenAt = Date.now();
    if (session.graceTimeout) {
        clearTimeout(session.graceTimeout);
        session.graceTimeout = null;
    }
    client.sessionId = session.sessionId;
    client.roomCode = session.roomCode;
    client.seat = session.seat;
    client.nickname = session.nickname;
    client.avatarUrl = session.avatarUrl ?? null;
    client.userId = session.userId;
    client.profileStats = session.profileStats;
    client.isGuest = session.isGuest;
}

function expireSession(sessionId: SessionId, reason: string) {
    const session = sessions.get(sessionId);
    if (!session) return;
    if (session.graceTimeout) {
        clearTimeout(session.graceTimeout);
    }
    const room = rooms.get(session.roomCode);
    sessions.delete(sessionId);
    if (room) {
        if (session.seat !== undefined && room.seats[session.seat] === sessionId) {
            room.seats[session.seat] = null;
            clearReactionForSeat(room, session.seat);
        }
        room.sessionIds.delete(sessionId);
        broadcastRoomUpdate(room.code);
        scheduleRoomCleanup(room);
    }
    console.info(`[session] expired ${sessionId} (${reason})`);
}

function markSessionDisconnected(session: PlayerSession) {
    session.status = "disconnected";
    session.lastSeenAt = Date.now();
    session.socketId = undefined;
    if (session.graceTimeout) {
        clearTimeout(session.graceTimeout);
    }
    session.graceTimeout = setTimeout(() => expireSession(session.sessionId, "grace_timeout"), GRACE_PERIOD_MS);
    const room = rooms.get(session.roomCode);
    if (room) {
        broadcastRoomUpdate(room.code);
        scheduleRoomCleanup(room);
    }
}

async function resolveIdentity(
    clientId: ClientId,
    payload: { nickname?: string; accessToken?: string; guest?: { id: string; username: string; avatarUrl?: string | null } }
): Promise<{
    nickname: string;
    avatarUrl: string | null;
    stats?: { wins: number; games: number };
    userId?: string;
    isGuest: boolean;
    identityKey: string;
}> {
    const resolvedNickname = payload.nickname?.trim();
    const accessToken = payload.accessToken?.trim();
    const guestPayload = payload.guest;

    if (!accessToken && !guestPayload) {
        throw new Error("Fournissez un token Supabase ou le mode invité.");
    }

    if (accessToken) {
        if (!supabaseAdmin || !hasSupabaseConfig) {
            throw new Error("Supabase n'est pas configuré côté serveur.");
        }

        const supabaseUser = await requireSupabaseUser(accessToken);
        const usernameFallback =
            resolvedNickname ||
            supabaseUser.user_metadata?.username ||
            supabaseUser.email ||
            `Joueur-${supabaseUser.id.slice(0, 4)}`;

        const profile = await fetchOrCreateProfile(supabaseUser.id, usernameFallback);
        return {
            nickname: profile.username,
            avatarUrl: profile.avatar_url ?? null,
            stats: { wins: profile.wins ?? 0, games: profile.games ?? 0 },
            userId: profile.id,
            isGuest: false,
            identityKey: profile.id,
        };
    }

    const guestNickname = guestPayload?.username?.trim() || `Invité-${clientId.slice(-4)}`;
    const guestId = guestPayload?.id?.trim() || `guest-${clientId}`;
    return {
        nickname: guestNickname,
        avatarUrl: guestPayload?.avatarUrl ?? null,
        isGuest: true,
        identityKey: guestId,
        userId: guestId,
    };
}

// --------- Handlers ---------

async function handleJoinTableMessage(client: ClientInfo, message: JoinTableMessage) {
    const roomCode = message.payload.roomCode.trim().toUpperCase();
    if (!roomCode) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "roomCode est obligatoire." },
        };
        send(client.ws, error);
        return;
    }

    let identity;
    try {
        identity = await resolveIdentity(client.id, message.payload);
    } catch (err: any) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: err?.message ?? "Impossible de récupérer l'identité du joueur." },
        };
        send(client.ws, error);
        return;
    }

    const room = getRoom(roomCode);

    const existingSession = Array.from(room.sessionIds)
        .map((sid) => sessions.get(sid))
        .find((s) => s && s.identityKey === identity.identityKey);

    if (existingSession) {
        if (existingSession.socketId && existingSession.socketId !== client.id) {
            const previousClient = clients.get(existingSession.socketId);
            if (previousClient && previousClient.ws.readyState === WebSocket.OPEN) {
                const kicked: SessionKickedMessage = {
                    type: "session_kicked",
                    payload: { reason: "Nouvelle connexion détectée pour cette session." },
                };
                send(previousClient.ws, kicked);
                previousClient.ws.close(4001, "Session reprise ailleurs");
            }
        }

        const { token, expiresAt } = signSessionToken({
            sessionId: existingSession.sessionId,
            roomCode,
            userId: existingSession.userId,
            identityKey: existingSession.identityKey,
            isGuest: existingSession.isGuest,
        });
        existingSession.sessionToken = token;
        existingSession.tokenExpiresAt = expiresAt;
        existingSession.nickname = identity.nickname || existingSession.nickname;
        existingSession.avatarUrl = identity.avatarUrl ?? existingSession.avatarUrl;
        existingSession.profileStats = identity.stats ?? existingSession.profileStats;

        attachSessionToClient(existingSession, client);

        const sessionAck: SessionEstablishedMessage = {
            type: "session_established",
            payload: {
                sessionId: existingSession.sessionId,
                sessionToken: token,
                roomCode,
                seat: existingSession.seat,
                nickname: existingSession.nickname,
                isGuest: existingSession.isGuest,
                expiresAt,
                rejoined: true,
            },
        };
        send(client.ws, sessionAck);
        broadcastRoomUpdate(roomCode);
        sendRoomSnapshotToClient(client, room);
        return;
    }

    const availableSeat = room.seats.findIndex((s) => s === null);
    if (availableSeat === -1) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Cette table est déjà pleine (4 joueurs)." },
        };
        send(client.ws, error);
        return;
    }

    const sessionId = generateSessionId();
    const { token, expiresAt } = signSessionToken({
        sessionId,
        roomCode,
        userId: identity.userId,
        identityKey: identity.identityKey,
        isGuest: identity.isGuest,
    });

    const session: PlayerSession = {
        sessionId,
        sessionToken: token,
        roomCode,
        seat: availableSeat as PlayerId,
        identityKey: identity.identityKey,
        nickname: identity.nickname || `Joueur-${client.id.slice(-4)}`,
        avatarUrl: identity.avatarUrl ?? null,
        profileStats: identity.stats,
        userId: identity.userId,
        isGuest: identity.isGuest,
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
        status: "connected",
        socketId: client.id,
        tokenExpiresAt: expiresAt,
        graceTimeout: null,
    };

    room.sessionIds.add(sessionId);
    room.seats[availableSeat] = sessionId;
    sessions.set(sessionId, session);

    attachSessionToClient(session, client);

    const sessionAck: SessionEstablishedMessage = {
        type: "session_established",
        payload: {
            sessionId,
            sessionToken: token,
            roomCode,
            seat: session.seat,
            nickname: session.nickname,
            isGuest: session.isGuest,
            expiresAt,
            rejoined: false,
        },
    };
    send(client.ws, sessionAck);

    broadcastRoomUpdate(roomCode);
    sendRoomSnapshotToClient(client, room);
}

async function handleRejoinTableMessage(client: ClientInfo, message: RejoinTableMessage) {
    const token = message.payload.sessionToken?.trim();
    if (!token) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "sessionToken manquant pour la reconnexion." },
        };
        send(client.ws, error);
        return;
    }

    const tokenPayload = verifySessionToken(token);
    if (!tokenPayload) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "sessionToken invalide ou expiré." },
        };
        send(client.ws, error);
        return;
    }

    const session = sessions.get(tokenPayload.sessionId);
    if (!session || session.sessionToken !== token) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Session introuvable côté serveur." },
        };
        send(client.ws, error);
        return;
    }

    if (message.payload.roomCode && message.payload.roomCode !== session.roomCode) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Cette session appartient à une autre table." },
        };
        send(client.ws, error);
        return;
    }

    const room = rooms.get(session.roomCode);
    if (!room || room.seats[session.seat] !== session.sessionId) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Table ou siège introuvable pour cette session." },
        };
        send(client.ws, error);
        return;
    }

    if (session.socketId && session.socketId !== client.id) {
        const previousClient = clients.get(session.socketId);
        if (previousClient && previousClient.ws.readyState === WebSocket.OPEN) {
            const kicked: SessionKickedMessage = {
                type: "session_kicked",
                payload: { reason: "Nouvelle connexion détectée pour cette session." },
            };
            send(previousClient.ws, kicked);
            previousClient.ws.close(4001, "Session reprise ailleurs");
        }
    }

    attachSessionToClient(session, client);

    const ack: SessionEstablishedMessage = {
        type: "session_established",
        payload: {
            sessionId: session.sessionId,
            sessionToken: session.sessionToken,
            roomCode: session.roomCode,
            seat: session.seat,
            nickname: session.nickname,
            isGuest: session.isGuest,
            expiresAt: session.tokenExpiresAt,
            rejoined: true,
        },
    };
    send(client.ws, ack);
    broadcastRoomUpdate(session.roomCode);
    sendRoomSnapshotToClient(client, room);
}

function sendRoomSnapshotToClient(client: ClientInfo, room: Room) {
    const session = ensureActiveSession(client);
    if (!session) return;
    const roomUpdate = buildRoomUpdate(room);
    sendToSession(session, roomUpdate);

    if (room.gameState) {
        const gameStateMessage: GameStateMessage = {
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
        sendToSession(session, gameStateMessage);
    }
}

function ensureActiveSession(client: ClientInfo): PlayerSession | null {
    if (!client.sessionId) return null;
    const session = sessions.get(client.sessionId);
    if (!session) return null;
    if (session.roomCode !== client.roomCode) return null;
    return session;
}

function handleStartGameMessage(client: ClientInfo) {
    const session = ensureActiveSession(client);
    if (!session) {
        return send(client.ws, {
            type: "error",
            payload: { message: "Session introuvable pour lancer la partie." },
        });
    }

    const room = rooms.get(session.roomCode);
    if (!room) {
        return send(client.ws, {
            type: "error",
            payload: { message: "Room introuvable côté serveur." },
        });
    }

    if (connectedSessionsInRoom(room).length !== 4) {
        return send(client.ws, {
            type: "error",
            payload: { message: "Il faut 4 joueurs connectés pour lancer la partie." },
        });
    }

    if (room.gameState && room.gameState.phase !== GamePhase.Finished) {
        return send(client.ws, {
            type: "error",
            payload: { message: "Une donne est déjà en cours." },
        });
    }

    const previousDealer = room.gameState?.dealer ?? 0;
    const dealer: PlayerId =
        room.dealNumber === 0 ? 0 : (((previousDealer + 1) % 4) as PlayerId);

    const newState = startNewGame(dealer);
    room.dealNumber += 1;
    (newState as any)["dealNumber"] = room.dealNumber;
    room.gameState = newState;
    broadcastGameState(room);
}

async function handlePlayCardMessage(client: ClientInfo, message: PlayCardMessage) {
    const session = ensureActiveSession(client);
    if (!session) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Session introuvable pour jouer une carte." },
        };
        send(client.ws, error);
        return;
    }

    const room = rooms.get(session.roomCode);
    if (!room || !room.gameState) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Aucune partie en cours dans cette room." },
        };
        send(client.ws, error);
        return;
    }

    const seat = session.seat;
    if (seat === undefined || room.seats[seat] !== session.sessionId) {
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

    if (state.currentPlayer !== seat) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Ce n'est pas votre tour." },
        };
        send(client.ws, error);
        return;
    }

    const validationError = validatePlay(state, seat, message.payload.card);
    if (validationError) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: validationError },
        };
        send(client.ws, error);
        return;
    }

    try {
        playCard(state, seat, message.payload.card);

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
    const session = ensureActiveSession(client);
    if (!session) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Session introuvable." },
        };
        send(client.ws, error);
        return;
    }

    const room = rooms.get(session.roomCode);
    if (!room || !room.gameState) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Aucune partie en cours dans cette room." },
        };
        send(client.ws, error);
        return;
    }

    if (session.seat === undefined || room.seats[session.seat] !== session.sessionId) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Vous n'avez pas de siège assigné." },
        };
        send(client.ws, error);
        return;
    }

    room.gameState = chooseTrump(room.gameState, session.seat, message.payload);
    broadcastGameState(room);
}

function handleAnnounceBeloteMessage(client: ClientInfo) {
    const session = ensureActiveSession(client);
    if (!session) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Session introuvable." },
        };
        send(client.ws, error);
        return;
    }

    const room = rooms.get(session.roomCode);
    if (!room || !room.gameState) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Aucune partie en cours dans cette room." },
        };
        send(client.ws, error);
        return;
    }

    if (session.seat === undefined || room.seats[session.seat] !== session.sessionId) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Vous n'avez pas de siège assigné." },
        };
        send(client.ws, error);
        return;
    }

    const err = announceBelote(room.gameState, session.seat);
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
    const session = ensureActiveSession(client);
    if (!session) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Session introuvable pour synchroniser le profil." },
        };
        send(client.ws, error);
        return;
    }

    if (!session.userId) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Fonction réservée aux comptes authentifiés." },
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
        if (supabaseUser.id !== session.userId) {
            throw new Error("Token ne correspondant pas à l'utilisateur courant.");
        }
        const profile = await fetchOrCreateProfile(
            supabaseUser.id,
            supabaseUser.user_metadata?.username || supabaseUser.email || session.nickname
        );
        session.nickname = profile.username;
        session.avatarUrl = profile.avatar_url ?? null;
        session.profileStats = {
            wins: profile.wins ?? 0,
            games: profile.games ?? 0,
        };
        broadcastRoomUpdate(session.roomCode);
    } catch (err: any) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: err?.message ?? "Impossible de synchroniser le profil." },
        };
        send(client.ws, error);
    }
}

function handlePlayerReactionMessage(client: ClientInfo, message: PlayerReactionMessage) {
    const session = ensureActiveSession(client);
    if (!session) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Session introuvable." },
        };
        send(client.ws, error);
        return;
    }

    const room = rooms.get(session.roomCode);
    if (!room || !room.gameState) {
        const error: ErrorMessage = {
            type: "error",
            payload: { message: "Aucune partie en cours dans cette room." },
        };
        send(client.ws, error);
        return;
    }

    if (session.seat === undefined || room.seats[session.seat] !== session.sessionId) {
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

    room.reactions[session.seat] = {
        emoji,
        expiresAt: Date.now() + REACTION_DURATION_MS,
    };
    scheduleReactionTimeout(room, session.seat);
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

    if (client.sessionId) {
        const session = sessions.get(client.sessionId);
        if (session) {
            markSessionDisconnected(session);
        }
    }

    clients.delete(clientId);
}

async function updatePlayerStats(room: Room, winningTeam: 0 | 1 | null) {
    if (!supabaseAdmin || !hasSupabaseConfig) return;
    for (let seatIndex = 0; seatIndex < room.seats.length; seatIndex += 1) {
        const sessionId = room.seats[seatIndex];
        if (!sessionId) continue;
        const session = sessions.get(sessionId);
        if (!session || !session.userId) continue;
        if (!session.profileStats) {
            session.profileStats = { wins: 0, games: 0 };
        }
        session.profileStats.games += 1;
        const seatTeam: 0 | 1 = seatIndex % 2 === 0 ? 0 : 1;
        if (winningTeam !== null && seatTeam === winningTeam) {
            session.profileStats.wins += 1;
        }

        await supabaseAdmin
            .from("profiles")
            .update({
                wins: session.profileStats.wins,
                games: session.profileStats.games,
            })
            .eq("id", session.userId);
    }

    broadcastRoomUpdate(room.code);
}

// --------- Setup WebSocket ---------

export function setupWebSocketServer(httpServer: Server) {
    const wss = new WebSocketServer({
        server: httpServer,
        path: "/ws",
    });

    const heartbeatInterval = setInterval(() => {
        const now = Date.now();
        for (const [clientId, client] of clients) {
            if (client.ws.readyState !== WebSocket.OPEN) continue;
            if (now - client.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
                console.warn(`[ws] terminating stale socket ${clientId}`);
                handleClientDisconnect(clientId);
                client.ws.terminate();
                continue;
            }
            try {
                client.ws.ping();
            } catch (err) {
                console.warn(`[ws] ping failed for ${clientId}`, err);
            }
        }
    }, HEARTBEAT_INTERVAL_MS);

    wss.on("connection", (ws: WebSocket) => {
        const clientId = generateClientId();
        const client: ClientInfo = {
            id: clientId,
            ws,
            nickname: `Joueur-${clientId.slice(-4)}`,
            lastPongAt: Date.now(),
        };

        clients.set(clientId, client);

        ws.on("pong", () => {
            client.lastPongAt = Date.now();
        });

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
                case "join_table":
                    await handleJoinTableMessage(client, parsed);
                    break;
                case "rejoin_table":
                    await handleRejoinTableMessage(client, parsed);
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
                case "sync_state": {
                    const session = ensureActiveSession(client);
                    if (session) {
                        const room = rooms.get(session.roomCode);
                        if (room) {
                            sendRoomSnapshotToClient(client, room);
                        }
                    }
                    break;
                }
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

    wss.on("close", () => {
        clearInterval(heartbeatInterval);
    });

    console.log("WebSocket server initialized on path /ws");
}
