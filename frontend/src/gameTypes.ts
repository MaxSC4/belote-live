export type Suit = "♣" | "♦" | "♥" | "♠";
export type Rank = "7" | "8" | "9" | "J" | "Q" | "K" | "10" | "A";

export interface Card {
    suit: Suit;
    rank: Rank;
}

export type GamePhaseWS =
    | "WaitingForPlayers"
    | "ChoosingTrumpFirstRound"
    | "ChoosingTrumpSecondRound"
    | "PlayingTricks"
    | "Finished";

export interface TrickCardWS {
    player: number; // 0..3
    card: Card;
}

export interface TrickWS {
    cards: TrickCardWS[];
    leader: number;
    winner?: number;
}

export interface GameStateWS {
    phase: GamePhaseWS;
    dealer: number;
    currentPlayer: number;

    matchScores: {
        team0: number,
        team1: number
    }

    dealNumber: number;

    trumpSuit: Suit | null;
    proposedTrump: Suit | null;
    turnedCard: Card | null;
    trumpChooser: number | null;
    biddingPlayer: number | null;
    passesInCurrentRound: number;

    hands: Record<string, Card[]>;
    trick: TrickWS | null;
    scores: {
        team0: number;
        team1: number;
    };

    belote: {
        holder: number | null;
        stage: 0 | 1 | 2;
        points: number;
        team: "team0" | "team1" | null;
    };
}

// Pour l'endpoint /debug/deal
export interface DealResponse {
    hands: Record<string, Card[]>;
}
