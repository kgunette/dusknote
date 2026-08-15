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
import { setConditionNoun } from './config';

// Handle a return from Google (token in the URL fragment), reconcile the durable "connected"
// flag, and, if needed, kick a silent renewal — all before anything renders. If we're
// redirecting away for renewal, skip rendering.
async function boot() {
  handleAuthReturn();
  requestPersistentStorage();

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
