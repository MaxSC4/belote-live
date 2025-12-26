export interface PlayerStatsPayload {
  wins: number;
  games: number;
  winrate: number;
}

export interface RoomPlayer {
  id: string;
  nickname: string;
  seat: number | null;
  userId?: string | null;
  avatarUrl?: string | null;
  connected?: boolean;
  stats?: PlayerStatsPayload;
}

export interface UserProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  wins: number;
  games: number;
  isGuest?: boolean;
}
