import { AvatarPicker } from "@/components/ui/avatar-picker";
import AvatarCircle from "../common/AvatarCircle";

interface ProfileModalProps {
  values: { username: string; avatarUrl?: string | null };
  onChange: (field: "username", value: string) => void;
  onSelectAvatar: (avatarUrl: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  saving: boolean;
  onUploadAvatar: (file: File) => void;
  uploadingAvatar: boolean;
  avatarUrl?: string | null;
}

export default function ProfileModal(props: ProfileModalProps) {
  const {
    values,
    onChange,
    onClose,
    onSubmit,
    saving,
    onUploadAvatar,
    uploadingAvatar,
    avatarUrl,
    onSelectAvatar,
  } = props;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onUploadAvatar(file);
    }
    event.target.value = "";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-600/60 bg-slate-950/95 p-6 text-sm shadow-[0_25px_60px_-30px_rgba(0,0,0,1)]">
        <h2 className="text-lg font-semibold text-white">Votre profil</h2>
        <p className="text-xs text-slate-400">
          Mettez à jour votre pseudo et votre avatar.
        </p>
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div className="rounded-2xl border border-slate-700/70 bg-slate-900/70 px-4 py-4">
            <div className="flex items-center gap-4">
              <AvatarCircle avatarUrl={values.avatarUrl ?? avatarUrl ?? null} fallback={values.username} />
              <div className="flex-1 text-xs text-slate-300">
                <p className="uppercase tracking-[0.35em]">Avatar</p>
                <p className="text-[0.7rem] text-slate-400">
                  Choisissez un avatar de base ou uploadez une image.
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-4">
              <AvatarPicker
                value={values.avatarUrl ?? avatarUrl}
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
                {uploadingAvatar ? "Upload en cours..." : "Uploader votre photo"}
              </label>
            </div>
          </div>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.35em] text-slate-400">
            Pseudo
            <input
              value={values.username}
              onChange={(e) => onChange("username", e.target.value)}
              className="mt-1 rounded-2xl border border-slate-600/60 bg-slate-900/80 px-4 py-2 text-base text-white outline-none transition focus:border-emerald-400"
              required
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-600 px-4 py-2 text-xs uppercase tracking-[0.35em] text-slate-200"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white disabled:opacity-50"
            >
              {saving ? "Sauvegarde..." : "Sauvegarder"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
