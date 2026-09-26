import { CircleCheck, CircleDashed } from 'lucide-react';
import { PageHeader } from '../components/ui.jsx';
import { useSession, useCatalog } from '../lib.jsx';

function Row({ label, ok, value, hint }) {
  return (
    <div className="flex items-start gap-4 py-4">
      {ok ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-400" /> : <CircleDashed className="mt-0.5 size-5 shrink-0 text-ink-400" />}
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="mt-0.5 text-sm text-ink-400">{hint}</p>
      </div>
      <span className="chip shrink-0">{value}</span>
    </div>
  );
}

export default function Settings() {
  const { user } = useSession();
  const catalog = useCatalog();
  const p = catalog?.providers;

  return (
    <>
      <PageHeader title="Settings" />
      <div className="card mb-8 p-6">
        <p className="label">Profile</p>
        <p className="font-semibold">{user?.name}</p>
        <p className="text-sm text-ink-400">{user?.email}</p>
      </div>

      {p && (
        <div className="card p-6">
          <p className="label">Generation engines</p>
          <p className="mb-2 text-sm text-ink-400">Set these in the server’s <code>.env</code> file (see <code>.env.example</code>) and restart the server.</p>
          <div className="divide-y divide-white/5">
            <Row label="Scriptwriter" ok={p.script.provider === 'claude'} value={p.script.provider === 'claude' ? p.script.model : 'sample library'} hint="ANTHROPIC_API_KEY: Claude writes a fresh, hook-first script for every video on any topic." />
            <Row label="Visuals" ok={p.images.provider !== 'procedural'} value={p.images.provider} hint="OPENAI_API_KEY for AI images per scene (gpt-image-2.5-sunburst, high quality, native 9:16). IMAGE_PROVIDER=pollinations is a free option. Otherwise stylised procedural art is drawn." />
            <Row label="AI video clips" ok={Boolean(p.video?.provider)} value={p.video?.provider ? 'fal.ai' : 'off'} hint={p.video?.provider ? `Hook: ${p.video.hookModel.replace(/^fal-ai\//, '')} (FAL_HOOK_MODEL) · Every scene: ${p.video.model.replace(/^fal-ai\//, '')} (FAL_VIDEO_MODEL). Choose per series under Visuals.` : 'FAL_KEY (fal.ai) makes real AI video clips: just the opening hook (about $0.36 per video) or every scene. Without it, scenes are animated stills.'} />
            <Row label="Voiceover" ok={['elevenlabs', 'openai'].includes(p.voice.provider)} value={p.voice.provider} hint="ELEVENLABS_API_KEY for the best narration (eleven_v3 with word-perfect caption timing), or OPENAI_API_KEY. Otherwise the system voice is used (macOS `say` / espeak-ng)." />
            <Row label="YouTube posting" ok={p.social.youtube} value={p.social.youtube ? 'enabled' : 'demo only'} hint="GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET with the YouTube Data API v3 enabled. Also enables Google sign-in." />
            <Row label="TikTok posting" ok={p.social.tiktok} value={p.social.tiktok ? 'enabled' : 'demo only'} hint="TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET for an app with the Content Posting API." />
            <Row label="Instagram posting" ok={p.social.instagram} value={p.social.instagram ? 'enabled' : 'demo only'} hint="INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET plus a public PUBLIC_MEDIA_URL." />
          </div>
        </div>
      )}
    </>
  );
}
