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
  { id: 'integration', label: 'AI connection', description: 'The next phase', icon: PlugZap },
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
  const { preferences, savePreferences, resetWorkspace, setSource, creations, history, profiles } =
    useStudio();
  const [draft, setDraft] = useState<Preferences>({ ...preferences });
  const [section, setSection] = useState('general');
  const [recordOpen, setRecordOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [backendUrl, setBackendUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [apiReachable, setApiReachable] = useState(false);
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
  const testConnection = async () => {
    setTesting(true);
    setApiReachable(false);
    try {
      const url = z.url().parse(backendUrl);
      if (!/^https?:\/\//i.test(url)) throw new Error('Use an HTTP or HTTPS backend URL.');
      const response = await fetch(`${url.replace(/\/$/, '')}/api/voices/presets`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`The API returned ${response.status}.`);
      const data = await response.json();
      if (!Array.isArray(data) && !Array.isArray(data.presets))
        throw new Error('The endpoint did not return a voice preset list.');
      setApiReachable(true);
      toast.success('Preset API is reachable', {
        description: 'GPU inference still needs a separate, real conversion test.',
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'The backend could not be reached. Check its URL and CORS configuration.',
      );
    } finally {
      setTesting(false);
    }
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
                    <p className="settings-field-note">Applied to local effect exports.</p>
                  </div>
                  <div>
                    <label className="field-label">Export format</label>
                    <div className="read-only-field">
                      <FileAudio size={14} />
                      WAV · 16-bit PCM<Badge>LOSSLESS</Badge>
                    </div>
                    <p className="settings-field-note">An uncompressed, playable audio file.</p>
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
                <div className="audio-engine-spec">
                  <Cpu size={17} />
                  <div>
                    <h3>Web Audio processing</h3>
                    <p>
                      Local pitch, modulation, filtering, and echo. No AI speaker identity
                      conversion.
                    </p>
                  </div>
                  <Badge className="badge-green">AVAILABLE</Badge>
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
                      Traditional effects run locally. Your audio isn’t sent to any server in this
                      frontend.
                    </p>
                  </div>
                  <Check size={14} />
                </div>
                <div className="privacy-feature">
                  <Database size={20} />
                  <div>
                    <h3>No database. No permanent records.</h3>
                    <p>
                      Creations, voice references, and activity live in temporary frontend memory.
                    </p>
                  </div>
                  <Check size={14} />
                </div>
                <div className="privacy-feature">
                  <ShieldCheck size={20} />
                  <div>
                    <h3>Permission comes first</h3>
                    <p>
                      Reference voices require explicit permission. Deceptive impersonation isn’t
                      supported.
                    </p>
                  </div>
                  <Check size={14} />
                </div>
                <div className="session-data-summary">
                  <span>
                    CREATIONS<strong>{creations.length}</strong>
                  </span>
                  <span>
                    REFERENCES<strong>{profiles.length}</strong>
                  </span>
                  <span>
                    ACTIVITY EVENTS<strong>{history.length}</strong>
                  </span>
                </div>
                <div className="settings-info-strip">
                  Download anything you want to keep. A refresh starts a new session.
                </div>
              </Panel>
              <Panel className="settings-panel danger-panel">
                <div>
                  <h3>A clean slate.</h3>
                  <p>Clear this session’s audio, references, creations, and history.</p>
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
                  <h2>A real engine. A new dimension.</h2>
                  <p>The next phase of your voice studio.</p>
                </div>
                <Badge className="badge-violet">PHASE 2–4</Badge>
              </div>
              <div className="integration-model-card">
                <div className="model-chip">
                  <Cpu size={33} />
                </div>
                <div>
                  <span>PROPOSED PRETRAINED MODEL</span>
                  <h3>Seed-VC</h3>
                  <p>
                    Reference-conditioned voice conversion.
                    <br />
                    License, language support, quality, and GPU needs must be verified.
                  </p>
                </div>
                <Badge className="badge-muted">NOT CONNECTED</Badge>
              </div>
              <div className="integration-notice">
                <ShieldCheck size={16} />
                <p>
                  No pretrained model is running in this frontend. There is no fake successful AI
                  conversion or inferred result.
                </p>
              </div>
              <label htmlFor="backend-url" className="field-label">
                FastAPI backend URL
              </label>
              <div className="backend-url-row">
                <input
                  id="backend-url"
                  className="input-field"
                  type="url"
                  placeholder="https://your-api.example.com"
                  value={backendUrl}
                  onChange={(e) => {
                    setBackendUrl(e.target.value);
                    setApiReachable(false);
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => void testConnection()}
                  disabled={!backendUrl || testing}
                >
                  {testing ? <Loader2 size={13} className="animate-spin" /> : <PlugZap size={13} />}
                  Test API
                </Button>
              </div>
              <p className="settings-field-note">
                Checks GET /api/voices/presets only. A reachable API does not prove GPU inference is
                available.
              </p>
              {apiReachable && (
                <div className="api-reachable">
                  <span className="status-dot" />
                  Preset API responded. A real conversion test is still required.
                </div>
              )}
              <div className="api-contract">
                <div>
                  <span>PLANNED API CONTRACT</span>
                  <Badge>FASTAPI</Badge>
                </div>
                {[
                  { method: 'POST', route: '/api/audio/upload' },
                  { method: 'POST', route: '/api/voices/reference' },
                  { method: 'GET', route: '/api/voices/presets' },
                  { method: 'POST', route: '/api/conversions' },
                  { method: 'GET', route: '/api/conversions/{job_id}' },
                  { method: 'GET', route: '/api/conversions/{job_id}/result' },
                  { method: 'DELETE', route: '/api/audio/{audio_id}' },
                ].map((endpoint) => (
                  <div key={endpoint.route}>
                    <code className={`method-${endpoint.method.toLowerCase()}`}>
                      {endpoint.method}
                    </code>
                    <span>{endpoint.route}</span>
                  </div>
                ))}
              </div>
              <div className="settings-info-strip">
                <Cpu size={13} />
                Modular inference. Temporary files. In-memory jobs. No database.
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
