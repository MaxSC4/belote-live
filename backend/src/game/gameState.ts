import { Card, DealState, Hand, PlayerId, Suit } from "./types";
import { dealCards } from "./beloteEngine";

export enum GamePhase {
    WaitingForPlayers = "WaitingForPlayers",
    ChoosingTrump = "ChoosingTrump",
    PlayingTricks = "PlayingTricks",
    Finished = "Finished",
}

export interface TrickCard {
    player: PlayerId;
    card: Card;
}

export interface Trick {
    cards: TrickCard[];
    leader: PlayerId;
    winner?: PlayerId;
}

export interface GameState {
    phase: GamePhase;
    dealer: PlayerId;
    currentPlayer: PlayerId;
    trumpSuit?: Suit;
    hands: Record<PlayerId, Hand>;
    trick: Trick | null;
    scores: {
        team0: number; // joueurs 0 & 2
        team1: number; // joueurs 1 & 3
    };
}

/**
 * Crée un nouvel état de partie (une donne) :
 * - distribue les cartes
 * - met la phase sur "ChoosingTrump" (la phase atout sera gérée plus tard)
 * - définit le joueur suivant le donneur comme premier à parler
 */
export function startNewGame(dealer: PlayerId): GameState {
    const deal: DealState = dealCards(dealer);
    const firstPlayer: PlayerId = ((dealer + 1) % 4) as PlayerId;

    return {
        phase: GamePhase.ChoosingTrump,
        dealer: deal.dealer,
        currentPlayer: firstPlayer,
        trumpSuit: deal.trumpSuit,
        hands: deal.hands,
        trick: null,
        scores: {
        team0: 0,
        team1: 0,
        },
    };
}
