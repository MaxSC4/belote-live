import { AvatarPicker } from "@/components/ui/avatar-picker";
import AvatarCircle from "../common/AvatarCircle";

interface ProfileSetupScreenProps {
  values: { username: string; avatarUrl?: string | null };
  onChange: (field: "username" | "avatarUrl", value: string | null) => void;
  onSelectAvatar: (avatarUrl: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  saving: boolean;
  error: string | null;
  onUploadAvatar: (file: File) => void;
  uploadingAvatar: boolean;
}

export default function ProfileSetupScreen(props: ProfileSetupScreenProps) {
  const {
    values,
    onChange,
    onSelectAvatar,
    onSubmit,
    saving,
    error,
    onUploadAvatar,
    uploadingAvatar,
  } = props;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onUploadAvatar(file);
    }
    event.target.value = "";
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="w-full max-w-md rounded-[2rem] border border-slate-700 bg-slate-900/80 p-8 shadow-[0_30px_60px_-35px_rgba(0,0,0,1)]">
        <h1 className="text-2xl font-semibold text-white">Complétez votre profil</h1>
        <p className="mt-2 text-sm text-slate-400">
          Choisissez un pseudo public et un avatar.
        </p>
        {error && (
          <p className="mt-4 rounded-xl border border-rose-400/60 bg-rose-500/10 px-4 py-2 text-xs text-rose-100">
            {error}
          </p>
        )}
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-3 rounded-2xl border border-slate-600 bg-slate-950/60 px-4 py-4">
            <div className="flex items-center gap-3">
              <AvatarCircle avatarUrl={values.avatarUrl ?? null} fallback={values.username} />
              <div className="text-xs uppercase tracking-[0.35em] text-slate-400">
                Avatar
                <p className="text-[0.65rem] normal-case text-slate-400/80">
                  Choisissez un preset ou uploadez une image.
                </p>
              </div>
            </div>
            <AvatarPicker
              value={values.avatarUrl}
              username={values.username}
              onSelect={onSelectAvatar}
            />
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-600/70 px-3 py-2 text-[0.7rem] uppercase tracking-[0.35em] text-slate-200 transition hover:border-slate-400">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
                disabled={uploadingAvatar}
              />
              {uploadingAvatar ? "Upload en cours..." : "Uploader une image"}
            </label>
          </div>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            Pseudo
            <input
              value={values.username}
              onChange={(e) => onChange("username", e.target.value)}
              className="rounded-2xl border border-slate-600 bg-slate-950/60 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-400"
              required
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-white disabled:opacity-50"
          >
            {saving ? "Sauvegarde..." : "Enregistrer"}
          </button>
        </form>
      </div>
    </div>
  );
}
