'use client';
import { useState, useEffect, useRef } from 'react';
import { ArrowRight, Sparkles, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useStudio } from './providers';
import { Button } from './ui';
import { getEffect, type Creation } from '@/lib/data';
import { transformAudio } from '@/lib/audio';
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
  const { source, selectedEffect, intensity, preferences, addCreation, addHistory, setOutput } =
    useStudio();
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const latest = useRef({ sourceUrl: source.url, effectId: selectedEffect });
  latest.current = { sourceUrl: source.url, effectId: selectedEffect };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const convert = async () => {
    if (processing) return;
    setProcessing(true);
    setProgress(5);
    onProgress?.(5);
    const timer = setInterval(() => {
      setProgress((p) => {
        const n = Math.min(87, p + 9);
        onProgress?.(n);
        return n;
      });
    }, 180);
    try {
      const result = await transformAudio(
        source.url,
        getEffect(selectedEffect),
        intensity,
        Number(preferences.sampleRate),
        preferences.normalize,
      );
      await new Promise((resolve) => setTimeout(resolve, 1300));
      const creation: Creation = {
        id: uid(),
        name: `${source.name.replace(/\.[^.]+$/, '')} · ${getEffect(selectedEffect).shortName}`,
        effectId: selectedEffect,
        url: URL.createObjectURL(result.blob),
        blob: result.blob,
        duration: result.duration,
        createdAt: new Date().toISOString(),
        favorite: false,
      };
      if (
        !mounted.current ||
        latest.current.sourceUrl !== source.url ||
        latest.current.effectId !== selectedEffect
      ) {
        URL.revokeObjectURL(creation.url);
        if (mounted.current) {
          setProgress(0);
          onProgress?.(0);
          toast.info('Your audio or preset changed. Convert again to use the new selection.');
        }
        return;
      }
      setProgress(100);
      onProgress?.(100);
      setOutput(creation);
      if (preferences.autoSave) addCreation(creation);
      addHistory({
        action: 'Voice transformed',
        type: 'conversion',
        detail: `${creation.name} · Local audio effect`,
        duration: creation.duration,
        status: 'Completed',
        creationId: creation.id,
      });
      onComplete?.(creation);
      toast.success('Your new sound is ready', {
        description: 'Processed locally. Download it to keep it.',
      });
    } catch (error) {
      if (mounted.current) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Could not convert this audio. Try another file.',
        );
        onProgress?.(0);
      }
    } finally {
      clearInterval(timer);
      if (mounted.current) setProcessing(false);
    }
  };
  return (
    <Button className={className} onClick={() => void convert()} disabled={processing}>
      {processing ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />}
      <span>{processing ? `Transforming… ${progress}%` : 'Convert voice'}</span>
      {!processing && <ArrowRight size={17} />}
    </Button>
  );
}
