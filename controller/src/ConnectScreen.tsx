import React, { useState, useEffect, useRef } from 'react';

interface ConnectScreenProps {
  onConnect: (code: string, name: string) => Promise<boolean>;
}

function readInitialUrlCode(): string {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  const urlCode = params.get('code');
  return urlCode ? urlCode.trim().toUpperCase() : '';
}

export const ConnectScreen: React.FC<ConnectScreenProps> = ({ onConnect }) => {
  const [initialUrlCode] = useState(readInitialUrlCode);
  const [code, setCode] = useState(initialUrlCode);
  const [name, setName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const linkedFromQR = initialUrlCode.length > 0;
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (linkedFromQR) {
      window.history.replaceState({}, '', window.location.pathname);
      nameInputRef.current?.focus();
    }
  }, [linkedFromQR]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();

    if (!cleanCode) {
      setErrorMsg('Enter the 4-character room code shown on the Host Map.');
      return;
    }
    if (!cleanName) {
      setErrorMsg('Enter your explorer name to join the map.');
      return;
    }

    setErrorMsg(null);
    setLoading(true);
    const success = await onConnect(cleanCode, cleanName);
    if (!success) {
      setErrorMsg('Room not found. Make sure the Host Map is open on desktop and the room code matches.');
    }
    setLoading(false);
  };

  return (
    <section className="screen-view screen-view--centered" aria-labelledby="connect-heading">
      <header className="brand-header">
        <div className="brand-mark">
          <svg
            className="brand-compass-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
          <span>Vantage Cartographer</span>
        </div>
        <h1 id="connect-heading" className="page-title">
          Join Expedition
        </h1>
        <p className="page-subtitle">
          Scan the Host Map QR code with your phone&apos;s camera, or enter the room code below.
        </p>
      </header>

      <div className="surface-panel">
        {linkedFromQR && !errorMsg && (
          <div className="inline-banner inline-banner--info" role="status">
            <svg
              className="banner-icon"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                clipRule="evenodd"
              />
            </svg>
            <span>Room code loaded from QR link. Enter your name to connect.</span>
          </div>
        )}

        {errorMsg && (
          <div id="connect-error-banner" className="inline-banner inline-banner--error" role="alert">
            <svg
              className="banner-icon"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <span>{errorMsg}</span>
          </div>
        )}

        <form id="connect-form" className="form-stack" onSubmit={handleSubmit} noValidate>
          <div className="field-group">
            <label htmlFor="room-code-input" className="field-label">
              Room Code
            </label>
            <input
              id="room-code-input"
              className="text-input text-input--code"
              type="text"
              placeholder="ABCD"
              maxLength={8}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                if (errorMsg) setErrorMsg(null);
              }}
            />
          </div>

          <div className="field-group">
            <label htmlFor="player-name-input" className="field-label">
              Explorer Name
            </label>
            <input
              ref={nameInputRef}
              id="player-name-input"
              className="text-input"
              type="text"
              placeholder="e.g. Alex"
              maxLength={24}
              autoComplete="nickname"
              enterKeyHint="go"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
            />
          </div>

          <button
            id="connect-submit-btn"
            type="submit"
            className="btn btn--primary btn--full"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" aria-hidden="true" />
                <span>Connecting&hellip;</span>
              </>
            ) : (
              'Connect to Map'
            )}
          </button>
        </form>
      </div>
    </section>
  );
};