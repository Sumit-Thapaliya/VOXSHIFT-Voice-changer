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
import { effects, getEffect } from '@/lib/data';
import { cn, formatTime, downloadFile } from '@/lib/utils';
import { trimAudio } from '@/lib/audio';
export default function StudioPage() {
  const {
    selectedEffect,
    setSelectedEffect,
    source,
    setSource,
    reference,
    setReference,
    output,
    setOutput,
    player,
    playTrack,
    seek,
    volume,
    setVolume,
    addHistory,
  } = useStudio();
  const [recordOpen, setRecordOpen] = useState(false);
  const [trimOpen, setTrimOpen] = useState(false);
  const [trimRange, setTrimRange] = useState([0, source.duration]);
  const [trimming, setTrimming] = useState(false);
  const [waveTab, setWaveTab] = useState<'original' | 'converted'>('original');
  const [progress, setProgress] = useState(0);
  useEffect(() => setTrimRange([0, source.duration]), [source.duration, source.url]);
  useEffect(() => {
    if (!output) {
      setWaveTab('original');
      setProgress(0);
    }
  }, [output]);
  const effect = getEffect(selectedEffect);
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
              MODE 02 <span>—</span> CUSTOM VOICE
            </h2>
            <Link href="/custom-voice" aria-label="Open custom voice lab">
              <ArrowUpRight size={16} />
            </Link>
          </div>
          <p className="mode-description">A reference voice. An entirely new direction.</p>
          <UploadZone
            compact
            reference
            onAccepted={setReference}
            source={reference}
            title="Upload a voice sample"
          />
          <div className={cn('reference-visual', reference && 'reference-loaded')}>
            <MiniWave bars={58} color={reference ? '#a999ef' : '#6a7087'} seed={6} />
            <div>
              <span>
                {reference
                  ? `REFERENCE SAMPLE · ${formatTime(reference.duration)}`
                  : '5–30 SECONDS IS ALL IT TAKES'}
              </span>
              <Badge className={reference ? 'badge-green' : 'badge-muted'}>
                {reference ? 'SAMPLE READY' : 'REFERENCE AUDIO'}
              </Badge>
            </div>
          </div>
          <Link href="/custom-voice" className="custom-mode-link">
            Open the voice lab
            <span>
              AI CONNECTION REQUIRED
              <ArrowRight size={13} />
            </span>
          </Link>
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
          </div>
          <div className="conversion-privacy">
            <ShieldCheck size={11} />
            Local audio effects. Your files never leave your device.
          </div>
        </ContourPanel>
      </section>
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
