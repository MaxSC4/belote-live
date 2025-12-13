import { useState } from "react";
import { config } from "../../config";
import { supabase } from "../../lib/supabaseClient";
import { CARD_OVERLAY_SVG } from "../../constants/ui";

export interface AuthScreenProps {
  mode: "signin" | "signup";
  onToggleMode: (mode: "signin" | "signup") => void;
  error: string | null;
  onError: (value: string | null) => void;
  onContinueAsGuest: () => void;
}

export default function AuthScreen(props: AuthScreenProps) {
  const { mode, onToggleMode, error, onError, onContinueAsGuest } = props;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const uploadAvatarForSignup = async (file: File, accessToken: string) => {
    try {
      const fileExt = (file.name.split(".").pop() || "png").toLowerCase();
      const response = await fetch(`${config.backendUrl}/avatar/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, fileExt }),
      });
      const payload = await response
        .json()
        .catch(() => ({ error: "Réponse invalide du serveur." }));
      if (!response.ok || !payload?.uploadUrl || !payload?.publicUrl) {
        throw new Error(payload?.error ?? "Impossible de préparer l'upload.");
      }
      const uploadResponse = await fetch(payload.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error("Le téléversement a échoué.");
      }
      return payload.publicUrl as string;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Impossible d'uploader l'avatar.";
      onError(message);
      return null;
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setLoading(true);
    onError(null);
    setInfo(null);

    if (mode === "signin") {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        onError(signInError.message);
      }
    } else {
      try {
        const checkResponse = await fetch(
          `${config.backendUrl}/auth/check-email?email=${encodeURIComponent(email)}`
        );
        if (checkResponse.ok) {
          const payload: { exists?: boolean } = await checkResponse.json();
          if (payload.exists) {
            onError("Cette adresse email est déjà utilisée.");
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn("Email check failed", err);
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username },
        },
      });
      if (signUpError) {
        onError(signUpError.message);
      } else {
        if (data.user) {
          let finalAvatarUrl: string | null = null;
          if (data.session?.access_token && avatarFile) {
            const uploaded = await uploadAvatarForSignup(
              avatarFile,
              data.session.access_token
            );
            if (uploaded) {
              finalAvatarUrl = uploaded;
            }
          }
          await supabase.from("profiles").upsert({
            id: data.user.id,
            username: username || email,
            avatar_url: finalAvatarUrl,
            wins: 0,
            games: 0,
          });
        }
        setInfo("Vérifiez vos emails pour confirmer votre compte.");
      }
    }

    setLoading(false);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-[#041826] to-slate-950 px-6 py-12 font-sans text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.15),_transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(56,189,248,0.12),_transparent_60%)]" />
      <div
        className="pointer-events-none absolute left-8 top-16 hidden rotate-[-12deg] opacity-50 lg:block"
        style={{ filter: "drop-shadow(0 25px 35px rgba(6,182,212,0.25))" }}
      >
        <img src={CARD_OVERLAY_SVG} alt="" className="h-48 w-auto" />
      </div>
      <div
        className="pointer-events-none absolute bottom-10 right-10 hidden rotate-[8deg] opacity-60 lg:block"
        style={{ filter: "drop-shadow(0 30px 40px rgba(16,185,129,0.25))" }}
      >
        <img src={CARD_OVERLAY_SVG} alt="" className="h-44 w-auto" />
      </div>
      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] items-center justify-center">
        <div className="grid w-full max-w-6xl gap-8 lg:grid-cols-[1.05fr_0.85fr]">
          <div className="rounded-[2.5rem] border border-slate-800/70 bg-slate-950/85 p-10 shadow-[0_35px_80px_-45px_rgba(0,0,0,1)] backdrop-blur">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="text-[0.6rem] uppercase tracking-[0.55em] text-emerald-300/80">
                  Belote Live
                </p>
                <h1 className="mt-3 text-4xl font-semibold text-white">
                  {mode === "signin" ? "Connexion" : "Créez votre compte"}
                </h1>
                <p className="mt-2 text-sm text-slate-400">
                  Sauvegardez vos stats, vos avatars et retrouvez vos partenaires de jeu.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onToggleMode(mode === "signin" ? "signup" : "signin")}
                className="rounded-full border border-slate-600/60 px-4 py-2 text-[0.6rem] uppercase tracking-[0.4em] text-slate-200 transition hover:border-slate-300"
              >
                {mode === "signin" ? "Inscription" : "Connexion"}
              </button>
            </div>
            {error && (
              <p className="mt-6 rounded-2xl border border-rose-400/60 bg-rose-500/15 px-4 py-3 text-xs text-rose-100">
                {error}
              </p>
            )}
            {info && (
              <p className="mt-6 rounded-2xl border border-amber-300/60 bg-amber-500/15 px-4 py-3 text-xs text-amber-200">
                {info}
              </p>
            )}
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <label className="flex flex-col gap-2 text-sm text-slate-200">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-300 focus:ring-1 focus:ring-cyan-300/50"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-slate-200">
                Mot de passe
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40"
                />
              </label>
              {mode === "signup" && (
                <>
                  <label className="flex flex-col gap-2 text-sm text-slate-200">
                    Pseudo public
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-300 focus:ring-1 focus:ring-cyan-300/40"
                      placeholder="BeloteMaster"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm text-slate-200">
                    Avatar (upload)
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        setAvatarFile(file);
                      }}
                      className="rounded-2xl border border-dashed border-emerald-400/50 bg-slate-900/70 px-4 py-3 text-xs text-emerald-100 file:mr-3 file:rounded-xl file:border-0 file:bg-emerald-500/20 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-emerald-100"
                    />
                    {avatarFile && (
                      <span className="text-[0.65rem] uppercase tracking-[0.45em] text-emerald-200">
                        {avatarFile.name}
                      </span>
                    )}
                  </label>
                </>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-r from-cyan-400 via-emerald-400 to-green-400 px-4 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-slate-900 transition hover:brightness-110 disabled:opacity-50"
              >
                {loading ? "Patientez..." : mode === "signin" ? "Se connecter" : "Créer un compte"}
              </button>
            </form>
            <div className="mt-8 space-y-3">
              <button
                type="button"
                onClick={onContinueAsGuest}
                className="group flex w-full items-center justify-between rounded-2xl border border-cyan-400/50 bg-slate-900/70 px-4 py-3 text-xs font-semibold uppercase tracking-[0.35em] text-cyan-100 transition hover:border-cyan-200 hover:bg-slate-900/60"
              >
                <span>Jouer en invité</span>
                <span className="text-base transition group-hover:translate-x-1">→</span>
              </button>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-[2.5rem] border border-emerald-400/25 bg-gradient-to-br from-emerald-400/10 via-cyan-400/5 to-transparent p-10 text-slate-50 shadow-[0_35px_80px_-45px_rgba(16,185,129,0.6)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.3),transparent_55%)] opacity-70" />
            <div className="pointer-events-none absolute -left-8 top-10 hidden rotate-[12deg] opacity-60 md:block">
              <img src={CARD_OVERLAY_SVG} alt="" className="h-28 w-auto" />
            </div>
            <div className="pointer-events-none absolute -right-4 bottom-6 hidden rotate-[-10deg] opacity-60 md:block">
              <img src={CARD_OVERLAY_SVG} alt="" className="h-24 w-auto" />
            </div>
            <div className="relative flex h-full flex-col gap-8">
              <header>
                <p className="text-xs uppercase tracking-[0.6em] text-emerald-200/80">
                  Belote Live
                </p>
                <h2 className="mt-3 text-4xl font-semibold text-white">
                  Le tapis digital des clubs de belote
                </h2>
                <p className="mt-3 text-sm text-emerald-50/80 leading-relaxed">
                  Interface stylée, avatars personnalisés, annonces animées et classements persistants : tout ce qu’il faut pour donner à vos soirées belote un vrai caractère e-sport.
                </p>
              </header>
              <div className="grid gap-5 sm:grid-cols-2">
                {[
                  {
                    title: "Tables privées",
                    desc: "Créez un code, partagez-le instantanément et lancez la donne avec vos partenaires.",
                  },
                  {
                    title: "Stats et profils",
                    desc: "Winrate, séries de victoires et avatars synchronisés pour chaque joueur.",
                  },
                  {
                    title: "Animations",
                    desc: "Réactions emoji, annonces Belote/Rebelote et tapis qui s’illuminent.",
                  },
                  {
                    title: "Cross-device",
                    desc: "Pensé pour votre écran large, mais aussi tablette et mobile paysage.",
                  },
                ].map((feature) => (
                  <div key={feature.title} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm backdrop-blur">
                    <p className="text-xs uppercase tracking-[0.4em] text-emerald-200/80">{feature.title}</p>
                    <p className="mt-2 text-emerald-50/90">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
