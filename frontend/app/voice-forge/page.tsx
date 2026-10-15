'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Mic,
  Upload,
  AudioLines,
  ShieldCheck,
  Check,
  ArrowRight,
  ArrowUpRight,
  Sparkles,
  Cpu,
  Server,
  Play,
  Pause,
  Trash2,
  Plus,
  Loader2,
  Headphones,
  Wand2,
  Dices,
  RotateCcw,
  SlidersHorizontal,
  Gauge,
  Activity,
  Save,
  Copy,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { useStudio } from '@/components/providers';
import { PageHeading } from '@/components/page-heading';
import {
  Button,
  Panel,
  Badge,
  Modal,
  Slider,
  Dropdown,
  DropdownItem,
  Tip,
} from '@/components/ui';
import { UploadZone } from '@/components/upload-zone';
import { MiniWave } from '@/components/visuals';
import { AudioWaveform } from '@/components/audio-player';
import { VoiceGlyph } from '@/components/voice-glyph';
import { cn, formatTime, downloadFile } from '@/lib/utils';
import { analyseLocal } from '@/lib/audio';
import {
  MODULE_RANGES,
  blendIntensity,
  describeChain,
  mergeChain,
  randomChain,
  type ModuleKey,
  type VoiceChain,
} from '@/lib/dsp';
import { archetypes, type CustomVoice } from '@/lib/data';
import * as engineApi from '@/lib/engine';

type ModuleSpec = { key: ModuleKey; label: string; group: string; unit: string; hint: string };

const moduleSpecs: ModuleSpec[] = [
  { key: 'pitch', label: 'Pitch', group: 'Identity', unit: 'st', hint: 'Moves the fundamental up or down without changing the length of the clip.' },
  { key: 'formant', label: 'Formant', group: 'Identity', unit: 'st', hint: 'Rescales the vocal-tract resonances: the part of the sound that says how big the speaker is.' },
  { key: 'body', label: 'Body', group: 'Tone', unit: '%', hint: 'Low shelf around 180 Hz. Weight, chest and authority.' },
  { key: 'presence', label: 'Presence', group: 'Tone', unit: '%', hint: 'Peak around 3.2 kHz. Intelligibility and forwardness.' },
  { key: 'air', label: 'Air', group: 'Tone', unit: '%', hint: 'High shelf around 8.5 kHz. Openness and sparkle.' },
  { key: 'warmth', label: 'Warmth', group: 'Character', unit: '%', hint: 'Soft saturation. Analogue thickness before distortion.' },
  { key: 'growl', label: 'Growl', group: 'Character', unit: '%', hint: 'Subharmonic generation plus asymmetric drive. Monster fuel.' },
  { key: 'ring', label: 'Ring', group: 'Character', unit: '%', hint: 'Ring modulation against a sine carrier: robotic and mechanical.' },
  { key: 'vibrato', label: 'Vibrato', group: 'Character', unit: '%', hint: 'Modulated delay-based pitch wobble.' },
  { key: 'breath', label: 'Breath', group: 'Character', unit: '%', hint: 'Airflow noise shaped by the voice envelope. Whisper textures.' },
  { key: 'gate', label: 'Gate', group: 'Dynamics', unit: '%', hint: 'Downward expansion of room noise between words.' },
  { key: 'comp', label: 'Compression', group: 'Dynamics', unit: '%', hint: 'Even, broadcast-like level control with make-up gain.' },
  { key: 'deess', label: 'De-esser', group: 'Dynamics', unit: '%', hint: 'Dynamic control of harsh sibilance between 5.5 and 9.5 kHz.' },
  { key: 'space', label: 'Space', group: 'Space', unit: '%', hint: 'Convolution reverb with a synthesised room impulse.' },
  { key: 'echo', label: 'Echo', group: 'Space', unit: '%', hint: 'Damped feedback delay for depth and drama.' },
];

const groups = ['Identity', 'Tone', 'Character', 'Dynamics', 'Space'];

/** One shape for both the engine report and the local browser report. */
type Report = {
  summary: string;
  register: string;
  cleanliness: string;
  pitchHz: number;
  pitchNote: string;
  rangeSemitones: number;
  lufs: number;
  peakDbfs: number;
  noiseFloorDbfs: number;
  low: number;
  mid: number;
  high: number;
  air: number;
  centroidHz: number;
  recommendations: { preset_id: string; label: string; reason: string; intensity: number }[];
};

