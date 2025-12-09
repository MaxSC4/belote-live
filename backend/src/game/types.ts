// Couleurs de la belote (32 cartes)
export enum Suit {
    Clubs = "♣",
    Diamonds = "♦",
    Hearts = "♥",
    Spades = "♠",
}

// Valeurs de la belote : 7 8 9 10 V D R A
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

// Une carte unique
export interface Card {
    suit: Suit;
    rank: Rank;
}

// Identifiant logique d'un joueur (0..3)
export type PlayerId = 0 | 1 | 2 | 3;

// Une main (8 cartes par joueur)
export type Hand = Card[];

// Etat minimum d'une donne (on enrichira ensuite)
export interface DealState {
    hands: Record<PlayerId, Hand>;
    trumpSuit?: Suit; // plus tard
    dealer: PlayerId;
}
