import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { SignIn } from './SignIn';
import { pair, signedIn } from './session';
import './styles.css';

type Gate = 'checking' | 'signed-in' | 'signed-out' | 'offline';
function Root() {
  const [gate, setGate] = useState<Gate>('checking');
  const [justPaired, setJustPaired] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        if (window.location.hash.startsWith('#pair=')) {
          const link = window.location.href;
          window.history.replaceState(null, '', '/');
          setJustPaired(await pair(link));
        }
        setGate((await signedIn()) ? 'signed-in' : 'signed-out');
      } catch { setGate('offline'); }
    })();
  }, []);
  if (gate === 'checking') return <p role="status" className="empty">Opening your bird journal…</p>;
  if (gate === 'offline') return <div role="alert" className="error global-error">Couldn’t reach the journal. <button onClick={() => window.location.reload()}>Try again</button></div>;
  if (gate === 'signed-out') return <SignIn onSignedIn={() => { setJustPaired(true); setGate('signed-in'); }} />;
  return <>{justPaired && <p role="status" className="paired-banner">You’re in. Your frame will show your birds in about a minute. <button className="text-button" onClick={() => setJustPaired(false)}>OK</button></p>}<App /></>;
}
const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing');
createRoot(root).render(<React.StrictMode><Root /></React.StrictMode>);