function fromEngineReport(report: engineApi.EngineAnalysis): Report {
  return {
    summary: report.profile.summary,
    register: report.profile.register,
    cleanliness: report.profile.cleanliness,
    pitchHz: report.pitch.median_hz,
    pitchNote: report.pitch.median_note,
    rangeSemitones: report.pitch.range_semitones,
    lufs: report.lufs,
    peakDbfs: report.peak_dbfs,
    noiseFloorDbfs: report.noise_floor_dbfs,
    low: report.spectrum.low_ratio,
    mid: report.spectrum.mid_ratio,
    high: report.spectrum.high_ratio,
    air: report.spectrum.air_ratio,
    centroidHz: report.spectrum.centroid_hz,
    recommendations: report.recommendations || [],
  };
}

function fromLocalReport(report: Awaited<ReturnType<typeof analyseLocal>>): Report {
  return {
    summary: report.profile.summary,
    register: report.profile.register,
    cleanliness: report.profile.cleanliness,
    pitchHz: report.pitch.medianHz,
    pitchNote: report.pitch.medianNote,
    rangeSemitones: report.pitch.rangeSemitones,
    lufs: report.lufs,
    peakDbfs: report.peakDbfs,
    noiseFloorDbfs: report.noiseFloorDbfs,
    low: report.spectrum.lowRatio,
    mid: report.spectrum.midRatio,
    high: report.spectrum.highRatio,
    air: report.spectrum.airRatio,
    centroidHz: report.spectrum.centroidHz,
    recommendations: [],
  };
}

