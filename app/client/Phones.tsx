import { useState } from 'react';
import { api, errorMessage } from './api';

/** Pair another phone or the Home Screen app, or sign every phone out after a loss. */
export function Phones() {
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  async function addPhone() {
    setError(''); setCopied(false);
    try { setLink(await api<{ url: string; expiresAt: string }>('/pairing', { method: 'POST' })); } catch (cause) { setError(errorMessage(cause)); }
  }
  async function signOutAll() {
    if (!window.confirm('Sign out every phone, including this one? The frame will show a new code to scan.')) return;
    try { const response = await fetch('/api/pairing/reset', { method: 'POST' }); if (!response.ok) throw new Error(`Couldn’t sign phones out (${response.status}).`); window.location.reload(); } catch (cause) { setError(errorMessage(cause)); }
  }
  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setError('Couldn’t copy. Press and hold the link to copy it.'); }
  }
  return <div className="phones">
    <button onClick={() => void addPhone()}>Sign in another phone or the Home Screen app</button>
    {link && <div className="pairing-link"><p>Your frame is showing a code to scan. Or copy this link and paste it into the other app. It works once, until {new Date(link.expiresAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.</p><p className="score">{link.url}</p><button onClick={() => void copy(link.url)}>{copied ? 'Copied ✓' : 'Copy link'}</button></div>}
    {error && <p role="alert" className="error">{error}</p>}
    <button className="text-button danger" onClick={() => void signOutAll()}>Lost a phone? Sign out all phones</button>
  </div>;
}
