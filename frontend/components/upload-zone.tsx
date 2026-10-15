'use client';
import { useRef, useState, useEffect } from 'react';
import {
  Upload,
  Mic,
  FileAudio,
  Check,
  Loader2,
  Square,
  RotateCcw,
  Play,
  ShieldCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button, Modal } from './ui';
import { MiniWave } from './visuals';
import { getAudioDuration } from '@/lib/audio';
import type { AudioSource } from '@/lib/data';
import { cn, formatTime } from '@/lib/utils';
import { z } from 'zod';
const fileSchema = z.object({
  size: z.number().max(30 * 1024 * 1024, 'Please use a file smaller than 30 MB.'),
  name: z
    .string()
    .regex(/\.(wav|mp3|m4a|ogg|webm|aac|flac)$/i, 'Use a WAV, MP3, M4A, OGG, or WebM audio file.'),
});
export function UploadZone({
  onAccepted,
  compact = false,
  className,
  title,
  source,
  showDemo = true,
  hideActions = false,
  description,
}: {
  onAccepted: (audio: AudioSource) => void;
  compact?: boolean;
  className?: string;
  title?: string;
  source?: AudioSource | null;
  showDemo?: boolean;
  hideActions?: boolean;
  description?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const accept = async (file: File) => {
    const validation = fileSchema.safeParse(file);
    if (!validation.success) {
      toast.error(validation.error.issues[0].message);
      return;
    }
    setLoading(true);
    const url = URL.createObjectURL(file);
    try {
      const duration = await getAudioDuration(url);
      if (duration < 1)
        throw new Error('The recording is too short. Add at least a second of audio.');
      if (duration > 300)
        throw new Error('Use a recording shorter than 5 minutes.');
      onAccepted({ url, name: file.name, duration, blob: file });
      toast.success('Audio added to your studio');
    } catch (error) {
      URL.revokeObjectURL(url);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not read this audio file. Try a WAV or MP3 file.',
      );
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };
  return (
    <div className={cn('upload-component', compact && 'upload-compact', className)}>
      <input
        type="file"
        ref={inputRef}
        accept="audio/*,.m4a,.wav,.mp3,.ogg,.webm,.aac,.flac"
        className="sr-only"
        aria-label="Upload source audio"
        onChange={(e) => {
          if (e.target.files?.[0]) void accept(e.target.files[0]);
        }}
      />
      <button
        type="button"
        className={cn('upload-zone', dragging && 'is-dragging', source && 'has-file')}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files[0]) void accept(e.dataTransfer.files[0]);
        }}
        disabled={loading}
      >
        <span className="upload-symbol">
          {loading ? (
            <Loader2 className="animate-spin" size={23} />
          ) : source ? (
            <FileAudio size={23} />
          ) : (
            <Upload size={23} />
          )}
        </span>
        <span className="upload-title">
          {loading ? 'Reading your audio…' : source ? source.name : title || 'Drop your audio here'}
        </span>
        <span className="upload-description">
          {source ? (
            <>
              <Check size={12} />
              {formatTime(source.duration)} · Click to replace
            </>
          ) : (
            <>
              or <strong>browse files</strong>
            </>
          )}
        </span>
        {description && <span className="upload-note">{description}</span>}
        {!compact && !source && <span className="upload-formats">WAV, MP3, M4A · Up to 30 MB</span>}
      </button>
      {!hideActions && (
        <div className="upload-actions">
          <button className="text-button" onClick={() => setRecordOpen(true)}>
            <Mic size={13} />
            Record instead
          </button>
          {showDemo && (
            <button
              className="text-button muted"
              onClick={() => {
                onAccepted({
                  url: '/audio/sample.wav',
                  name: 'Demo voice sample.wav',
                  duration: 12.8,
                });
                toast.info('Demo sample loaded');
              }}
            >
              Use a demo
              <Play size={11} />
            </button>
          )}
        </div>
      )}
      <RecordModal
        open={recordOpen}
        onOpenChange={setRecordOpen}
        onAccepted={(audio) => {
          onAccepted(audio);
          setRecordOpen(false);
        }}
      />
    </div>
  );
}
export function RecordModal({
  open,
  onOpenChange,
  onAccepted,
  title = 'Let’s hear your voice',
  description = 'Your microphone. Your moment. Everything stays on your device.',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccepted: (audio: AudioSource) => void;
  title?: string;
  description?: string;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [recorded, setRecorded] = useState<AudioSource | null>(null);
  const [starting, setStarting] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const stop = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  };
  useEffect(() => {
    if (!open) {
      stop();
      setSeconds(0);
      setRecorded(null);
    }
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [open]);
  const start = async () => {
    setStarting(true);
    setRecorded(null);
    setSeconds(0);
    elapsedRef.current = 0;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error('Microphone access is unavailable here. Upload a voice recording instead.');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      chunks.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunks.current, { type: recorder.mimeType });
        const url = URL.createObjectURL(blob);
        try {
          const duration = await getAudioDuration(url);
          setRecorded({
            url,
            name: `Recording-${Date.now()}.${recorder.mimeType.includes('mp4') ? 'm4a' : 'webm'}`,
            duration,
            blob,
          });
        } catch {
          URL.revokeObjectURL(url);
          toast.error('Could not read the recording. Please try again.');
        }
      };
      recorder.start(200);
      setRecording(true);
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setSeconds(elapsedRef.current);
        if (elapsedRef.current >= 300) stop();
      }, 1000);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Microphone access was denied. Please allow microphone access or upload a file.',
      );
    } finally {
      setStarting(false);
    }
  };
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      className="record-modal"
    >
      <div className="record-display">
        <span className={cn('record-orb', recording && 'is-recording')}>
          <Mic size={42} />
        </span>
        <span className="record-timer">{formatTime(recorded ? recorded.duration : seconds)}</span>
        <span className="record-state">
          {recording
            ? 'RECORDING · SPEAK NATURALLY'
            : recorded
              ? 'SOUNDS GOOD. READY TO USE.'
              : 'YOUR MICROPHONE IS READY'}
        </span>
        <MiniWave color={recording ? '#f49ba8' : '#858ab4'} active={recording} bars={44} />
      </div>
      {recorded && <audio controls src={recorded.url} className="record-preview" />}
      <div className="record-buttons">
        {recorded ? (
          <>
            <Button variant="outline" onClick={() => void start()}>
              <RotateCcw size={16} />
              Try again
            </Button>
            <Button
              onClick={() => {
                onAccepted(recorded);
                toast.success('Recording added');
              }}
            >
              <Check size={16} />
              Use recording
            </Button>
          </>
        ) : (
          <Button
            className={recording ? 'button-recording' : ''}
            onClick={recording ? stop : () => void start()}
            disabled={starting}
          >
            {starting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : recording ? (
              <Square size={15} fill="currentColor" />
            ) : (
              <Mic size={17} />
            )}{' '}
            {starting ? 'Connecting microphone…' : recording ? 'Stop recording' : 'Start recording'}
          </Button>
        )}
      </div>
      <div className="privacy-caption">
        <ShieldCheck size={13} />
        Private, local, and only yours.
      </div>
    </Modal>
  );
}
