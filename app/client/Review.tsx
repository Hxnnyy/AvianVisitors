import { useEffect, useRef, useState } from 'react';
import type { Capture, Location, Species } from '../shared/contracts';
import { api, errorMessage, json } from './api';
import { PLACES, placeFor } from './places';

interface DetailsDraft { date: string; location: Location | null }
const detailsDrafts = new Map<string, DetailsDraft>();

export function Review({ capture, onChange, onConfirmed, onDeleted, onViewCollection }: { capture: Capture; onChange: (capture: Capture) => void; onConfirmed: () => void; onDeleted: () => void; onViewCollection: (speciesId: string) => void }) {
  const [date, setDate] = useState(''); const [location, setLocation] = useState<Location | null>(null);
  const [query, setQuery] = useState(''); const [species, setSpecies] = useState<Species[]>([]); const [manual, setManual] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [confirmed, setConfirmed] = useState<string[]>([]);
  const [justConfirmed, setJustConfirmed] = useState<Species | null>(null);
  const [candidateArtwork, setCandidateArtwork] = useState<Species[]>([]);
  const [identifying, setIdentifying] = useState(false);
  const needsTimeReview = capture.identification?.warnings.includes('embedded_date_has_no_timezone') && capture.metadata.source !== 'user';
  const photoGps = capture.metadata.source === 'embedded' && capture.metadata.location !== null;
  useEffect(() => { const draft = detailsDrafts.get(capture.id); setDate(draft?.date ?? (capture.metadata.capturedAt ? needsTimeReview ? capture.metadata.capturedAt.slice(0, 16) : toLocalDate(capture.metadata.capturedAt) : '')); setLocation(draft ? draft.location : capture.metadata.location); }, [capture.id, capture.metadata, needsTimeReview]);
  function editDetails(change: Partial<DetailsDraft>) { const draft = { date, location, ...change }; detailsDrafts.set(capture.id, draft); setDate(draft.date); setLocation(draft.location); }
  useEffect(() => { setConfirmed([]); setManual(false); setQuery(''); setJustConfirmed(null); }, [capture.id]);
  useEffect(() => {
    const candidates = capture.identification?.candidates;
    if (!candidates?.length) { setCandidateArtwork([]); return; }
    const controller = new AbortController();
    // Artwork is decoration: without it the names still carry the decision.
    void Promise.all(candidates.map(candidate => api<Species[]>(`/species?q=${encodeURIComponent(candidate.scientificName)}`, { signal: controller.signal }))).then(results => setCandidateArtwork(results.flat())).catch(() => undefined);
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
    if (!date) throw new Error('Add the capture date and time before confirming.');
    if (!location) throw new Error('Choose where you saw this bird before confirming.');
    const dateChanged = !capture.metadata.capturedAt || date !== toLocalDate(capture.metadata.capturedAt);
    if (force || dateChanged || location.latitude !== capture.metadata.location?.latitude || location.longitude !== capture.metadata.location?.longitude) {
      const updated = await api<Capture>(`/captures/${capture.id}`, json('PATCH', { metadata: { capturedAt: dateChanged || needsTimeReview ? new Date(date).toISOString() : capture.metadata.capturedAt, location, source: 'user' } })); detailsDrafts.delete(capture.id); onChange(updated);
    }
  }
  async function confirm(bird: Species, identifiedBy: 'model' | 'user') {
    await action(async () => {
      if (needsTimeReview) throw new Error('Check the photograph’s date and time first.');
      await saveDetails(false);
      await api(`/captures/${capture.id}/confirm`, json('POST', { speciesId: bird.id, identifiedBy })); setConfirmed(previous => capture.kind === 'image' ? [bird.id] : [...previous, bird.id]); setJustConfirmed(bird); onConfirmed();
    });
  }
  const identification = capture.identification;
  // An outside-catalogue note matters only when the model was unsure; beside a confident match it is noise.
  const outsideCatalogue = identification?.status === 'uncertain' && identification.warnings.some(warning => warning.startsWith('unmapped_photo_label:'));
  const canIdentify = capture.status === 'uploaded' || capture.status === 'failed';
  const canRetry = capture.status === 'review' && identification?.status !== 'identified';
  const place = placeFor(location);
  return <section className="review"><div className="section-top"><h2>Meet your visitor</h2><button className="text-button danger" disabled={busy} onClick={() => { if (window.confirm('Delete this capture? Any birds confirmed from it are removed too.')) void action(async () => { await api(`/captures/${capture.id}`, { method: 'DELETE' }); detailsDrafts.delete(capture.id); onDeleted(); }); }}>Delete</button></div>
    {capture.kind === 'image' ? <img className="review-photo" src={capture.originalUrl} alt="Your photograph" /> : <audio controls src={capture.originalUrl} />}

    <section className="when-where" aria-labelledby="when-where-title"><p className="eyebrow" id="when-where-title">When & where</p>
      <label className="field-label" htmlFor={`date-${capture.id}`}>Date and time</label>
      <div className="datetime"><CalendarIcon /><input id={`date-${capture.id}`} type="datetime-local" value={date} onChange={event => editDetails({ date: event.target.value })} /><ChevronIcon /></div>
      {identification?.warnings.includes('invalid_embedded_date') && <p className="hint">We couldn’t read the date from the photograph. Please add it.</p>}
      {needsTimeReview && <div role="alert" className="notice"><p>Photo has no timezone. Check the date and time is right.</p><button disabled={busy} onClick={() => void action(() => saveDetails(true))}>The date and time are right</button></div>}
      {photoGps && location ? <p className="place-line"><PinIcon />From your photo · {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</p>
        : <><p className="field-label">Where</p><div className="place-choices" role="group" aria-label="Where">{PLACES.map(option => <button key={option.id} aria-pressed={place?.id === option.id} onClick={() => editDetails({ location: option.location })}>{option.name}</button>)}</div>
          {location && !place && <p className="place-line"><PinIcon />Your location when recording</p>}</>}
    </section>

    {(identifying || capture.status === 'processing') && <p role="status" className="processing">Looking and listening closely…<span>Keep this page open. It usually takes a few seconds.</span></p>}
    {capture.status === 'failed' && capture.error && <p className="error">{capture.error}</p>}
    {identification && <section className="suggestions"><p className="eyebrow">{capture.kind === 'audio' ? 'Birds heard · confirm each one' : 'Suggested bird'}</p>
      {identification.candidates.length === 0 ? <p>No confident suggestion. Try again, or choose the bird yourself.</p> : <p className="hint">Check the bird before confirming.</p>}
      {outsideCatalogue && <p className="hint">The closest match may be a bird outside this list. If you recognise it, choose it yourself.</p>}
      {identification.candidates.map((candidate, index) => { const art = candidateArtwork.find(bird => bird.id === candidate.speciesId); const bird: Species = art ?? { id: candidate.speciesId, commonName: candidate.commonName, scientificName: candidate.scientificName, artworkUrl: null }; return <div className="candidate" key={candidate.speciesId}><div>{art?.artworkUrl && <img className="candidate-art" src={art.artworkUrl} alt="" />}<h3>{candidate.commonName}</h3><i>{candidate.scientificName}</i><p className="score">Model score {candidate.score.toFixed(2)}</p>{candidate.ranges.length > 0 && <p className="hint">Heard at {candidate.ranges.map(range => `${Math.floor(range.start)}–${Math.ceil(range.end)}s`).join(', ')}</p>}</div><button className={index === 0 && !confirmed.includes(candidate.speciesId) ? 'primary' : ''} disabled={busy || needsTimeReview || confirmed.includes(candidate.speciesId)} onClick={() => void confirm(bird, 'model')}>{confirmed.includes(candidate.speciesId) ? 'Confirmed ✓' : 'Confirm'}</button></div>; })}
    </section>}

    <div className="action-row">{(canIdentify || canRetry) && <button className="primary" disabled={busy} onClick={() => void identify()}>{identifying ? 'Identifying…' : canIdentify && capture.status === 'uploaded' ? 'Identify bird' : 'Try again'}</button>}<button aria-expanded={manual} onClick={() => setManual(!manual)}>Choose a different bird</button></div>
    {manual && <div className="species-search"><label>Search the bird list<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="For example, robin" /></label>{species.map(bird => <div className="candidate" key={bird.id}><div><h3>{bird.commonName}</h3><i>{bird.scientificName}</i></div><button disabled={busy || needsTimeReview || confirmed.includes(bird.id)} onClick={() => void confirm(bird, 'user')}>{confirmed.includes(bird.id) ? 'Confirmed ✓' : 'Choose'}</button></div>)}{query && species.length === 0 && <p className="hint">No bird by that name.</p>}</div>}
    {error && <p role="alert" className="error">{error}</p>}
    {justConfirmed && <ConfirmedModal bird={justConfirmed} onView={() => onViewCollection(justConfirmed.id)} onClose={() => setJustConfirmed(null)} />}
  </section>;
}

function ConfirmedModal({ bird, onView, onClose }: { bird: Species; onView: () => void; onClose: () => void }) {
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => { primary.current?.focus(); const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [onClose]);
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirmed-title">
      {bird.artworkUrl ? <img src={bird.artworkUrl} alt="" /> : <div className="artwork-missing">Illustration to come</div>}
      <h2 id="confirmed-title">{bird.commonName}</h2><p role="status">Added to your collection</p>
      <div className="modal-actions"><button ref={primary} className="primary" onClick={onView}>See it in your collection</button><button onClick={onClose}>Carry on</button></div>
    </div></div>;
}
function CalendarIcon() { return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>; }
function ChevronIcon() { return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 9 6 6 6-6" /></svg>; }
function PinIcon() { return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>; }
function toLocalDate(value: string): string { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
