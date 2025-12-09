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
