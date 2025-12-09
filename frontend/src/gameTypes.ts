export type Suit = "♣" | "♦" | "♥" | "♠";
export type Rank = "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

export interface Card {
    suit: Suit;
    rank: Rank;
}

export interface DealResponse {
    hands: Record<string, Card[]>;
    dealer: number;
    trumpSuit?: Suit | null;
}

// Pour l'état de partie reçu via WebSocket
export type GamePhase =
    | "WaitingForPlayers"
    | "ChoosingTrump"
    | "PlayingTricks"
    | "Finished";

export interface GameStateWS {
    phase: GamePhase;
    dealer: number;
    currentPlayer: number;
    trumpSuit?: Suit;
    hands: Record<string, Card[]>;
    // On peut ignorer trick/scores côté front pour l'instant
}
