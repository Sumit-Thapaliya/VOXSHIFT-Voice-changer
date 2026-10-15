'use client';
import { useState } from 'react';
import {
  UserRound,
  AudioLines,
  Palette,
  ShieldCheck,
  PlugZap,
  ArrowRight,
  Check,
  Mic,
  Headphones,
  Volume2,
  Save,
  RotateCcw,
  Trash2,
  LockKeyhole,
  Database,
  FileAudio,
  Sparkles,
  Cpu,
  Loader2,
  Globe,
  CircleHelp,
  ExternalLink,
  ChevronRight,
  Server,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { useStudio } from '@/components/providers';
import { PageHeading } from '@/components/page-heading';
import { Button, Panel, Badge, Switch, Modal } from '@/components/ui';
import { RecordModal } from '@/components/upload-zone';
import { cn } from '@/lib/utils';
import { defaultPreferences, type Preferences } from '@/lib/data';
const sections = [
  { id: 'general', label: 'General', description: 'A little about you', icon: UserRound },
  { id: 'audio', label: 'Audio', description: 'Find your frequency', icon: AudioLines },
  { id: 'appearance', label: 'Appearance', description: 'Set the atmosphere', icon: Palette },
  {
    id: 'privacy',
    label: 'Privacy & session',
    description: 'Always in your control',
    icon: ShieldCheck,
  },
  { id: 'integration', label: 'CPU engine', description: 'Optional, runs locally', icon: PlugZap },
];
const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Add a display name.')
    .max(48, 'Keep your display name under 48 characters.'),
  email: z.email('Add a valid email address.'),
});
export default function SettingsPage() {
  const {
    preferences,
    savePreferences,
    resetWorkspace,
    setSource,
    creations,
    history,
    customVoices,
    engineState,
    engineHealth,
    refreshEngine,
    voices,
  } = useStudio();
  const [draft, setDraft] = useState<Preferences>({ ...preferences });
  const [section, setSection] = useState('general');
  const [recordOpen, setRecordOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [emailError, setEmailError] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(preferences);
  const change = <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const initials = draft.displayName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const save = () => {
    const result = profileSchema.safeParse({ displayName: draft.displayName, email: draft.email });
    if (!result.success) {
      setEmailError(result.error.issues[0].message);
      setSection('general');
      return;
    }
    setEmailError('');
    savePreferences({ ...draft, displayName: draft.displayName.trim() });
  };
  return (
    <div className="settings-page">
      <PageHeading
        eyebrow="STUDIO PREFERENCES"
        title="Make the studio yours."
        description="A few small adjustments. A workspace that feels just right."
      >
        <Badge className="settings-session-badge">
          <span className="status-dot" />
          SESSION PREFERENCES
        </Badge>
      </PageHeading>
      <div className="settings-layout">
        <aside className="settings-navigation">
          {sections.map((s) => (
            <button
              key={s.id}
              className={section === s.id ? 'active' : ''}
              onClick={() => setSection(s.id)}
            >
              <s.icon size={16} />
              <span>
                {s.label}
                <small>{s.description}</small>
              </span>
              {section === s.id && <ChevronRight size={12} />}
            </button>
          ))}
          <div className="settings-nav-note">
            <img src="/logo.png" alt="VoxShift" />
            <strong>Built for your imagination.</strong>
            <span>VOXSHIFT STUDIO · v1.0</span>
          </div>
        </aside>
        <div className="settings-main">
          {section === 'general' && (
            <Panel className="settings-panel">
              <div className="settings-panel-heading">
                <span className="settings-heading-icon">
                  <UserRound size={19} />
                </span>
                <div>
                  <h2>A little more you.</h2>
                  <p>Personalize your session workspace.</p>
                </div>
              </div>
              <div className="settings-profile">
                <span className="settings-avatar">{initials || 'VX'}</span>
                <div>
                  <h3>{draft.displayName || 'Your workspace'}</h3>
                  <p>
                    Personal workspace<span>FRONTEND PREVIEW</span>
                  </p>
                </div>
              </div>
              <div className="form-row">
                <div>
                  <label className="field-label" htmlFor="display-name">
                    Display name
                  </label>
                  <input
                    id="display-name"
                    className="input-field"
                    value={draft.displayName}
                    maxLength={48}
                    onChange={(e) => change('displayName', e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="profile-email">
                    Email address
                  </label>
                  <input
                    id="profile-email"
                    className="input-field"
                    type="email"
                    value={draft.email}
                    onChange={(e) => change('email', e.target.value)}
                  />
                </div>
              </div>
              {emailError && <p className="form-error">{emailError}</p>}
              <p className="settings-field-note">
                For this session only. No account, authentication, or email service is connected.
              </p>
              <div className="subtle-divider" />
              <div className="settings-toggle-row">
                <div>
                  <h3>Add conversions to My Creations</h3>
                  <p>Keep your new sounds close during this session.</p>
                </div>
                <Switch
                  checked={draft.autoSave}
                  onCheckedChange={(checked) => change('autoSave', checked)}
                  aria-label="Add converted audio to My Creations"
                />
              </div>
              <div className="settings-toggle-row">
                <div>
                  <h3>Studio updates</h3>
                  <p>Show the notification indicator in your workspace.</p>
                </div>
                <Switch
                  checked={draft.notifications}
                  onCheckedChange={(checked) => change('notifications', checked)}
                  aria-label="Studio update notifications"
                />
              </div>
              <div className="settings-info-strip">
                <ClockGlyph />
                Preferences disappear on refresh. Nothing is stored in a database.
              </div>
            </Panel>
          )}
          {section === 'audio' && (
            <>
              <Panel className="settings-panel">
                <div className="settings-panel-heading">
                  <span className="settings-heading-icon">
                    <AudioLines size={19} />
                  </span>
                  <div>
                    <h2>Find your frequency.</h2>
                    <p>Choose how your audio is processed and exported.</p>
                  </div>
                </div>
                <div className="form-row">
                  <div>
                    <label className="field-label" htmlFor="sample-rate">
                      Output sample rate
                    </label>
                    <select
                      id="sample-rate"
                      className="input-field"
                      value={draft.sampleRate}
                      onChange={(e) => change('sampleRate', e.target.value)}
                    >
                      <option value="44100">44.1 kHz · Standard</option>
                      <option value="48000">48 kHz · Studio</option>
                      <option value="96000">96 kHz · High resolution</option>
                    </select>
                    <p className="settings-field-note">Applied to local renders and browser exports.</p>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="target-lufs">
                      Target loudness
                    </label>
                    <select
                      id="target-lufs"
                      className="input-field"
                      value={draft.targetLufs}
                      onChange={(e) => change('targetLufs', e.target.value)}
                    >
                      <option value="-14">−14 LUFS · Streaming</option>
                      <option value="-16">−16 LUFS · Podcast</option>
                      <option value="-18">−18 LUFS · Broadcast</option>
                    </select>
                    <p className="settings-field-note">
                      Measured with the BS.1770 gated loudness algorithm, then limited to −1 dBTP.
                    </p>
                  </div>
                </div>
                <div className="subtle-divider" />
                <div className="settings-toggle-row">
                  <div>
                    <h3>Normalize output volume</h3>
                    <p>Bring the loudest peaks to a safe, consistent level.</p>
                  </div>
                  <Switch
                    checked={draft.normalize}
                    onCheckedChange={(checked) => change('normalize', checked)}
                    aria-label="Normalize exported audio"
                  />
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <h3>Clean up noise automatically</h3>
                    <p>
                      Spectral noise reduction on every render, using the quietest part of your clip as
                      the noise profile.
                    </p>
                  </div>
                  <Switch
                    checked={draft.denoise}
                    onCheckedChange={(checked) => change('denoise', checked)}
                    aria-label="Denoise every render"
                  />
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <h3>Trim silence</h3>
                    <p>Remove long gaps at the start and end of the processed audio.</p>
                  </div>
                  <Switch
                    checked={draft.trimSilence}
                    onCheckedChange={(checked) => change('trimSilence', checked)}
                    aria-label="Trim silence on render"
                  />
                </div>
                <div className="subtle-divider" />
                <div className="audio-engine-spec">
                  <Cpu size={17} />
                  <div>
                    <h3>Two real engines, one design format</h3>
                    <p>
                      The browser DSP and the Python engine share the same voice-chain spec, so a design
                      renders the same way in both. Pitch and formant shifting, tone sculpting,
                      dynamics, reverb and true peak limiting.
                    </p>
                  </div>
                  <Badge className="badge-green">DETERMINISTIC</Badge>
                </div>
              </Panel>
              <Panel className="settings-panel hardware-panel">
                <div className="settings-panel-heading">
                  <span className="settings-heading-icon">
                    <Mic size={19} />
                  </span>
                  <div>
                    <h2>Check your setup.</h2>
                    <p>Your browser’s default input and output devices.</p>
                  </div>
                </div>
                <div className="hardware-row">
                  <Mic size={17} />
                  <div>
                    <h3>System default microphone</h3>
                    <p>Microphone permission is requested when recording starts.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setRecordOpen(true)}>
                    Test mic
                    <ArrowRight size={12} />
                  </Button>
                </div>
                <div className="hardware-row">
                  <Headphones size={17} />
                  <div>
                    <h3>System default speakers</h3>
                    <p>Use the audio player below to hear a sample.</p>
                  </div>
                  <Badge>DEFAULT</Badge>
                </div>
              </Panel>
            </>
          )}
          {section === 'appearance' && (
            <Panel className="settings-panel">
              <div className="settings-panel-heading">
                <span className="settings-heading-icon">
                  <Palette size={19} />
                </span>
                <div>
                  <h2>Set the atmosphere.</h2>
                  <p>A little mood lighting for your next big idea.</p>
                </div>
              </div>
              <span className="field-label">Workspace theme</span>
              <div className="theme-options">
                {(
                  [
                    { id: 'midnight', name: 'Midnight', description: 'The original VoxShift' },
                    { id: 'deep-space', name: 'Deep space', description: 'A little more blue' },
                    { id: 'oled', name: 'Pure obsidian', description: 'Less light. More focus.' },
                  ] as const
                ).map((theme) => (
                  <button
                    key={theme.id}
                    className={cn('theme-option', draft.theme === theme.id && 'selected')}
                    onClick={() => change('theme', theme.id)}
                  >
                    <span className={`theme-preview theme-${theme.id}`}>
                      <span />
                      <span>
                        <i />
                        <i />
                        <i />
                      </span>
                      <span>
                        <i />
                        <i />
                      </span>
                    </span>
                    <span className="theme-name">
                      {theme.name}
                      {draft.theme === theme.id && <Check size={12} />}
                    </span>
                    <span className="theme-description">{theme.description}</span>
                  </button>
                ))}
              </div>
              <div className="subtle-divider" />
              <div className="settings-toggle-row">
                <div>
                  <h3>Smooth motion & visualizers</h3>
                  <p>Animated transitions, glowing sound rings, and waveform motion.</p>
                </div>
                <Switch
                  checked={draft.motion}
                  onCheckedChange={(checked) => change('motion', checked)}
                  aria-label="Enable animations"
                />
              </div>
              <div className="settings-info-strip">
                <Sparkles size={13} />
                Your system’s reduced-motion preference is always respected.
              </div>
            </Panel>
          )}
          {section === 'privacy' && (
            <>
              <Panel className="settings-panel">
                <div className="settings-panel-heading">
                  <span className="settings-heading-icon">
                    <ShieldCheck size={19} />
                  </span>
                  <div>
                    <h2>Your voice. Your control.</h2>
                    <p>Private by design, not by accident.</p>
                  </div>
                </div>
                <div className="privacy-feature">
                  <LockKeyhole size={20} />
                  <div>
                    <h3>No hidden uploads</h3>
                    <p>
                      {engineState === 'online'
                        ? 'With the engine connected, only the clip you render is uploaded to your own machine, and it expires automatically.'
                        : 'No engine is connected. Every effect is processed inside this browser tab.'}
                    </p>
                  </div>
                  <Check size={14} />
                </div>
                <div className="privacy-feature">
                  <Database size={20} />
                  <div>
                    <h3>Temporary audio, saved designs</h3>
                    <p>
                      Renders are deleted after {engineHealth?.limits.ttl_minutes ?? 360} minutes. Voice
                      designs, projects and preferences are the only things stored.
                    </p>
                  </div>
                  <Check size={14} />
                </div>
                <div className="privacy-feature">
                  <ShieldCheck size={20} />
                  <div>
                    <h3>Design, never clone</h3>
                    <p>
                      VOXSHIFT does not learn from anyone&apos;s voice and cannot imitate a real person,
                      so there is nothing to consent for.
                    </p>
                  </div>
                  <Check size={14} />
                </div>
                <div className="session-data-summary">
                  <span>
                    CREATIONS<strong>{creations.length}</strong>
                  </span>
                  <span>
                    CUSTOM VOICES<strong>{customVoices.length}</strong>
                  </span>
                  <span>
                    ACTIVITY EVENTS<strong>{history.length}</strong>
                  </span>
                </div>
                <div className="settings-toggle-row">
                  <div>
                    <h3>Remember this workspace</h3>
                    <p>
                      Keep preferences, saved voices and history in this browser between visits.
                      Audio is never stored this way.
                    </p>
                  </div>
                  <Switch
                    checked={draft.remember}
                    onCheckedChange={(checked) => change('remember', checked)}
                    aria-label="Remember this workspace"
                  />
                </div>
                <div className="settings-info-strip">
                  <Download size={13} />
                  Download anything you want to keep. Turning the toggle off clears the stored copy.
                </div>
              </Panel>
              <Panel className="settings-panel danger-panel">
                <div>
                  <h3>A clean slate.</h3>
                  <p>Clear this session’s audio, custom voices, creations, and history.</p>
                </div>
                <Button variant="danger" size="sm" onClick={() => setResetOpen(true)}>
                  <Trash2 size={13} />
                  Clear session
                </Button>
              </Panel>
            </>
          )}
          {section === 'integration' && (
            <Panel className="settings-panel integration-panel">
              <div className="settings-panel-heading">
                <span className="settings-heading-icon">
                  <PlugZap size={19} />
                </span>
                <div>
                  <h2>Your own CPU engine.</h2>
                  <p>Optional, free to run, and never required.</p>
                </div>
                <Badge className={engineState === 'online' ? 'badge-green' : 'badge-violet'}>
                  {engineState === 'online' ? 'ONLINE' : 'LOCAL MODE'}
                </Badge>
              </div>
              <div className="integration-model-card">
                <div className="model-chip">
                  {engineState === 'online' ? <Server size={31} /> : <Cpu size={31} />}
                </div>
                <div>
                  <span>ENGINE STATUS</span>
                  <h3>{engineState === 'online' ? engineHealth?.engine || 'VOXSHIFT Engine' : 'Browser DSP only'}</h3>
                  <p>
                    {engineState === 'online'
                      ? `v${engineHealth?.version} · ${engineHealth?.cpu_count} CPU cores · ${
                          (engineHealth?.queue.queued ?? 0) + (engineHealth?.queue.running ?? 0)
                        } active job(s) · ${engineHealth?.formats.ffmpeg_available ? 'ffmpeg available' : 'WAV only'}`
                      : 'Start the FastAPI engine for 12–16× real-time renders. The studio already works without it.'}
                  </p>
                </div>
                <Badge className={engineState === 'online' ? 'badge-green' : 'badge-muted'}>
                  {engineState === 'online' ? 'CPU' : 'OFFLINE'}
                </Badge>
              </div>
              <div className="integration-notice">
                <ShieldCheck size={16} />
                <p>
                  No GPU and no pretrained model: voices are designed with deterministic signal
                  processing. Uploads are temporary and expire after{' '}
                  {engineHealth?.limits.ttl_minutes ?? 360} minutes.
                </p>
              </div>
              <div className="settings-toggle-row">
                <div>
                  <h3>Prefer the engine when it is reachable</h3>
                  <p>Turn this off to always render inside the browser, even with an engine online.</p>
                </div>
                <Switch
                  checked={draft.preferServer}
                  onCheckedChange={(checked) => change('preferServer', checked)}
                  aria-label="Prefer the CPU engine"
                />
              </div>
              <div className="subtle-divider" />
              <label htmlFor="backend-url" className="field-label">
                Engine URL
              </label>
              <div className="backend-url-row">
                <input
                  id="backend-url"
                  className="input-field"
                  placeholder="leave empty to use /engine (recommended)"
                  value={draft.engineUrl}
                  onChange={(e) => change('engineUrl', e.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    savePreferences(draft, { silent: true });
                    void refreshEngine();
                    toast.success('Engine settings applied');
                  }}
                  disabled={testing}
                >
                  {testing ? <Loader2 size={13} className="animate-spin" /> : <PlugZap size={13} />}
                  Save &amp; test
                </Button>
              </div>
              <label htmlFor="backend-key" className="field-label">
                API key (only if VOXSHIFT_API_KEY is set on the engine)
              </label>
              <input
                id="backend-key"
                className="input-field"
                type="password"
                placeholder="optional shared secret"
                value={draft.engineApiKey}
                onChange={(e) => change('engineApiKey', e.target.value)}
              />
              <p className="settings-field-note">
                Empty uses the built-in proxy at <code>/engine</code>, which keeps the browser on its
                own origin. Set <code>ENGINE_URL</code> before starting Next.js to point the proxy
                somewhere else.
              </p>
              {engineState === 'online' && engineHealth && (
                <div className="api-reachable">
                  <span className="status-dot" />
                  Engine reachable · {engineHealth.counters.renders_done} render(s) completed ·{' '}
                  {engineHealth.storage.disk_free_mb} MB free
                </div>
              )}
              {engineState !== 'online' && (
                <div className="settings-info-strip">
                  <CircleHelp size={13} />
                  Start it with <code>python -m uvicorn app.main:app --port 8000</code> inside{' '}
                  <code>backend/</code>, or run <code>./dev.sh</code> from the project root.
                </div>
              )}
              <div className="api-contract">
                <div>
                  <span>ENGINE API</span>
                  <Badge>FASTAPI</Badge>
                </div>
                {[
                  { method: 'GET', route: '/api/health' },
                  { method: 'GET', route: '/api/presets' },
                  { method: 'POST', route: '/api/analyze' },
                  { method: 'POST', route: '/api/render' },
                  { method: 'GET', route: '/api/render/{job_id}' },
                  { method: 'GET', route: '/api/render/{job_id}/audio' },
                  { method: 'POST', route: '/api/polish' },
                  { method: 'GET', route: '/api/voices' },
                  { method: 'POST', route: '/api/projects' },
                  { method: 'GET', route: '/api/stats' },
                ].map((endpoint) => (
                  <div key={endpoint.route}>
                    <code className={`method-${endpoint.method.toLowerCase()}`}>{endpoint.method}</code>
                    <span>{endpoint.route}</span>
                  </div>
                ))}
              </div>
              <div className="settings-info-strip">
                <Server size={13} />
                SQLite metadata · temporary audio files · automatic expiry · optional API key.
              </div>
            </Panel>
          )}
          <div className="settings-save-bar">
            <span>
              {dirty ? (
                <>
                  <i />
                  You have a few unsaved changes.
                </>
              ) : (
                'Your workspace, just the way you like it.'
              )}
            </span>
            <div>
              <Button
                variant="ghost"
                size="sm"
                disabled={!dirty}
                onClick={() => {
                  setDraft({ ...preferences });
                  setEmailError('');
                }}
              >
                Discard
              </Button>
              <Button size="sm" onClick={save} disabled={!dirty}>
                <Check size={13} />
                Save preferences
              </Button>
            </div>
          </div>
        </div>
      </div>
      <RecordModal
        open={recordOpen}
        onOpenChange={setRecordOpen}
        onAccepted={(audio) => {
          setSource(audio);
          setRecordOpen(false);
          toast.success('Microphone test added to your studio');
        }}
      />
      <Modal
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Ready for a fresh start?"
        description="Your session’s creations, audio references, history, and preferences will be cleared. Download anything you want to keep first."
      >
        <div className="modal-actions">
          <Button variant="outline" onClick={() => setResetOpen(false)}>
            Keep my session
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              resetWorkspace();
              setDraft({ ...defaultPreferences });
              setResetOpen(false);
            }}
          >
            <Trash2 size={14} />
            Clear session
          </Button>
        </div>
      </Modal>
    </div>
  );
}
function ClockGlyph() {
  return <RotateCcw size={12} />;
}