export default function VoiceForgePage() {
  const {
    source,
    setSource,
    chain,
    setChain,
    resetChain,
    activeVoice,
    intensity,
    setIntensity,
    customVoices,
    saveCustomVoice,
    deleteCustomVoice,
    updateCustomVoice,
    renderVoice,
    playTrack,
    player,
    engineState,
    engineHealth,
    refreshEngine,
    preferences,
    addHistory,
    addCreation,
    setSelectedEffect,
  } = useStudio();

  const [drama, setDrama] = useState(55);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState({ value: 0, stage: '' });
  const [rendered, setRendered] = useState<{ url: string; blob: Blob; duration: number; engine: 'server' | 'browser'; metrics?: Record<string, number | undefined> } | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [voiceName, setVoiceName] = useState('');
  const [voiceTags, setVoiceTags] = useState('');
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysis, setAnalysis] = useState<Report | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const modules = useMemo(() => describeChain(chain), [chain]);
  const activeCount = modules.length;
  const renderedActive = rendered && player.id === 'forge-render' && player.playing;

  useEffect(() => {
    // A new design invalidates the previous render.
    if (rendered && player.id !== 'forge-render') setRendered(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain]);

  const update = useCallback(
    (key: ModuleKey, value: number) => {
      setChain({ ...chain, [key]: value });
    },
    [chain, setChain],
  );

  const runAnalysis = useCallback(async () => {
    setAnalysing(true);
    setAnalysisOpen(true);
    try {
      if (engineState === 'online') {
        const blob = source.blob || (await (await fetch(source.url)).blob());
        const report = await engineApi.analyzeFile(blob, source.name);
        setAnalysis(fromEngineReport(report));
      } else {
        setAnalysis(fromLocalReport(await analyseLocal(source.url)));
      }
    } catch (error) {
      toast.error('Could not analyse this audio', { description: error instanceof Error ? error.message : undefined });
      setAnalysisOpen(false);
    } finally {
      setAnalysing(false);
    }
  }, [engineState, source]);

  const renderPreview = async () => {
    setRendering(true);
    setProgress({ value: 3, stage: 'Starting' });
    const toastId = toast.loading('Forging your voice…', {
      description: preferences.preferServer && engineState === 'online' ? 'CPU engine' : 'Your browser DSP',
    });
    try {
      const outcome = await renderVoice({
        onProgress: (value, stage) => setProgress({ value, stage }),
      });
      setRendered({ url: outcome.url, blob: outcome.blob, duration: outcome.duration, engine: outcome.engine, metrics: outcome.metrics });
      playTrack({ id: 'forge-render', title: `${activeVoice.name} · forged`, url: outcome.url, effectId: activeVoice.id });
      addHistory({
        action: 'Voice forged',
        type: 'conversion',
        detail: `${activeVoice.name} · ${activeCount} modules`,
        status: outcome.engine === 'server' ? 'Engine' : 'Browser',
        duration: outcome.duration,
      });
      toast.success('Here is your new voice', {
        id: toastId,
        description: outcome.engine === 'server' ? 'Rendered by the CPU engine' : 'Rendered locally in your browser',
      });
    } catch (error) {
      toast.error('The forge could not finish this voice', {
        id: toastId,
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setRendering(false);
      setProgress({ value: 0, stage: '' });
    }
  };

  const keepVoice = async () => {
    const name = voiceName.trim();
    if (!name) return;
    const saved = await saveCustomVoice(
      {
        name,
        description: `${activeCount} modules: ${modules.map((module) => module.label).join(', ') || 'neutral design'}.`,
        color: activeVoice.color || '#b597ee',
        tags: voiceTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 5),
        chain,
      },
      { persist: true },
    );
    setSelectedEffect(`custom:${saved.id}`);
    setSaveOpen(false);
    setVoiceName('');
    setVoiceTags('');
    toast.success(`${name} added to your voice library`, {
      description: saved.serverId ? 'Stored on your engine and in this browser.' : 'Stored in this browser session.',
    });
  };

  const applyArchetype = (archetypeId: string) => {
    const archetype = archetypes.find((item) => item.id === archetypeId);
    if (!archetype) return;
    setChain(archetype.chain);
    setSelectedEffect(`forge:${archetype.id}`);
    toast.success(`${archetype.label} loaded into the forge`);
  };

  const downloadRender = () => {
    if (!rendered) return;
    downloadFile(rendered.url, `${activeVoice.name.replace(/\s+/g, '-').toLowerCase()}-forge.wav`);
    addHistory({ action: 'Audio exported', type: 'export', detail: `${activeVoice.name} · forge render`, status: 'Downloaded', duration: rendered.duration });
    toast.success('WAV downloaded');
  };

  const keepAsCreation = () => {
    if (!rendered) return;
    addCreation({
      id: `forge-${Date.now()}`,
      name: `${source.name.replace(/\.[^.]+$/, '')} · ${activeVoice.shortName}`,
      effectId: activeVoice.id,
      url: rendered.url,
      blob: rendered.blob,
      duration: rendered.duration,
      createdAt: new Date().toISOString(),
      favorite: false,
      voiceName: activeVoice.name,
      chain,
      engine: rendered.engine,
      metrics: rendered.metrics as never,
    });
    toast.success('Saved to My Creations');
  };

  const report = analysis;

  return (
    <div className="custom-voice-page forge-page">
      <PageHeading
        eyebrow="THE VOICE FORGE"
        title="Design a voice. No samples needed."
        description="Fifteen hands-on DSP modules plus fine controls, one signature sound. Sculpt it, hear it on your own speech, keep it forever."
      >
        <Badge className="badge-violet custom-beta">
          <Wand2 size={11} />
          NO GPU · NO CLONING
        </Badge>
      </PageHeading>

      <div className="custom-stepper">
        <span className={cn('stepper-step', activeCount > 0 && 'stepper-complete')}>
          <i>{activeCount > 0 ? <Check size={11} /> : '01'}</i>Design
        </span>
        <span className="stepper-line" />
        <span className={cn('stepper-step', rendered && 'stepper-complete')}>
          <i>{rendered ? <Check size={11} /> : '02'}</i>Listen
        </span>
        <span className="stepper-line" />
        <span className={cn('stepper-step', customVoices.length > 0 && 'stepper-complete')}>
          <i>{customVoices.length > 0 ? <Check size={11} /> : '03'}</i>Keep
        </span>
        <span className="stepper-caption">
          {engineState === 'online'
            ? `ENGINE v${engineHealth?.version ?? '1.0'} · ${engineHealth?.cpu_count ?? 0} CPU`
            : 'LOCAL ENGINE · WORKS OFFLINE'}
        </span>
      </div>

      <div className="custom-lab-layout">
        <div className="custom-lab-main">
          <Panel className="custom-step-panel forge-modules-panel">
            <div className="step-panel-heading">
              <div>
                <span>STEP 01</span>
                <h2>Sculpt the voice.</h2>
              </div>
              <Badge className={activeCount ? 'badge-green' : 'badge-muted'}>
                {activeCount ? `${activeCount} MODULES ACTIVE` : 'NEUTRAL DESIGN'}
              </Badge>
            </div>
            <p className="step-panel-description">
              Every slider is a real signal-processing stage. Start from an archetype, or roll the
              dice and adjust what you like.
            </p>

            <div className="forge-toolbar">
              <div className="forge-archetypes">
                {archetypes.map((archetype) => (
                  <button
                    key={archetype.id}
                    className={cn('forge-chip', JSON.stringify(archetype.chain) === JSON.stringify(chain) && 'forge-chip-active')}
                    style={{ '--voice-color': archetype.color } as React.CSSProperties}
                    onClick={() => applyArchetype(archetype.id)}
                    title={archetype.description}
                  >
                    <VoiceGlyph id={`forge:${archetype.id}`} size={16} />
                    {archetype.label}
                  </button>
                ))}
              </div>
              <div className="forge-toolbar-actions">
                <label className="forge-drama">
                  <span>Drama</span>
                  <Slider
                    aria-label="Randomiser drama"
                    value={[drama]}
                    min={10}
                    max={100}
                    step={5}
                    onValueChange={([value]) => setDrama(value)}
                  />
                  <strong>{drama}%</strong>
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setChain(randomChain(Date.now() % 100000, drama));
                    setSelectedEffect('custom:unsaved');
                    toast.success('A new voice appeared. Keep rolling until it fits.');
                  }}
                >
                  <Dices size={14} />
                  Roll the dice
                </Button>
                <Button variant="ghost" size="sm" onClick={() => resetChain()}>
                  <RotateCcw size={14} />
                  Clear
                </Button>
              </div>
            </div>

            <div className="forge-module-groups">
              {groups.map((group) => (
                <div className="forge-module-group" key={group}>
                  <span className="forge-group-label">{group}</span>
                  <div className="forge-module-grid">
                    {moduleSpecs
                      .filter((spec) => spec.group === group)
                      .map((spec) => (
                        <div className="forge-module" key={spec.key}>
                          <div className="forge-module-head">
                            <label htmlFor={`module-${spec.key}`}>{spec.label}</label>
                            <span>
                              {spec.key === 'pitch' || spec.key === 'formant'
                                ? `${chain[spec.key] > 0 ? '+' : ''}${Number(chain[spec.key]).toFixed(1)} ${spec.unit}`
                                : `${Math.round(Number(chain[spec.key]))}${spec.unit}`}
                            </span>
                          </div>
                          <Slider
                            id={`module-${spec.key}`}
                            aria-label={`${spec.label} amount`}
                            value={[Number(chain[spec.key])]}
                            min={MODULE_RANGES[spec.key][0]}
                            max={MODULE_RANGES[spec.key][1]}
                            step={spec.key === 'pitch' || spec.key === 'formant' ? 0.5 : 1}
                            onValueChange={([value]) => update(spec.key, value)}
                          />
                          <p>{spec.hint}</p>
                          {(spec.key === 'ring' || spec.key === 'echo' || spec.key === 'vibrato') && Number(chain[spec.key]) > 0.5 && (
                            <div className="forge-module-extra">
                              <span>
                                {spec.key === 'ring' ? 'Carrier' : spec.key === 'echo' ? 'Delay' : 'Rate'}
                              </span>
                              <Slider
                                aria-label={`${spec.label} detail`}
                                value={[Number(chain[spec.key === 'ring' ? 'ringFreq' : spec.key === 'echo' ? 'echoTime' : 'vibratoRate'])]}
                                min={MODULE_RANGES[spec.key === 'ring' ? 'ringFreq' : spec.key === 'echo' ? 'echoTime' : 'vibratoRate'][0]}
                                max={MODULE_RANGES[spec.key === 'ring' ? 'ringFreq' : spec.key === 'echo' ? 'echoTime' : 'vibratoRate'][1]}
                                step={spec.key === 'vibrato' ? 0.2 : 1}
                                onValueChange={([value]) =>
                                  update(spec.key === 'ring' ? 'ringFreq' : spec.key === 'echo' ? 'echoTime' : 'vibratoRate', value)
                                }
                              />
                              <strong>
                                {Math.round(
                                  Number(chain[spec.key === 'ring' ? 'ringFreq' : spec.key === 'echo' ? 'echoTime' : 'vibratoRate']),
                                )}
                                {spec.key === 'vibrato' ? ' Hz' : spec.key === 'ring' ? ' Hz' : ' ms'}
                              </strong>
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="custom-step-panel source-step-panel">
            <div className="step-panel-heading">
              <div>
                <span>STEP 02</span>
                <h2>Hear it on your own speech.</h2>
              </div>
              <Badge className="badge-cyan">SOURCE AUDIO</Badge>
            </div>
            <p className="step-panel-description">
              Upload or record a clip. Your audio is transformed by the design above — never imitated
              from someone else.
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
                progress={player.id === 'source' && player.duration ? player.time / player.duration : 0}
              />
              <span>{formatTime(source.duration)}</span>
            </div>

            <div className="forge-render-row">
              <div className="forge-intensity">
                <label className="field-label">
                  Design intensity
                  <span>{intensity}%</span>
                </label>
                <Slider
                  aria-label="Design intensity"
                  value={[intensity]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={([value]) => setIntensity(value)}
                />
                <div className="slider-labels">
                  <span>SUBTLE</span>
                  <span>FULL</span>
                </div>
              </div>
              <Button onClick={() => void renderPreview()} disabled={rendering} className="forge-render-button">
                {rendering ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                {rendering ? `${progress.stage || 'Forging'}… ${progress.value}%` : 'Forge this voice'}
              </Button>
            </div>

            {rendering && (
              <div className="conversion-progress">
                <div>
                  <span style={{ width: `${progress.value}%` }} />
                </div>
                <span>{(progress.stage || 'PROCESSING AUDIO').toUpperCase()}</span>
              </div>
            )}

            {rendered && (
              <div className="forge-result">
                <div className="forge-result-head">
                  <span>
                    <AudioLines size={13} />
                    {activeVoice.name} · {formatTime(rendered.duration)}
                  </span>
                  <Badge className={rendered.engine === 'server' ? 'badge-green' : 'badge-violet'}>
                    {rendered.engine === 'server' ? 'CPU ENGINE' : 'BROWSER DSP'}
                  </Badge>
                </div>
                <AudioWaveform url={rendered.url} time={player.id === 'forge-render' ? player.time : 0} height={64} />
                <div className="forge-result-actions">
                  <button
                    className="small-audio-play"
                    onClick={() => playTrack({ id: 'forge-render', title: `${activeVoice.name} · forged`, url: rendered.url })}
                    aria-label={renderedActive ? 'Pause forged voice' : 'Play forged voice'}
                  >
                    {renderedActive ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                  </button>
                  <Tip label="Download the WAV">
                    <button className="text-button" onClick={downloadRender}>
                      <Download size={12} />
                      Download
                    </button>
                  </Tip>
                  <button className="text-button" onClick={keepAsCreation}>
                    <Plus size={12} />
                    Add to creations
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      resetChain();
                      setSelectedEffect('robot');
                      playTrack({ id: 'source', title: source.name, url: source.url });
                    }}
                  >
                    <RotateCcw size={12} />
                    Hear the original
                  </button>
                </div>
              </div>
            )}

            <div className="forge-analysis-row">
              <Button variant="outline" size="sm" onClick={() => void runAnalysis()} disabled={analysing}>
                {analysing ? <Loader2 size={13} className="animate-spin" /> : <Activity size={13} />}
                Analyse my audio
              </Button>
              <span>
                {engineState === 'online' ? 'Engine analysis: pitch, loudness, noise floor, recommendations.' : 'Local analysis with the browser DSP.'}
              </span>
            </div>
          </Panel>

          <Panel className="custom-step-panel transform-step-panel">
            <div className="step-panel-heading">
              <div>
                <span>STEP 03</span>
                <h2>Keep it in your library.</h2>
              </div>
              <Sparkles size={18} />
            </div>
            <p className="step-panel-description">
              Saved voices appear in the Studio, the Voice Effects library and every future session
              {engineState === 'online' ? ' — stored on your engine and in this browser.' : ' in this browser.'}
            </p>
            <div className="forge-keep-preview">
              {(Object.keys(MODULE_RANGES) as ModuleKey[])
                .filter((key) => Math.abs(Number(chain[key])) > 0.5 && key !== 'ringFreq' && key !== 'echoTime' && key !== 'vibratoRate')
                .slice(0, 8)
                .map((key) => (
                  <span key={key} className="forge-summary-chip">
                    {moduleSpecs.find((spec) => spec.key === key)?.label || key}
                    <strong>
                      {key === 'pitch' || key === 'formant'
                        ? `${Number(chain[key]) > 0 ? '+' : ''}${Number(chain[key]).toFixed(1)}`
                        : Math.round(Number(chain[key]))}
                    </strong>
                  </span>
                ))}
              {activeCount === 0 && <span className="forge-summary-empty">Every module is neutral. Move a slider to begin.</span>}
            </div>
            <div className="custom-transform-actions">
              <Button
                onClick={() => {
                  setVoiceName(`Forged voice ${customVoices.length + 1}`);
                  setSaveOpen(true);
                }}
              >
                <Save size={15} />
                Save this voice
                <ArrowRight size={15} />
              </Button>
              <Button
                variant="outline"
                disabled={!rendered}
                onClick={() => {
                  if (!rendered) return;
                  void (async () => {
                    const outcome = await renderVoice({ intensity: Math.min(100, intensity + 25) });
                    downloadFile(outcome.url, `${activeVoice.name.replace(/\s+/g, '-').toLowerCase()}-strong.wav`);
                    toast.success('Stronger version downloaded');
                  })();
                }}
              >
                <Gauge size={15} />
                Download +25%
              </Button>
            </div>
            <p className="custom-settings-note">
              Deterministic DSP: the same design always produces the same voice. Nothing is uploaded
              unless your engine is connected, and expires on its own.
            </p>
          </Panel>
        </div>

        <div className="custom-lab-aside">
          <Panel className="reference-tips">
            <span className="aside-eyebrow">HOW THE FORGE WORKS</span>
            <div className="reference-tips-icon">
              <SlidersHorizontal size={30} />
            </div>
            <h2>
              Real DSP.
              <br />
              Real voices.
            </h2>
            <p>
              Reference cloning needs a GPU and a trained model. Design does not: pitch and formant
              shifting, tone sculpting and dynamics are exact signal processing.
            </p>
            <div className="reference-tip">
              <span>
                <Wand2 size={15} />
              </span>
              <div>
                <strong>Design, don&apos;t imitate</strong>
                <p>No reference sample, no impersonation, no permission problem.</p>
              </div>
            </div>
            <div className="reference-tip">
              <span>
                <Cpu size={15} />
              </span>
              <div>
                <strong>Runs on a laptop</strong>
                <p>{engineState === 'online' ? 'Your engine is 10–20× faster than real time on CPU.' : 'The browser DSP works offline; connect the engine for extra speed.'}</p>
              </div>
            </div>
            <div className="reference-tip">
              <span>
                <AudioLines size={15} />
              </span>
              <div>
                <strong>Keep the natural take</strong>
                <p>Formant preservation keeps the performance recognisable while the identity changes.</p>
              </div>
            </div>
          </Panel>

          <Panel className="reference-privacy">
            <ShieldCheck size={24} />
            <h3>Your voice. Your rules.</h3>
            <p>
              Effects are deterministic and applied to audio you already own. Nothing is trained on
              your recordings, and no model ever leaves your machine.
            </p>
            <span>NO GPU. NO CLOUD. NO CLONING.</span>
          </Panel>

          <div className="forge-aside-status">
            <span className={cn('engine-badge', engineState === 'online' ? 'is-online' : 'is-local')}>
              {engineState === 'online' ? <Server size={11} /> : <Cpu size={11} />}
              {engineState === 'online' ? 'ENGINE ONLINE' : 'LOCAL MODE'}
            </span>
            <button className="connection-guide-link" onClick={() => setInfoOpen(true)}>
              How this works without a GPU
              <ArrowUpRight size={13} />
            </button>
            {engineState !== 'online' && (
              <button className="connection-guide-link" onClick={() => void refreshEngine()}>
                Look for the engine again
                <RotateCcw size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="section-title">
        <h2>Your forged voices</h2>
        <span>
          {engineState === 'online' ? 'ENGINE + BROWSER' : 'BROWSER SESSION'} · {customVoices.length}{' '}
          {customVoices.length === 1 ? 'VOICE' : 'VOICES'}
        </span>
      </div>
      {customVoices.length ? (
        <div className="voice-profile-grid">
          {customVoices.map((voice) => (
            <VoiceCard
              key={voice.id}
              voice={voice}
              active={activeVoice.id === `custom:${voice.id}`}
              onUse={() => {
                setChain(voice.chain);
                setSelectedEffect(`custom:${voice.id}`);
                toast.success(`${voice.name} is now active`);
              }}
              onDuplicate={() => {
                setChain(voice.chain);
                setVoiceName(`${voice.name} copy`);
                setSaveOpen(true);
              }}
              onRename={(name) => {
                updateCustomVoice(voice.id, { name });
                toast.success('Voice renamed');
              }}
              onDelete={() => {
                void deleteCustomVoice(voice.id);
                toast.success('Voice removed');
              }}
              onDownload={() => {
                void (async () => {
                  const outcome = await renderVoice({ chain: voice.chain, name: voice.name });
                  downloadFile(outcome.url, `${voice.name.replace(/\s+/g, '-').toLowerCase()}.wav`);
                  toast.success('Voice exemplar downloaded');
                })();
              }}
            />
          ))}
        </div>
      ) : (
        <div className="reference-profiles-empty">
          <Wand2 size={18} />
          <p>
            No saved voices yet.
            <span>Design something above and tap “Save this voice” to keep it.</span>
          </p>
        </div>
      )}

      <Modal
        open={saveOpen}
        onOpenChange={setSaveOpen}
        title="Give this voice a name."
        description="It will appear in the Studio, the voice library and your next session."
      >
        <div className="save-profile-form">
          <label className="field-label" htmlFor="forge-voice-name">
            Voice name
          </label>
          <input
            className="input-field"
            id="forge-voice-name"
            autoFocus
            maxLength={48}
            placeholder="e.g. Neon narrator"
            value={voiceName}
            onChange={(event) => setVoiceName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void keepVoice();
            }}
          />
          <label className="field-label" htmlFor="forge-voice-tags">
            Tags (comma separated)
          </label>
          <input
            className="input-field"
            id="forge-voice-tags"
            maxLength={120}
            placeholder="narration, warm, low"
            value={voiceTags}
            onChange={(event) => setVoiceTags(event.target.value)}
          />
          <div className="modal-actions">
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void keepVoice()} disabled={!voiceName.trim()}>
              <Check size={15} />
              Save voice
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={analysisOpen}
        onOpenChange={setAnalysisOpen}
        title="What this clip can become."
        description={
          engineState === 'online'
            ? 'Measured by the CPU engine: pitch, loudness, noise floor and spectral balance.'
            : 'Measured locally in your browser.'
        }
      >
        {analysing && (
          <div className="forge-analysis-loading">
            <Loader2 size={18} className="animate-spin" />
            Reading your recording…
          </div>
        )}
        {!analysing && report && (
          <div className="forge-analysis">
            <p className="forge-analysis-summary">{report.summary}</p>
            <div className="forge-analysis-grid">
              <span>
                Pitch<strong>{report.pitchHz ? `${Math.round(report.pitchHz)} Hz` : '—'}</strong>
                <small>{report.pitchNote}</small>
              </span>
              <span>
                Register<strong>{report.register}</strong>
                <small>{report.rangeSemitones.toFixed(1)} st range</small>
              </span>
              <span>
                Loudness<strong>{report.lufs.toFixed(1)} LUFS</strong>
                <small>peak {report.peakDbfs.toFixed(1)} dB</small>
              </span>
              <span>
                Noise floor<strong>{report.noiseFloorDbfs.toFixed(0)} dB</strong>
                <small>{report.cleanliness}</small>
              </span>
            </div>
            <div className="forge-analysis-spectrum">
              <span>
                LOW<strong>{Math.round(report.low * 100)}%</strong>
              </span>
              <span>
                MID<strong>{Math.round(report.mid * 100)}%</strong>
              </span>
              <span>
                HIGH<strong>{Math.round(report.high * 100)}%</strong>
              </span>
              <span>
                AIR<strong>{Math.round(report.air * 100)}%</strong>
              </span>
              <span>
                CENTROID<strong>{Math.round(report.centroidHz)} Hz</strong>
              </span>
            </div>
            {report.recommendations.length > 0 && (
              <div className="forge-recommendations">
                <span className="field-eyebrow">SUGGESTED FOR THIS RECORDING</span>
                {report.recommendations.map((recommendation) => (
                  <div key={recommendation.preset_id}>
                    <div>
                      <strong>{recommendation.label}</strong>
                      <p>{recommendation.reason}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedEffect(recommendation.preset_id);
                        setIntensity(recommendation.intensity);
                        setAnalysisOpen(false);
                        toast.success(`${recommendation.label} loaded with the suggested intensity`);
                      }}
                    >
                      Apply
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="info-box">
              <Activity size={18} />
              <p>
                These are measurements of your recording, not guesses about who is speaking. Nothing
                here identifies a person or stores a voiceprint.
              </p>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={infoOpen}
        onOpenChange={setInfoOpen}
        title="Design instead of cloning."
        description="Why VOXSHIFT does not need a GPU, a dataset or someone else's voice."
      >
        <div className="help-steps">
          <div>
            <span>01</span>
            <div>
              <h4>Cloning needs a model</h4>
              <p>
                Reference-voice conversion trains or runs a neural network on a GPU and needs a sample
                of someone&apos;s voice. That is expensive, slow and a consent problem.
              </p>
            </div>
          </div>
          <div>
            <span>02</span>
            <div>
              <h4>Design needs arithmetic</h4>
              <p>
                A phase vocoder shifts pitch without changing duration; a cepstral envelope warp
                rescales the vocal tract; filters, dynamics and reverb finish the character. All of it
                is deterministic and runs on CPU.
              </p>
            </div>
          </div>
          <div>
            <span>03</span>
            <div>
              <h4>You keep control</h4>
              <p>
                The result is a transformed version of audio you already own. Same input, same design,
                same output — reproducible and downloadable as WAV.
              </p>
            </div>
          </div>
        </div>
        <div className="info-box">
          <ShieldCheck size={18} />
          <p>
            {engineState === 'online'
              ? 'Your engine is connected. Uploads are written to a temporary folder and expire automatically.'
              : 'No server is connected. Everything you hear right now was processed inside this browser tab.'}
          </p>
        </div>
        <Button className="full-width" onClick={() => setInfoOpen(false)}>
          Back to forging
          <ArrowRight size={15} />
        </Button>
      </Modal>
    </div>
  );
}

function VoiceCard({
  voice,
  active,
  onUse,
  onDuplicate,
  onRename,
  onDelete,
  onDownload,
}: {
  voice: CustomVoice;
  active: boolean;
  onUse: () => void;
  onDuplicate: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onDownload: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(voice.name);
  const modules = describeChain(voice.chain);
  return (
    <Panel className={cn('voice-profile-card', active && 'voice-profile-active')}>
      <span className="profile-icon" style={{ color: voice.color, borderColor: `${voice.color}44`, background: `${voice.color}14` }}>
        <VoiceGlyph id={`custom:${voice.id}`} size={21} />
      </span>
      <Dropdown
        trigger={
          <button className="icon-button profile-menu" aria-label={`Options for ${voice.name}`}>
            <SlidersHorizontal size={16} />
          </button>
        }
      >
        <DropdownItem onSelect={onUse}>
          <Check size={14} />
          Use this voice
        </DropdownItem>
        <DropdownItem onSelect={onDownload}>
          <Download size={14} />
          Download exemplar
        </DropdownItem>
        <DropdownItem onSelect={onDuplicate}>
          <Copy size={14} />
          Duplicate into the forge
        </DropdownItem>
        <DropdownItem
          onSelect={() => {
            setDraft(voice.name);
            setRenaming(true);
          }}
        >
          <Plus size={14} />
          Rename voice
        </DropdownItem>
        <DropdownItem className="danger" onSelect={onDelete}>
          <Trash2 size={14} />
          Delete voice
        </DropdownItem>
      </Dropdown>
      <h3>{voice.name}</h3>
      <p>
        {modules.length} MODULES · {voice.serverId ? 'ON ENGINE' : 'THIS BROWSER'}
      </p>
      <MiniWave color={voice.color} bars={42} seed={voice.name.length} />
      <div>
        <button className="text-button" onClick={onUse}>
          <Check size={11} />
          Use
        </button>
        <button className="text-button" onClick={onDuplicate}>
          Edit
          <ArrowRight size={11} />
        </button>
      </div>
      <Modal
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename this voice."
        description="The design stays exactly the same."
      >
        <div className="save-profile-form">
          <label className="field-label" htmlFor={`rename-${voice.id}`}>
            Voice name
          </label>
          <input
            id={`rename-${voice.id}`}
            className="input-field"
            autoFocus
            value={draft}
            maxLength={48}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && draft.trim()) {
                onRename(draft.trim());
                setRenaming(false);
              }
            }}
          />
          <div className="modal-actions">
            <Button variant="outline" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (draft.trim()) {
                  onRename(draft.trim());
                  setRenaming(false);
                }
              }}
            >
              Save name
            </Button>
          </div>
        </div>
      </Modal>
    </Panel>
  );
}
