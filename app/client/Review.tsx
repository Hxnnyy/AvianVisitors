import { useEffect, useState } from 'react';
import type { Capture, Species } from '../shared/contracts';
import { api, errorMessage, json } from './api';

interface DetailsDraft { date: string; latitude: string; longitude: string }
const detailsDrafts = new Map<string, DetailsDraft>();

export function Review({ capture, onChange, onConfirmed, onDeleted }: { capture: Capture; onChange: (capture: Capture) => void; onConfirmed: () => void; onDeleted: () => void }) {
  const [date, setDate] = useState(''); const [latitude, setLatitude] = useState(''); const [longitude, setLongitude] = useState('');
  const [query, setQuery] = useState(''); const [species, setSpecies] = useState<Species[]>([]); const [manual, setManual] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [confirmed, setConfirmed] = useState<string[]>([]);
  const [candidateArtwork, setCandidateArtwork] = useState<Species[]>([]);
  const [artworkError, setArtworkError] = useState('');
  const [identifying, setIdentifying] = useState(false);
  const needsTimeReview = capture.identification?.warnings.includes('embedded_date_has_no_timezone') && capture.metadata.source !== 'user';
  useEffect(() => { const draft = detailsDrafts.get(capture.id); setDate(draft?.date ?? (capture.metadata.capturedAt ? needsTimeReview ? capture.metadata.capturedAt.slice(0, 16) : toLocalDate(capture.metadata.capturedAt) : '')); setLatitude(draft?.latitude ?? capture.metadata.location?.latitude.toString() ?? ''); setLongitude(draft?.longitude ?? capture.metadata.location?.longitude.toString() ?? ''); }, [capture.id, capture.metadata, needsTimeReview]);
  function editDetails(change: Partial<DetailsDraft>) { const draft = { date, latitude, longitude, ...change }; detailsDrafts.set(capture.id, draft); setDate(draft.date); setLatitude(draft.latitude); setLongitude(draft.longitude); }
  useEffect(() => { setConfirmed([]); setManual(false); setQuery(''); }, [capture.id]);
  useEffect(() => {
    const candidates = capture.identification?.candidates;
    if (!candidates?.length) { setCandidateArtwork([]); return; }
    const controller = new AbortController(); setArtworkError('');
    void Promise.all(candidates.map(candidate => api<Species[]>(`/species?q=${encodeURIComponent(candidate.scientificName)}`, { signal: controller.signal }))).then(results => setCandidateArtwork(results.flat())).catch(() => { if (!controller.signal.aborted) setArtworkError('Bird illustrations are unavailable just now. You can still review the names.'); });
    return () => controller.abort();
  }, [capture.identification]);
  useEffect(() => {
    if (!manual) return; const controller = new AbortController();
    const timer = window.setTimeout(() => { void api<Species[]>(`/species?q=${encodeURIComponent(query)}`, { signal: controller.signal }).then(setSpecies).catch(cause => { if (!controller.signal.aborted) setError(errorMessage(cause)); }); }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, manual]);
  async function action(run: () => Promise<void>) { setBusy(true); setError(''); try { await run(); } catch (cause) { setError(errorMessage(cause)); } finally { setBusy(false); } }
  async function identify() { await action(async () => { setIdentifying(true); try { onChange(await api<Capture>(`/captures/${capture.id}/process`, { method: 'POST' })); } finally { setIdentifying(false); } }); }
  async function saveDetails(force: boolean) {
    const lat = Number(latitude), lon = Number(longitude);
    if (!date || !latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Add the capture date and a valid latitude and longitude before saving or confirming.');
    const dateChanged = !capture.metadata.capturedAt || date !== toLocalDate(capture.metadata.capturedAt);
    if (force || dateChanged || lat !== capture.metadata.location?.latitude || lon !== capture.metadata.location?.longitude) {
      const updated = await api<Capture>(`/captures/${capture.id}`, json('PATCH', { metadata: { capturedAt: dateChanged || needsTimeReview ? new Date(date).toISOString() : capture.metadata.capturedAt, location: { latitude: lat, longitude: lon }, source: 'user' } })); detailsDrafts.delete(capture.id); onChange(updated);
    }
  }
  async function confirm(speciesId: string, identifiedBy: 'model' | 'user') {
    await action(async () => {
      if (needsTimeReview) throw new Error('Check the photograph’s date and time, then save the capture details before confirming.');
      await saveDetails(false);
      await api(`/captures/${capture.id}/confirm`, json('POST', { speciesId, identifiedBy })); setConfirmed(previous => capture.kind === 'image' ? [speciesId] : [...previous, speciesId]); onConfirmed();
    });
  }
  return <section className="review"><div className="section-top"><h2>Meet your visitor</h2><button className="text-button danger" disabled={busy} onClick={() => { if (window.confirm('Delete this capture and any sightings attached to it?')) void action(async () => { await api(`/captures/${capture.id}`, { method: 'DELETE' }); detailsDrafts.delete(capture.id); onDeleted(); }); }}>Delete capture</button></div>
    {capture.kind === 'image' ? <img className="review-photo" src={capture.originalUrl} alt="Original bird photograph" /> : <audio controls src={capture.originalUrl} />}
    {artworkError && <p className="hint">{artworkError}</p>}
    {capture.identification?.warnings.filter(warning => warning !== 'embedded_date_has_no_timezone').map(warning => <p className="hint" key={warning}>{warning === 'invalid_embedded_date' ? 'The original capture date could not be read. Please add it below.' : warning === 'geographic_filter_not_applied' ? 'This recording was identified without a location filter.' : warning.startsWith('unmapped_photo_label:') ? 'A suggested species is outside this catalogue. Choose a bird yourself if you recognise it.' : `Identification note: ${warning.replaceAll('_', ' ')}`}</p>)}

    <details open><summary>When & where</summary>{needsTimeReview && <p role="alert" className="error">Photo has no timezone — check the date and time. Saving uses your phone timezone.</p>}<p className="hint">{capture.metadata.source === 'embedded' ? 'Read from your photograph. Correct anything that looks wrong.' : 'Check the original capture date and location.'}</p><label>Capture date and time<input type="datetime-local" value={date} onChange={event => editDetails({ date: event.target.value })} /></label><div className="review-places"><span className="hint">Missing a place? Use an approximate area:</span><button onClick={() => { editDetails({ latitude: '53.700', longitude: '-2.290' }); }}>Rossendale</button><button onClick={() => { editDetails({ latitude: '53.738', longitude: '-2.964' }); }}>Lytham</button></div><div className="coordinate-fields"><label>Latitude<input type="number" inputMode="decimal" min="-90" max="90" step="any" value={latitude} onChange={event => editDetails({ latitude: event.target.value })} /></label><label>Longitude<input type="number" inputMode="decimal" min="-180" max="180" step="any" value={longitude} onChange={event => editDetails({ longitude: event.target.value })} /></label></div><button disabled={busy} onClick={() => void action(() => saveDetails(true))}>Save capture details</button>{detailsDrafts.has(capture.id) && <p className="hint">Changes not saved yet. They stay here while you browse this journal.</p>}</details>
    {(capture.status === 'uploaded' || capture.status === 'failed') && <><p>{capture.error || 'Your capture is ready to identify.'}</p><button className="primary" disabled={busy} onClick={() => void identify()}>{identifying ? 'Identifying…' : capture.status === 'failed' ? 'Try identification again' : 'Identify bird'}</button></>}
    {(identifying || capture.status === 'processing') && <p role="status" className="processing">Listening and looking closely…<span>Keep this page open while identification finishes. If the connection is interrupted, reopen your saved capture to review or retry.</span></p>}
    {capture.identification && <><p className="eyebrow">{capture.kind === 'audio' ? 'Birds heard · confirm each one' : 'Suggested identification'}</p><p className="hint">A guide from the model; please check the bird before confirming.</p>{capture.identification.candidates.length === 0 && <p>No confident suggestion. Try again or identify it yourself.</p>}{capture.identification.candidates.map(candidate => <div className="candidate" key={candidate.speciesId}><div>{candidateArtwork.find(bird => bird.id === candidate.speciesId)?.artworkUrl && <img className="candidate-art" src={candidateArtwork.find(bird => bird.id === candidate.speciesId)?.artworkUrl ?? undefined} alt="" />}<h3>{candidate.commonName}</h3><i>{candidate.scientificName}</i><p className="score">Model score: {candidate.score.toFixed(3)}</p>{candidate.ranges.length > 0 && <p className="hint">Heard at {candidate.ranges.map(range => `${Math.floor(range.start)}–${Math.ceil(range.end)}s`).join(', ')}</p>}</div><button disabled={busy || needsTimeReview || confirmed.includes(candidate.speciesId)} onClick={() => void confirm(candidate.speciesId, 'model')}>{confirmed.includes(candidate.speciesId) ? 'Confirmed ✓' : 'Confirm'}</button></div>)}<details className="identification-details"><summary>Identification details</summary><p className="hint">Model: {capture.identification.model}<br />Score type: {capture.identification.scoreLabel}</p><p className="hint">Scores are model outputs, not a probability that the identification is correct.</p></details></>}
    {capture.status === 'review' && capture.identification?.status !== 'identified' && <button disabled={busy} onClick={() => void identify()}>Try identification again</button>}
    <button className="text-button" aria-expanded={manual} onClick={() => setManual(!manual)}>Choose a different bird</button>
    {manual && <div className="species-search"><label>Search the bird catalogue<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Common or scientific name" /></label><p className="hint">Identified by you · attached to this capture.</p>{species.map(bird => <div className="candidate" key={bird.id}><div><h3>{bird.commonName}</h3><i>{bird.scientificName}</i></div><button disabled={busy || needsTimeReview || confirmed.includes(bird.id)} onClick={() => void confirm(bird.id, 'user')}>{confirmed.includes(bird.id) ? 'Confirmed ✓' : 'Select & confirm'}</button></div>)}{species.length === 0 && <p className="hint">No matching species.</p>}</div>}
    {confirmed.length > 0 && <p role="status" className="success">Saved to your collection.</p>}{error && <p role="alert" className="error">{error}</p>}
  </section>;
}
function toLocalDate(value: string): string { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
