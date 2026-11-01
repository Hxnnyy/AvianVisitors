import { useState } from 'react';
import { pair } from './session';

export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { if (await pair(link)) onSignedIn(); else setError('That link has expired or was already used. Ask for a new one from Settings on a signed-in phone.'); }
    catch { setError('Couldn’t reach the journal. Check your connection and try again.'); }
    finally { setBusy(false); }
  }
  return <main><header className="page-heading"><p className="pre">A little closer to the wild</p><h1>Your bird journal</h1></header>
    <section className="onboarding"><h2>This journal is private</h2><p>Scan the code on your bird frame with your iPhone camera. If you were sent a sign-in link instead, paste it here. You’ll stay signed in for a year.</p>
      <form onSubmit={event => void submit(event)}><label>Sign-in link<input type="url" inputMode="url" autoComplete="off" value={link} onChange={event => setLink(event.target.value)} placeholder="https://…" /></label>
        {error && <p role="alert" className="error">{error}</p>}
        <button className="primary" type="submit" disabled={busy || !link.trim()}>{busy ? 'Signing in…' : 'Sign in'}</button></form></section></main>;
}
