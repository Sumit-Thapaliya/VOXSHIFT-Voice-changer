'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  Mic,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Scissors,
  MoreHorizontal,
  Download,
  ShieldCheck,
  Check,
  AudioLines,
  FileAudio,
  RotateCcw,
  Loader2,
  SlidersHorizontal,
  Wand2,
  Server,
  Cpu,
  Gauge,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStudio } from '@/components/providers';
import { Button, Badge, Modal, Slider, Tip, Dropdown, DropdownItem } from '@/components/ui';
import { VoiceGlyph } from '@/components/voice-glyph';
import { VoiceOrb, MiniWave } from '@/components/visuals';
import { ContourPanel } from '@/components/contour-panel';
import { UploadZone, RecordModal } from '@/components/upload-zone';
import { AudioWaveform } from '@/components/audio-player';
import { ConversionButton } from '@/components/conversion-button';
import { archetypes, effects, findVoice } from '@/lib/data';
import { describeChain } from '@/lib/dsp';
import { cn, formatTime, downloadFile } from '@/lib/utils';
import { trimAudio } from '@/lib/audio';
export default function StudioPage() {
  const {
    selectedEffect,
    setSelectedEffect,
    voices,
    activeVoice,
    chain,
    setChain,
    resetChain,
    source,
    setSource,
    output,
    player,
    playTrack,
    seek,
    volume,
    setVolume,
    addHistory,
    engineState,
    engineHealth,
    refreshEngine,
    preferences,
    savePreferences,
    saveCustomVoice,
    saveProject,
    polishAudio,
    renderVoice,
  } = useStudio();
  const [recordOpen, setRecordOpen] = useState(false);
  const [trimOpen, setTrimOpen] = useState(false);
  const [trimRange, setTrimRange] = useState([0, source.duration]);
  const [trimming, setTrimming] = useState(false);
  const [waveTab, setWaveTab] = useState<'original' | 'converted'>('original');
  const [progress, setProgress] = useState(0);
  const [polishing, setPolishing] = useState(false);
  const [saveVoiceOpen, setSaveVoiceOpen] = useState(false);
  const [voiceName, setVoiceName] = useState('');
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  useEffect(() => setTrimRange([0, source.duration]), [source.duration, source.url]);
  useEffect(() => {
    if (!output) {
      setWaveTab('original');
      setProgress(0);
    }
  }, [output]);
  const effect = findVoice(voices, selectedEffect);
  const modules = describeChain(chain);
  const sourceActive = player.id === 'source' && player.playing;
  const outputActive = !!output && player.id === output.id && player.playing;
  const toggleSource = () =>
    playTrack({ id: 'source', title: source.name.replace(/\.[^.]+$/, ''), url: source.url });
  const toggleOutput = () => {
    if (output)
      playTrack({ id: output.id, title: output.name, url: output.url, effectId: output.effectId });
  };
  const saveTrim = async () => {
    if (trimRange[1] - trimRange[0] < 1) {
      toast.error('Keep at least a second of audio.');
      return;
    }
    setTrimming(true);
    try {
      const result = await trimAudio(source.url, trimRange[0], trimRange[1]);
      setSource({
        url: URL.createObjectURL(result.blob),
        blob: result.blob,
        name: source.name.replace(/\.[^.]+$/, '') + '-trimmed.wav',
        duration: result.duration,
      });
      setTrimOpen(false);
      toast.success('Audio trimmed');
    } catch {
      toast.error('Could not trim this audio. Please try another file.');
    } finally {
      setTrimming(false);
    }
  };
  const compareAB = async () => {
    if (!output) return;
    playTrack({ id: 'source', title: source.name.replace(/\.[^.]+$/, ''), url: source.url });
    toast.info('Playing the original — the new voice follows', { duration: 2500 });
    window.setTimeout(() => {
      playTrack({ id: output.id, title: output.name, url: output.url, effectId: output.effectId });
      setWaveTab('converted');
    }, Math.min(6000, (source.duration + 0.4) * 1000));
  };
  const runPolish = async () => {
    if (polishing) return;
    setPolishing(true);
    const toastId = toast.loading('Cleaning up the audio…', {
      description: preferences.preferServer && engineState === 'online' ? 'Using the CPU engine' : 'Using your browser',
    });
    try {
      const outcome = await polishAudio(output ? { url: output.url, name: output.name, duration: output.duration, blob: output.blob } : source, (value, stage) =>
        setProgress(value),
      );
      const polished = {
        url: outcome.url,
        name: `${(output?.name || source.name).replace(/\.[^.]+$/, '')} · Polished`,
        duration: outcome.duration,
        blob: outcome.blob,
      };
      setSource(polished);
      addHistory({
        action: 'Audio polished',
        type: 'polish',
        detail: `${polished.name} · denoise, gate, loudness`,
        status: outcome.engine === 'server' ? 'Engine' : 'Browser',
        duration: outcome.duration,
      });
      toast.success('Polish applied', {
        id: toastId,
        description: outcome.metrics?.lufs ? `Now ${outcome.metrics.lufs.toFixed(1)} LUFS` : 'Denoised, gated and levelled',
      });
    } catch (error) {
      toast.error('The polish pass failed', { id: toastId, description: error instanceof Error ? error.message : undefined });
    } finally {
      setPolishing(false);
      setProgress(0);
    }
  };
  const confirmSaveVoice = async () => {
    const name = voiceName.trim();
    if (!name) return;
    const saved = await saveCustomVoice(
      {
        name,
        description: modules.length
          ? `${modules.length} modules: ${modules.map((module) => module.label).join(', ')}.`
          : 'A neutral voice, ready to shape.',
        color: effect.color || '#b597ee',
        tags: modules.slice(0, 3).map((module) => module.label),
        chain,
      },
      { persist: true },
    );
    setSaveVoiceOpen(false);
    setSelectedEffect(`custom:${saved.id}`);
    toast.success(`${name} saved to your voices`, {
      description: engineState === 'online' ? 'Available in My Creations and Voice Effects.' : 'Available for this session.',
    });
  };
  const download = () => {
    if (!output) return;
    downloadFile(output.url, `${output.name}.wav`);
    addHistory({
      action: 'Audio exported',
      type: 'export',
      detail: output.name,
      status: 'Downloaded',
      duration: output.duration,
      creationId: output.id,
    });
    toast.success('Your new voice, ready to keep');
  };
  return (
    <div className="studio-page">
      <section className="studio-hero">
        <div className="studio-heading">
          <span className="eyebrow">
            <i />
            HERO WORKSPACE
          </span>
          <h1>
            CHANGE YOUR VOICE. <br />
            <span>CHANGE YOUR WORLD.</span>
          </h1>
          <p>
            One voice. Infinite identities. <span>Make yours anything.</span>
          </p>
        </div>
      </section>
      <div className="studio-section-heading">
        <span>YOUR NEXT IDENTITY STARTS HERE</span>
        <Link href="/voice-effects">
          Find your sound
          <ArrowUpRight size={13} />
        </Link>
      </div>
      <section className="studio-grid" aria-label="Voice transformation modes">
        <ContourPanel className="effects-mode">
          <div className="mode-heading">
            <h2>
              MODE 01 <span>—</span> VOICE EFFECTS
            </h2>
            <Link href="/voice-effects" aria-label="Explore all voice effects">
              <ArrowUpRight size={16} />
            </Link>
          </div>
          <p className="mode-description">Ready-made transformations. Endless possibilities.</p>
          <div className="quick-voice-grid">
            {effects.slice(0, 10).map((voice) => (
              <button
                key={voice.id}
                className={cn('quick-voice', selectedEffect === voice.id && 'quick-voice-active')}
                style={{ '--voice-color': voice.color } as React.CSSProperties}
                onClick={() => setSelectedEffect(voice.id)}
                aria-pressed={selectedEffect === voice.id}
                aria-label={`Select ${voice.name}`}
              >
                <span className="quick-voice-icon">
                  <VoiceGlyph id={voice.id} size={29} />
                  {selectedEffect === voice.id && (
                    <i>
                      <Check size={8} />
                    </i>
                  )}
                </span>
                <span>{voice.shortName}</span>
              </button>
            ))}
          </div>
          <div className="mode-footer">
            <span>
              <i style={{ background: effect.color }} />
              {effect.name} selected
            </span>
            <Link href="/voice-effects">
              View all {effects.length}
              <ChevronTiny />
            </Link>
          </div>
        </ContourPanel>
        <VoiceOrb />
        <ContourPanel className="custom-mode">
          <div className="mode-heading">
            <h2>
              MODE 02 <span>—</span> VOICE FORGE
            </h2>
            <Link href="/voice-forge" aria-label="Open the voice forge">
              <ArrowUpRight size={16} />
            </Link>
          </div>
          <p className="mode-description">
            Sculpt a voice from scratch. Sixteen modules, one signature sound.
          </p>
          <div className="forge-quick-grid">
            {archetypes.slice(0, 4).map((archetype) => (
              <button
                key={archetype.id}
                className={cn('forge-quick', chain.pitch === archetype.chain.pitch && chain.ring === archetype.chain.ring && 'forge-quick-active')}
                style={{ '--voice-color': archetype.color } as React.CSSProperties}
                onClick={() => {
                  setChain(archetype.chain);
                  setSelectedEffect(`forge:${archetype.id}`);
                }}
              >
                <VoiceGlyph id={`forge:${archetype.id}`} size={22} />
                <span>{archetype.label}</span>
              </button>
            ))}
          </div>
          <div className="forge-chain-visual">
            <MiniWave bars={58} color={effect.color} seed={6} active={modules.length > 0} />
            <div>
              <span>
                {modules.length
                  ? `${modules.length} ACTIVE MODULE${modules.length > 1 ? 'S' : ''} · ${modules
                      .slice(0, 2)
                      .map((module) => module.label)
                      .join(' + ')}`
                  : 'NO MODULES ACTIVE YET'}
              </span>
              <Badge className={modules.length ? 'badge-green' : 'badge-muted'}>
                {modules.length ? 'DESIGN READY' : 'NEUTRAL VOICE'}
              </Badge>
            </div>
          </div>
          <div className="forge-quick-actions">
            <button
              className="text-button"
              onClick={() => {
                resetChain();
                setSelectedEffect('robot');
              }}
            >
              <RotateCcw size={11} />
              Reset design
            </button>
            <Link href="/voice-forge" className="custom-mode-link">
              Open the voice forge
              <span>
                {engineState === 'online' ? 'CPU ENGINE ONLINE' : 'LOCAL DSP · NO SERVER NEEDED'}
                <ArrowRight size={13} />
              </span>
            </Link>
          </div>
        </ContourPanel>
      </section>
      <section className="studio-bottom">
        <ContourPanel className="recording-panel">
          <div className="recording-heading">
            <h2>
              <Mic size={16} />
              AUDIO RECORDING STUDIO
            </h2>
            <Dropdown
              trigger={
                <button className="icon-button" aria-label="Audio options">
                  <MoreHorizontal size={18} />
                </button>
              }
            >
              <DropdownItem
                onSelect={() => {
                  setSource({
                    url: '/audio/sample.wav',
                    name: 'Welcome to VoxShift.wav',
                    duration: 12.8,
                  });
                  setWaveTab('original');
                  toast.info('Demo audio restored');
                }}
              >
                <RotateCcw size={14} />
                Restore demo audio
              </DropdownItem>
              <DropdownItem onSelect={() => setRecordOpen(true)}>
                <Mic size={14} />
                Record new audio
              </DropdownItem>
              <DropdownItem onSelect={() => setTrimOpen(true)}>
                <Scissors size={14} />
                Trim current audio
              </DropdownItem>
            </Dropdown>
          </div>
          <div className="recording-main">
            <div className="microphone-control">
              <button
                className="mic-button"
                onClick={() => setRecordOpen(true)}
                aria-label="Record audio"
              >
                <Mic size={31} strokeWidth={1.9} />
                <span />
              </button>
              <span>Record audio</span>
            </div>
            <UploadZone
              compact
              hideActions
              showDemo={false}
              onAccepted={setSource}
              title="Upload audio"
              className="source-upload"
            />
            <div className="recording-wave">
              <div className="wave-tabs">
                <button
                  className={waveTab === 'original' ? 'active' : ''}
                  onClick={() => setWaveTab('original')}
                >
                  ORIGINAL AUDIO
                </button>
                <button
                  className={waveTab === 'converted' ? 'active' : ''}
                  onClick={() => setWaveTab('converted')}
                  disabled={!output}
                >
                  CONVERTED AUDIO
                </button>
              </div>
              <div className="wave-surface">
                <AudioWaveform
                  url={waveTab === 'converted' && output ? output.url : source.url}
                  time={
                    waveTab === 'original' && player.id === 'source'
                      ? player.time
                      : waveTab === 'converted' && player.id === output?.id
                        ? player.time
                        : 0
                  }
                  onSeek={(time) => {
                    if (waveTab === 'original') {
                      if (player.id !== 'source') toggleSource();
                      seek(time);
                    } else if (output) {
                      if (player.id !== output.id) toggleOutput();
                      seek(time);
                    }
                  }}
                  height={72}
                />
              </div>
              <div className="wave-time">
                <span>0:00</span>
                <span>
                  <FileAudio size={10} />
                  {waveTab === 'converted' ? 'Converted voice' : source.name}
                </span>
                <span>
                  {formatTime(
                    waveTab === 'converted' && output ? output.duration : source.duration,
                  )}
                </span>
              </div>
            </div>
          </div>
          <div className="studio-timeline">
            <Slider
              aria-label="Recording playback position"
              value={[player.id === 'source' ? player.time : 0]}
              max={source.duration}
              step={0.1}
              onValueChange={([time]) => {
                if (player.id !== 'source') toggleSource();
                seek(time);
              }}
            />
          </div>
          <div className="recording-toolbar">
            <span className="recording-session">
              <i />
              SESSION AUDIO
            </span>
            <div className="studio-transport">
              <Tip label="Restart">
                <button className="icon-button" aria-label="Restart audio" onClick={() => seek(0)}>
                  <SkipBack size={16} />
                </button>
              </Tip>
              <button
                className="studio-play"
                aria-label={
                  waveTab === 'original'
                    ? sourceActive
                      ? 'Pause original audio'
                      : 'Play original audio'
                    : outputActive
                      ? 'Pause converted audio'
                      : 'Play converted audio'
                }
                onClick={waveTab === 'original' ? toggleSource : toggleOutput}
              >
                {(waveTab === 'original' ? sourceActive : outputActive) ? (
                  <Pause size={20} fill="currentColor" />
                ) : (
                  <Play size={20} fill="currentColor" />
                )}
              </button>
              <Tip label="Forward 5 seconds">
                <button
                  className="icon-button"
                  aria-label="Forward 5 seconds"
                  onClick={() => seek(player.time + 5)}
                >
                  <SkipForward size={16} />
                </button>
              </Tip>
            </div>
            <button className="trim-trigger" onClick={() => setTrimOpen(true)}>
              <Scissors size={13} />
              Trim
            </button>
            <div className="studio-volume">
              <Volume2 size={13} />
              <Slider
                aria-label="Studio volume"
                value={[volume]}
                max={1}
                step={0.01}
                onValueChange={([v]) => setVolume(v)}
              />
            </div>
          </div>
        </ContourPanel>
        <ContourPanel className="conversion-panel" tint="cyan">
          <div className="recording-heading">
            <h2>
              <Sparkles size={16} />
              CONVERSION OUTPUT
            </h2>
            <Badge className="output-effect" style={{ color: effect.color }}>
              {effect.shortName}
            </Badge>
          </div>
          <div className="conversion-pipeline">
            <span>ORIGINAL VOICE</span>
            <ArrowRight size={14} />
            <span>TRANSFORMATION</span>
            <ArrowRight size={14} />
            <span>NEW VOICE</span>
          </div>
          <div className="comparison-tracks">
            <div
              className={cn('comparison-track', 'original-track', sourceActive && 'track-playing')}
            >
              <MiniWave
                color="#6aa7f3"
                bars={49}
                active={sourceActive}
                seed={3}
                progress={player.id === 'source' ? player.time / source.duration : 0}
              />
              <div className="comparison-controls">
                <span>{formatTime(source.duration)}</span>
                <button
                  onClick={toggleSource}
                  aria-label={sourceActive ? 'Pause original voice' : 'Preview original voice'}
                >
                  {sourceActive ? (
                    <Pause size={12} fill="currentColor" />
                  ) : (
                    <Play size={12} fill="currentColor" />
                  )}
                </button>
                <span>ORIGINAL</span>
              </div>
            </div>
            <div
              className={cn(
                'comparison-track',
                'converted-track',
                !output && 'empty-output',
                outputActive && 'track-playing',
              )}
            >
              <MiniWave
                color={output ? '#6be7d5' : '#467c85'}
                bars={49}
                active={outputActive}
                seed={7}
                progress={output && player.id === output.id ? player.time / output.duration : 0}
              />
              {!output && <span className="output-placeholder">YOUR NEW VOICE AWAITS</span>}
              <div className="comparison-controls">
                <span>{output ? formatTime(output.duration) : '0:00'}</span>
                <button
                  disabled={!output}
                  onClick={toggleOutput}
                  aria-label={outputActive ? 'Pause new voice' : 'Preview new voice'}
                >
                  {outputActive ? (
                    <Pause size={12} fill="currentColor" />
                  ) : (
                    <Play size={12} fill="currentColor" />
                  )}
                </button>
                <span>{output ? 'CONVERTED' : 'NEW VOICE'}</span>
              </div>
            </div>
          </div>
          <div className="conversion-progress">
            <div>
              <span style={{ width: `${progress}%` }} />
            </div>
            <span>
              {progress > 0 && progress < 100
                ? 'PROCESSING AUDIO'
                : output
                  ? 'TRANSFORMATION COMPLETE'
                  : 'READY WHEN YOU ARE'}
            </span>
          </div>
          <div className="conversion-actions">
            <ConversionButton onProgress={setProgress} onComplete={() => setWaveTab('converted')} />
            <Tip label="Download converted audio">
              <Button
                variant="outline"
                size="icon"
                disabled={!output}
                onClick={download}
                aria-label="Download converted audio"
              >
                <Download size={17} />
              </Button>
            </Tip>
            <Tip label="Play the original, then the new voice">
              <Button
                variant="outline"
                size="icon"
                disabled={!output}
                onClick={() => void compareAB()}
                aria-label="Compare original and converted audio"
              >
                <Gauge size={17} />
              </Button>
            </Tip>
            <Tip label="Polish this audio: denoise, gate, loudness">
              <Button
                variant="outline"
                size="icon"
                onClick={() => void runPolish()}
                disabled={polishing}
                aria-label="Polish audio"
              >
                {polishing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              </Button>
            </Tip>
            <Tip label="Save this design as a custom voice">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setVoiceName(activeVoice.name);
                  setSaveVoiceOpen(true);
                }}
                aria-label="Save this voice design"
              >
                <Wand2 size={16} />
              </Button>
            </Tip>
            <Tip label="Save as a project on the engine">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setProjectName(source.name.replace(/\.[^.]+$/, ''));
                  setProjectOpen(true);
                }}
                aria-label="Save project"
              >
                <Save size={16} />
              </Button>
            </Tip>
          </div>
          <div className="engine-strip">
            <span className={cn('engine-badge', engineState === 'online' ? 'is-online' : 'is-local')}>
              {engineState === 'online' ? <Server size={11} /> : <Cpu size={11} />}
              {engineState === 'online'
                ? `CPU ENGINE · v${engineHealth?.version || '1.0'}`
                : engineState === 'checking'
                  ? 'LOOKING FOR AN ENGINE…'
                  : 'LOCAL BROWSER ENGINE'}
            </span>
            {engineHealth ? (
              <span>
                {engineHealth.cpu_count} CPU {engineHealth.cpu_count === 1 ? 'core' : 'cores'} ·{' '}
                {engineHealth.queue.queued + engineHealth.queue.running} job
                {engineHealth.queue.queued + engineHealth.queue.running === 1 ? '' : 's'} active
              </span>
            ) : (
              <span>Everything runs on this device — a server makes it faster, never required.</span>
            )}
            {engineState !== 'online' && (
              <button className="engine-strip-action" onClick={() => void refreshEngine()}>
                Retry
              </button>
            )}
          </div>
          {output?.metrics && (
            <div className="output-metrics">
              <span>
                LOUDNESS<strong>{output.metrics.lufs != null ? `${output.metrics.lufs.toFixed(1)} LUFS` : '—'}</strong>
              </span>
              <span>
                TRUE PEAK<strong>{output.metrics.peak_dbfs != null ? `${output.metrics.peak_dbfs.toFixed(1)} dB` : '—'}</strong>
              </span>
              <span>
                NOISE FLOOR
                <strong>
                  {output.metrics.noise_floor_dbfs != null ? `${output.metrics.noise_floor_dbfs.toFixed(0)} dB` : '—'}
                </strong>
              </span>
              <span>
                RENDERED BY<strong>{output.engine === 'server' ? 'CPU engine' : 'Your browser'}</strong>
              </span>
            </div>
          )}
          <div className="conversion-privacy">
            <ShieldCheck size={11} />
            {output?.engine === 'server'
              ? `Rendered by your own CPU engine · file expires in ${engineHealth?.limits.ttl_minutes ?? 360} minutes`
              : 'Designed locally with Web Audio DSP. Nothing leaves this device.'}
          </div>
        </ContourPanel>
      </section>
      <Modal
        open={saveVoiceOpen}
        onOpenChange={setSaveVoiceOpen}
        title="Keep this voice."
        description="Name your design, then use it anywhere in the studio."
      >
        <div className="save-profile-form">
          <label className="field-label" htmlFor="studio-voice-name">
            Voice name
          </label>
          <input
            id="studio-voice-name"
            className="input-field"
            autoFocus
            maxLength={48}
            value={voiceName}
            placeholder="e.g. Midnight anchor"
            onChange={(event) => setVoiceName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void confirmSaveVoice();
            }}
          />
          <p className="settings-field-note">
            Saves the {modules.length} active module{modules.length === 1 ? '' : 's'} of this design
            {engineState === 'online' ? ' to your engine library and this browser.' : ' to this browser.'}
          </p>
          <div className="modal-actions">
            <Button variant="outline" onClick={() => setSaveVoiceOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void confirmSaveVoice()} disabled={!voiceName.trim()}>
              <Wand2 size={15} />
              Save voice
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={projectOpen}
        onOpenChange={setProjectOpen}
        title="Save the session as a project."
        description="The engine stores your design, intensity and source details. Audio stays temporary."
      >
        <div className="save-profile-form">
          <label className="field-label" htmlFor="studio-project-name">
            Project name
          </label>
          <input
            id="studio-project-name"
            className="input-field"
            autoFocus
            maxLength={96}
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          />
          <div className="modal-actions">
            <Button variant="outline" onClick={() => setProjectOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                void saveProject(projectName.trim() || 'Untitled project');
                setProjectOpen(false);
              }}
            >
              <Save size={15} />
              Save project
            </Button>
          </div>
        </div>
      </Modal>
      <RecordModal
        open={recordOpen}
        onOpenChange={setRecordOpen}
        onAccepted={(audio) => {
          setSource(audio);
          setRecordOpen(false);
          setWaveTab('original');
        }}
      />
      <Modal
        open={trimOpen}
        onOpenChange={setTrimOpen}
        title="Keep the good part."
        description="Choose a start and end point. The rest stays behind."
      >
        <div className="trim-wave">
          <MiniWave bars={70} color="#87bded" seed={4} />
        </div>
        <div className="trim-labels">
          <span>
            START<strong>{formatTime(trimRange[0])}</strong>
          </span>
          <span>
            CLIP LENGTH<strong>{formatTime(trimRange[1] - trimRange[0])}</strong>
          </span>
          <span>
            END<strong>{formatTime(trimRange[1])}</strong>
          </span>
        </div>
        <Slider
          value={trimRange}
          min={0}
          max={source.duration}
          step={0.1}
          minStepsBetweenThumbs={10}
          onValueChange={setTrimRange}
          aria-label="Audio trim range"
        />
        <div className="modal-actions">
          <Button variant="outline" onClick={() => setTrimOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void saveTrim()} disabled={trimming}>
            {trimming ? <Loader2 size={15} className="animate-spin" /> : <Scissors size={15} />}
            Apply trim
          </Button>
        </div>
      </Modal>
    </div>
  );
}
function ChevronTiny() {
  return <ArrowUpRight size={11} />;
}
