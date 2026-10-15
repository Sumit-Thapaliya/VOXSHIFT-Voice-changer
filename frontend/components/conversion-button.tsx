'use client';
import { useState } from 'react';
import { ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useStudio } from './providers';
import { Button } from './ui';
import { type Creation } from '@/lib/data';
import { uid } from '@/lib/utils';

export function ConversionButton({
  className,
  onProgress,
  onComplete,
}: {
  className?: string;
  onProgress?: (progress: number) => void;
  onComplete?: (creation: Creation) => void;
}) {
  const {
    source,
    chain,
    activeVoice,
    intensity,
    preferences,
    addCreation,
    addHistory,
    setOutput,
    renderVoice,
    engineState,
  } = useStudio();
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');

  const convert = async () => {
    if (processing) return;
    setProcessing(true);
    setProgress(2);
    onProgress?.(2);
    try {
      const outcome = await renderVoice({
        onProgress: (value, nextStage) => {
          setProgress(Math.max(2, Math.min(99, value)));
          onProgress?.(Math.max(2, Math.min(99, value)));
          if (nextStage) setStage(nextStage);
        },
      });
      const creation: Creation = {
        id: uid(),
        name: `${source.name.replace(/\.[^.]+$/, '')} · ${activeVoice.shortName}`,
        effectId: activeVoice.id,
        url: outcome.url,
        blob: outcome.blob,
        duration: outcome.duration,
        createdAt: new Date().toISOString(),
        favorite: false,
        renderId: outcome.renderId,
        voiceName: activeVoice.name,
        chain,
        engine: outcome.engine,
        metrics: outcome.metrics,
      };
      setProgress(100);
      onProgress?.(100);
      setOutput(creation);
      if (preferences.autoSave) addCreation(creation);
      addHistory({
        action: 'Voice transformed',
        type: 'conversion',
        detail: `${creation.name} · ${outcome.engine === 'server' ? 'CPU engine' : 'browser engine'}`,
        duration: creation.duration,
        status: 'Completed',
        creationId: creation.id,
      });
      onComplete?.(creation);
      toast.success('Your new sound is ready', {
        description:
          outcome.engine === 'server'
            ? `Rendered by the engine${outcome.metrics?.lufs ? ` · ${outcome.metrics.lufs.toFixed(1)} LUFS` : ''}`
            : 'Processed locally in your browser',
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not transform this audio. Try another file.');
      setProgress(0);
      onProgress?.(0);
    } finally {
      setProcessing(false);
      setStage('');
    }
  };

  return (
    <Button className={className} onClick={() => void convert()} disabled={processing}>
      {processing ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
      <span>
        {processing
          ? stage
            ? `${stage}… ${progress}%`
            : `Transforming… ${progress}%`
          : `Convert voice · ${engineState === 'online' && preferences.preferServer ? 'engine' : 'local'}`}
      </span>
      {!processing && <ArrowRight size={17} />}
    </Button>
  );
}
