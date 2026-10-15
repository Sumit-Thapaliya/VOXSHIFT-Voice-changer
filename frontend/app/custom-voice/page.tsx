'use client';
import { useState } from 'react';
import {
  Mic,
  Upload,
  AudioLines,
  ShieldCheck,
  Check,
  CircleHelp,
  ArrowRight,
  ArrowUpRight,
  Sparkles,
  Cpu,
  LockKeyhole,
  Play,
  Pause,
  MoreHorizontal,
  Trash2,
  Plus,
  Loader2,
  Headphones,
  Volume2,
  FileAudio,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStudio } from '@/components/providers';
import { PageHeading } from '@/components/page-heading';
import {
  Button,
  Panel,
  Badge,
  Checkbox,
  Modal,
  Slider,
  Dropdown,
  DropdownItem,
} from '@/components/ui';
import { UploadZone } from '@/components/upload-zone';
import { MiniWave } from '@/components/visuals';
import { cn, formatTime, uid } from '@/lib/utils';
export default function CustomVoicePage() {
  const {
    reference,
    setReference,
    source,
    setSource,
    profiles,
    addProfile,
    deleteProfile,
    player,
    playTrack,
    addHistory,
  } = useStudio();
  const [consent, setConsent] = useState(false);
  const [quality, setQuality] = useState('High');
  const [pitch, setPitch] = useState(0);
  const [preset, setPreset] = useState('Natural');
  const [name, setName] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const saveProfile = () => {
    if (!reference) {
      toast.error('Add a reference sample first.');
      return;
    }
    if (!consent) {
      toast.error('Please confirm you have permission to use this voice.');
      return;
    }
    if (!name.trim()) {
      toast.error('Give your voice profile a name.');
      return;
    }
    const profile = {
      id: uid(),
      name: name.trim(),
      url: reference.url,
      blob: reference.blob,
      duration: reference.duration,
      color: '#b597ee',
      createdAt: new Date().toISOString(),
    };
    addProfile(profile);
    addHistory({
      action: 'Reference profile added',
      type: 'voice',
      detail: profile.name,
      duration: reference.duration,
      status: 'Sample ready',
    });
    setSaveOpen(false);
    setName('');
    toast.success('Reference profile added to this session', {
      description: 'Voice cloning is not connected in this frontend.',
    });
  };
  const previewReference = () => {
    if (reference) playTrack({ id: 'reference', title: reference.name, url: reference.url });
  };
  return (
    <div className="custom-voice-page">
      <PageHeading
        eyebrow="THE CUSTOM VOICE LAB"
        title="Your voice. A new dimension."
        description="Bring a voice you have permission to use. Build a reference profile that’s uniquely yours."
      >
        <Badge className="badge-violet custom-beta">
          <Sparkles size={11} />
          CUSTOM VOICE · BETA
        </Badge>
      </PageHeading>
      <div className="custom-stepper">
        <span className={cn('stepper-step', reference && 'stepper-complete')}>
          <i>{reference ? <Check size={11} /> : '01'}</i>Reference voice
        </span>
        <span className="stepper-line" />
        <span className="stepper-step">
          <i>02</i>Your speech
        </span>
        <span className="stepper-line" />
        <span className="stepper-step">
          <i>03</i>Transform
        </span>
        <span className="stepper-caption">YOUR SOUND, REIMAGINED</span>
      </div>
      <div className="custom-lab-layout">
        <div className="custom-lab-main">
          <Panel className="custom-step-panel">
            <div className="step-panel-heading">
              <div>
                <span>STEP 01</span>
                <h2>The voice you’re aiming for.</h2>
              </div>
              <Badge className={reference ? 'badge-green' : 'badge-muted'}>
                {reference ? 'SAMPLE READY' : 'REFERENCE VOICE'}
              </Badge>
            </div>
            <p className="step-panel-description">
              Upload a clean reference recording. 10–30 seconds of natural speech works best.
            </p>
            <UploadZone
              reference
              onAccepted={setReference}
              source={reference}
              title="Drop your reference voice here"
            />
            {reference && (
              <div className="loaded-reference">
                <button
                  className="small-audio-play"
                  onClick={previewReference}
                  aria-label="Preview reference voice"
                >
                  {player.id === 'reference' && player.playing ? (
                    <Pause size={13} fill="currentColor" />
                  ) : (
                    <Play size={13} fill="currentColor" />
                  )}
                </button>
                <MiniWave
                  bars={48}
                  color="#b59ae6"
                  active={player.id === 'reference' && player.playing}
                  seed={5}
                />
                <span>{formatTime(reference.duration)}</span>
                <button
                  className="icon-button"
                  onClick={() => setReference(null)}
                  aria-label="Remove reference"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </Panel>
          <Panel className="custom-step-panel source-step-panel">
            <div className="step-panel-heading">
              <div>
                <span>STEP 02</span>
                <h2>The words you want to say.</h2>
              </div>
              <Badge className="badge-cyan">SOURCE SPEECH</Badge>
            </div>
            <p className="step-panel-description">
              Your message, in your own voice. Add the audio you’d like to transform.
            </p>
            <UploadZone compact onAccepted={setSource} source={source} />
            <div className="source-mini-player">
              <button
                className="small-audio-play"
                onClick={() => playTrack({ id: 'source', title: source.name, url: source.url })}
                aria-label="Preview source speech"
              >
                {player.id === 'source' && player.playing ? (
                  <Pause size={12} fill="currentColor" />
                ) : (
                  <Play size={12} fill="currentColor" />
                )}
              </button>
              <MiniWave
                color="#83b5e4"
                bars={52}
                active={player.id === 'source' && player.playing}
                seed={2}
              />
              <span>{formatTime(source.duration)}</span>
            </div>
          </Panel>
          <Panel className="custom-step-panel transform-step-panel">
            <div className="step-panel-heading">
              <div>
                <span>STEP 03</span>
                <h2>Fine-tune your new sound.</h2>
              </div>
              <Sparkles size={18} />
            </div>
            <div className="custom-controls">
              <div>
                <label className="field-label">Processing quality</label>
                <div className="segmented-control">
                  {['High', 'Standard', 'Fast'].map((q) => (
                    <button
                      key={q}
                      className={quality === q ? 'active' : ''}
                      onClick={() => setQuality(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="acoustic-preset" className="field-label">
                  Acoustic preset
                </label>
                <select
                  className="input-field"
                  id="acoustic-preset"
                  value={preset}
                  onChange={(e) => setPreset(e.target.value)}
                >
                  <option>Natural</option>
                  <option>Expressive</option>
                  <option>Studio clean</option>
                </select>
              </div>
              <div className="pitch-control">
                <label className="field-label">
                  Pitch offset
                  <span>
                    {pitch > 0 ? '+' : ''}
                    {pitch} st
                  </span>
                </label>
                <Slider
                  value={[pitch]}
                  min={-12}
                  max={12}
                  step={1}
                  onValueChange={([n]) => setPitch(n)}
                  aria-label="Custom voice pitch offset"
                />
                <div className="slider-labels">
                  <span>−12</span>
                  <span>+12</span>
                </div>
              </div>
            </div>
            <label className="consent-label">
              <Checkbox
                checked={consent}
                onCheckedChange={(value) => setConsent(value === true)}
                id="voice-consent"
              />
              <span>
                I own this voice or have explicit permission to use it. I will not use it for
                deceptive impersonation.
              </span>
            </label>
            <div className="custom-engine-warning">
              <Cpu size={16} />
              <div>
                <strong>AI inference is not connected</strong>
                <p>
                  Reference-based conversion requires a real pretrained voice-conversion model. No
                  fake result will be generated.
                </p>
              </div>
              <Badge>PHASE 1</Badge>
            </div>
            <div className="custom-transform-actions">
              <Button
                onClick={() => {
                  if (!reference) {
                    toast.error('Add a reference voice first.');
                    return;
                  }
                  if (!consent) {
                    toast.error('Confirm voice permission before continuing.');
                    return;
                  }
                  toast.error('AI conversion unavailable', {
                    description:
                      'A real inference backend must be connected. Your audio has not been converted.',
                  });
                  setConnectionOpen(true);
                }}
              >
                <Sparkles size={15} />
                Transform custom voice
                <ArrowRight size={15} />
              </Button>
              <Button
                variant="outline"
                disabled={!reference || !consent}
                onClick={() => setSaveOpen(true)}
              >
                <Plus size={15} />
                Save reference
              </Button>
            </div>
            <p className="custom-settings-note">
              Quality, preset, and pitch controls are frontend configuration only until the AI
              backend is connected.
            </p>
          </Panel>
        </div>
        <div className="custom-lab-aside">
          <Panel className="reference-tips">
            <span className="aside-eyebrow">GREAT INPUT. GREAT POSSIBILITIES.</span>
            <div className="reference-tips-icon">
              <AudioLines size={32} />
            </div>
            <h2>
              A little prep.
              <br />A better voice.
            </h2>
            <p>The best voice samples are clear, natural, and unmistakably you.</p>
            <div className="reference-tip">
              <span>
                <Headphones size={15} />
              </span>
              <div>
                <strong>Keep it quiet</strong>
                <p>No music, background chatter, or echo.</p>
              </div>
            </div>
            <div className="reference-tip">
              <span>
                <Mic size={15} />
              </span>
              <div>
                <strong>Just speak naturally</strong>
                <p>Stay close to the mic. Skip the effects.</p>
              </div>
            </div>
            <div className="reference-tip">
              <span>
                <AudioLines size={15} />
              </span>
              <div>
                <strong>A little goes a long way</strong>
                <p>10–30 seconds of continuous speech is ideal.</p>
              </div>
            </div>
          </Panel>
          <Panel className="reference-privacy">
            <ShieldCheck size={24} />
            <h3>Your voice. Your control.</h3>
            <p>No permanent storage. No hidden uploads. Your samples stay in this session.</p>
            <span>PERMISSION FIRST. ALWAYS.</span>
          </Panel>
          <button className="connection-guide-link" onClick={() => setConnectionOpen(true)}>
            How does AI conversion work?
            <ArrowUpRight size={13} />
          </button>
        </div>
      </div>
      <div className="section-title">
        <h2>Your reference profiles</h2>
        <span>SESSION-ONLY · {profiles.length} PROFILES</span>
      </div>
      {profiles.length ? (
        <div className="voice-profile-grid">
          {profiles.map((profile) => (
            <Panel className="voice-profile-card" key={profile.id}>
              <span className="profile-icon">
                <Mic size={23} />
              </span>
              <Dropdown
                trigger={
                  <button
                    className="icon-button profile-menu"
                    aria-label={`Options for ${profile.name}`}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                }
              >
                <DropdownItem
                  className="danger"
                  onSelect={() => {
                    deleteProfile(profile.id);
                    toast.success('Reference profile removed');
                  }}
                >
                  <Trash2 size={14} />
                  Delete reference profile
                </DropdownItem>
              </Dropdown>
              <h3>{profile.name}</h3>
              <p>REFERENCE AUDIO · {formatTime(profile.duration)}</p>
              <MiniWave color={profile.color} bars={42} />
              <div>
                <button
                  className="text-button"
                  onClick={() =>
                    playTrack({ id: profile.id, title: profile.name, url: profile.url })
                  }
                >
                  <Play size={11} />
                  Preview
                </button>
                <button
                  className="text-button"
                  onClick={() => {
                    setReference({
                      url: profile.url,
                      name: profile.name,
                      duration: profile.duration,
                      blob: profile.blob,
                    });
                    toast.success('Reference selected');
                  }}
                >
                  Use reference
                  <ArrowRight size={11} />
                </button>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <div className="reference-profiles-empty">
          <Mic size={18} />
          <p>
            Your next identity starts with a sample.
            <span>Upload a reference and save it to see it here.</span>
          </p>
        </div>
      )}
      <Modal
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title="Give this voice a name."
        description="Save a reference profile for this session. This does not create an AI-cloned voice."
      >
        <div className="save-profile-form">
          <label className="field-label" htmlFor="profile-name">
            Voice profile name
          </label>
          <input
            className="input-field"
            id="profile-name"
            autoFocus
            placeholder="e.g. My storytelling voice"
            maxLength={48}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveProfile();
            }}
          />
          <div className="modal-actions">
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveProfile}>
              <Check size={15} />
              Save reference
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={connectionOpen}
        onOpenChange={setConnectionOpen}
        title="Real voices need a real engine."
        description="This phase builds the complete frontend. No AI service or pretrained model is running yet."
      >
        <div className="help-steps">
          <div>
            <span>01</span>
            <div>
              <h4>Deploy a pretrained conversion model</h4>
              <p>
                The next phase evaluates Seed-VC, its license, inference quality, and GPU
                requirements.
              </p>
            </div>
          </div>
          <div>
            <span>02</span>
            <div>
              <h4>Connect the FastAPI endpoints</h4>
              <p>
                Temporary uploads and in-memory conversion jobs. No database or permanent audio
                storage.
              </p>
            </div>
          </div>
          <div>
            <span>03</span>
            <div>
              <h4>Convert and compare real audio</h4>
              <p>The frontend will show the actual result only when the inference job succeeds.</p>
            </div>
          </div>
        </div>
        <div className="info-box">
          <LockKeyhole size={18} />
          <p>
            Traditional effects in the Studio work locally now. Reference-based AI identity
            conversion is a separate, currently unavailable workflow.
          </p>
        </div>
        <Button className="full-width" onClick={() => setConnectionOpen(false)}>
          Understood
          <Check size={15} />
        </Button>
      </Modal>
    </div>
  );
}
