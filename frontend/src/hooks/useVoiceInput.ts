import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/src/lib/supabase';

export function useVoiceInput(onTranscript: (text: string) => void) {
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const ensureStream = useCallback(async () => {
        if (streamRef.current && streamRef.current.getTracks().some((t) => t.readyState === 'live')) {
            return streamRef.current;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        return stream;
    }, []);

    const startRecording = useCallback(async () => {
        try {
            const stream = await ensureStream();
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                chunksRef.current = [];

                setIsTranscribing(true);
                try {
                    const form = new FormData();
                    form.append('audio', blob, 'recording.webm');
                    const res = await fetch('/api/transcribe', { method: 'POST', body: form });
                    if (!res.ok) throw new Error('Transcription failed');
                    const { text } = await res.json();
                    if (text) {
                        onTranscript(text);

                        // Track usage
                        const currentMonth = new Date().toISOString().slice(0, 7);
                        supabase.rpc('increment_usage', {
                            p_month: currentMonth,
                            p_voice: 1,
                        }).then(({ error }) => { if (error) console.error('Usage track error:', error); });
                    }
                } catch (err) {
                    console.error('Transcription error:', err);
                } finally {
                    setIsTranscribing(false);
                }
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error('Mic access error:', err);
        }
    }, [ensureStream, onTranscript]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
    }, []);

    const toggleRecording = useCallback(() => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }, [isRecording, startRecording, stopRecording]);

    return { isRecording, isTranscribing, toggleRecording };
}
