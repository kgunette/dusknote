import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './theme.css';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import {
  handleAuthReturn,
  isConnected,
  markConnectedLocal,
  maybeRenewOnLaunch,
  requestPersistentStorage,
} from './google/auth';
import { prefs } from './db';
import { IS_DEMO, setConditionNoun } from './config';

// Handle a return from Google (token in the URL fragment), reconcile the durable "connected"
// flag, and, if needed, kick a silent renewal — all before anything renders. If we're
// redirecting away for renewal, skip rendering.
async function boot() {
  handleAuthReturn();
  requestPersistentStorage();

  // The try-it demo starts over on every visit: whatever the last visitor typed is replaced by
  // the sample data before anything renders, so the demo can never accumulate a real record.
  // Loaded on demand so a personal copy never downloads the sample data.
  if (IS_DEMO) {
    document.documentElement.classList.add('demo'); // the phone-sized frame on a wide screen
    try {
      await (await import('./demo')).seedDemo();
    } catch {
      /* a demo that fails to reseed still runs on whatever it holds */
    }
  }

  // The "connected here" marker normally lives in localStorage, which iOS can evict (while the
  // entries in IndexedDB survive). Mirror it to IndexedDB and restore it on launch, so a wipe
  // doesn't drop the app to "Connect" and silently disable auto-renewal.
  try {
    const durable = await prefs.connected();
    if (isConnected()) {
      if (!durable) await prefs.setConnected(true);
    } else if (durable) {
      markConnectedLocal();
    }
  } catch {
    /* if IndexedDB is unavailable, fall back to the old localStorage-only behavior */
  }

  // Load the condition noun before anything renders, so the first paint already speaks the
  // user's word ("Log a headache") instead of flashing the default.
  try {
    setConditionNoun(await prefs.conditionNoun());
  } catch {
    /* default 'episode' stands */
  }

  if (!(await maybeRenewOnLaunch())) {
    registerSW({ immediate: true });
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
}

void boot();
