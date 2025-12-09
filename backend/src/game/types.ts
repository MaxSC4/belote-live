export enum Suit {
    Clubs = "♣",
    Diamonds = "♦",
    Hearts = "♥",
    Spades = "♠",
}

export enum Rank {
    Seven = "7",
    Eight = "8",
    Nine = "9",
    Ten = "10",
    Jack = "J",
    Queen = "Q",
    King = "K",
    Ace = "A",
}

export interface Card {
    suit: Suit;
    rank: Rank;
}

export type PlayerId = 0 | 1 | 2 | 3;

export type Hand = Card[];

export interface DealState {
    hands: Record<PlayerId, Hand>;
    trumpSuit?: Suit;
    dealer: PlayerId;
}
