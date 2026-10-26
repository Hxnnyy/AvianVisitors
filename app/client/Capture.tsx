import { useEffect, useRef, useState } from 'react';
import type { Capture, CaptureMetadata, Crop, Location } from '../shared/contracts';
import { api, errorMessage } from './api';

export function CaptureForm({ location, onUploaded }: { location: Location | null; onUploaded: (capture: Capture) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<'image' | 'audio'>('image');
  const [preview, setPreview] = useState('');
  const [imageReady, setImageReady] = useState(false);
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, width: 1, height: 1 });
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const started = useRef(0);
  const uploadKey = useRef(crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => () => { if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach(track => track.stop()); }, []);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => { const elapsed = Math.min(60, Math.floor((Date.now() - started.current) / 1000)); setSeconds(elapsed); if (Date.now() - started.current >= 60_000 && recorder.current?.state === 'recording') recorder.current.stop(); }, 200);
    return () => window.clearInterval(timer);
  }, [recording]);
  function choose(next: File | undefined) { if (!next) return; if (next.size > 25 * 1024 * 1024) { setError('That photograph is larger than 25 MB. Choose a smaller image.'); return; } setFile(next); setKind('image'); setImageReady(false); setCrop({ x: 0, y: 0, width: 1, height: 1 }); setError(''); uploadKey.current = crypto.randomUUID(); }
  async function record() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('Recording is unavailable in this browser. Open this page in Safari, or use a photograph.'); return; }
    setBusy(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.current = media;
      const mimeType = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus'].find(value => MediaRecorder.isTypeSupported(value));
      const next = new MediaRecorder(media, mimeType ? { mimeType } : undefined); recorder.current = next;
      const chunks: Blob[] = [];
      next.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      next.onstop = () => { media.getTracks().forEach(track => track.stop()); setRecording(false); if (!chunks.length) { setError('No sound was saved. Please record again.'); return; } const type = next.mimeType || chunks[0]?.type || 'application/octet-stream'; const extension = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'; setKind('audio'); setFile(new File(chunks, `birdsong.${extension}`, { type })); uploadKey.current = crypto.randomUUID(); };
      next.onerror = () => { media.getTracks().forEach(track => track.stop()); setRecording(false); setError('Recording stopped unexpectedly. Listen back before sending, or record again.'); };
      setSeconds(0); started.current = Date.now(); next.start(); setRecording(true);
    } catch { stream.current?.getTracks().forEach(track => track.stop()); setError('Microphone access was declined or is unavailable. Allow microphone access in Safari settings and try again, or choose a photograph.'); } finally { setBusy(false); }
  }
  async function submit() {
    if (!file) return; if (file.size > 25 * 1024 * 1024) { setError('This capture is larger than 25 MB. Choose a smaller photograph or record again.'); return; } setBusy(true); setError('');
    try {
      const metadata: CaptureMetadata = kind === 'audio' ? { capturedAt: new Date(started.current).toISOString(), location, source: 'user' } : { capturedAt: null, location: null, source: 'missing' };
      const data = new FormData(); data.set('file', file); data.set('kind', kind); data.set('metadata', JSON.stringify(metadata)); if (kind === 'image' && imageReady) data.set('crop', JSON.stringify(crop));
      const capture = await api<Capture>('/captures', { method: 'POST', headers: { 'Idempotency-Key': uploadKey.current }, body: data }); onUploaded(capture);
    } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); }
  }
  return <section className="capture-form"><h2>A new visitor</h2><p className="intro">A photograph, or a little birdsong.</p>
    <input hidden ref={fileInput} type="file" accept="image/*,.heic,.heif" onChange={event => choose(event.target.files?.[0])} />
    <input hidden ref={cameraInput} type="file" accept="image/*" capture="environment" onChange={event => choose(event.target.files?.[0])} />
    <div className="capture-choices"><button disabled={recording || busy} onClick={() => cameraInput.current?.click()}>Take a photograph <span>↗</span></button><button disabled={recording || busy} onClick={() => fileInput.current?.click()}>Choose a photograph <span>＋</span></button><button disabled={busy} className={recording ? 'recording' : ''} onClick={() => recording ? recorder.current?.stop() : void record()}>{recording ? `Stop recording · ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')} / 01:00` : 'Record birdsong'} <span>●</span></button></div>
    {recording && <p role="status">Listening… recording stops at one minute.</p>}
    {file && preview && !recording && <div className="evidence"><p className="eyebrow">{kind === 'image' ? 'Choose one bird' : 'Listen before sending'}</p>{kind === 'audio' ? <audio controls src={preview} /> : <>
      <div className="crop-stage" onPointerDown={event => { if (!imageReady || busy) return; event.currentTarget.setPointerCapture(event.pointerId); const rect = event.currentTarget.getBoundingClientRect(); setCrop(previous => ({ ...previous, x: Math.max(0, Math.min(1 - previous.width, (event.clientX - rect.left) / rect.width - previous.width / 2)), y: Math.max(0, Math.min(1 - previous.height, (event.clientY - rect.top) / rect.height - previous.height / 2)) })); }} onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const rect = event.currentTarget.getBoundingClientRect(); setCrop(previous => ({ ...previous, x: Math.max(0, Math.min(1 - previous.width, (event.clientX - rect.left) / rect.width - previous.width / 2)), y: Math.max(0, Math.min(1 - previous.height, (event.clientY - rect.top) / rect.height - previous.height / 2)) })); }}>
        <img src={preview} alt="Your photograph to crop" onLoad={() => setImageReady(true)} onError={() => setImageReady(false)} />
        {imageReady && <div className="crop-box" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }} />}
      </div>
      {imageReady ? <><label>Zoom into the bird<input type="range" min="1" max="5" step="0.05" value={1 / crop.width} disabled={busy} onChange={event => { const size = 1 / Number(event.target.value); setCrop(previous => ({ x: Math.min(previous.x, 1 - size), y: Math.min(previous.y, 1 - size), width: size, height: size })); }} /></label><p className="hint">Drag the selection over one bird.</p></> : <p className="hint">This image cannot be previewed here. You can send the original, or choose a JPEG for cropping.</p>}
      <p className="hint">The photograph’s date and location will be read after upload. Review them before confirming.</p></>}
      <button className="primary" disabled={busy} onClick={() => void submit()}>{busy ? 'Sending…' : 'Identify this visitor'}</button><p className="hint">Your original stays here if sending fails.</p></div>}
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}



