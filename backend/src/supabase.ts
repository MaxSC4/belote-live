import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SUPABASE_AVATAR_BUCKET = process.env.SUPABASE_AVATAR_BUCKET ?? "avatars";

export const AVATAR_BUCKET = SUPABASE_AVATAR_BUCKET;

export const hasSupabaseConfig = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY);

export const supabaseAdmin = hasSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

export async function requireSupabaseUser(accessToken: string) {
  if (!supabaseAdmin) {
    throw new Error("Supabase non configuré.");
  }
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user) {
    throw new Error("Token Supabase invalide.");
  }
  return data.user;
}

export interface ProfileRecord {
  id: string;
  username: string;
  avatar_url: string | null;
  wins: number;
  games: number;
}

export async function fetchOrCreateProfile(userId: string, usernameFallback: string): Promise<ProfileRecord> {
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

  const { error: insertError } = await supabaseAdmin
    .from("profiles")
    .insert(profile);

  if (insertError) {
    throw new Error("Impossible de créer le profil Supabase.");
  }

  return profile;
}
