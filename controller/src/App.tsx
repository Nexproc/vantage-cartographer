import React, { useState } from 'react';
import type { GameState, ResourceColor, Direction } from './types';
import { useGameState } from './useGameState';
import { ConnectScreen } from './ConnectScreen';

const App: React.FC = () => {
  const { activeScreen, gameState, isSyncing, connect, crashLand, move, adjustResource } = useGameState();

  return (
    <main className={`app-shell ${activeScreen === 'normal' ? 'app-shell--wide' : ''}`}>
      {activeScreen === 'connect' && <ConnectScreen onConnect={connect} />}
      {activeScreen === 'setup' && (
        <SetupScreen
          playerName={gameState.name}
          roomCode={gameState.code}
          onCrashLand={crashLand}
        />
      )}
      {activeScreen === 'normal' && (
        <NormalScreen
          gameState={gameState}
          isSyncing={isSyncing}
          onMove={move}
          onResourceChange={adjustResource}
        />
      )}
    </main>
  );
};

// ==========================================
// SETUP / CRASH LANDING SCREEN
// ==========================================

const MARKER_SWATCHES = [
  { label: 'Emerald', hex: '#10b981' },
  { label: 'Amber', hex: '#f59e0b' },
  { label: 'Sky', hex: '#38bdf8' },
  { label: 'Coral', hex: '#fb7185' },
  { label: 'Lime', hex: '#a3e635' },
  { label: 'Tangerine', hex: '#fb923c' },
  { label: 'Ice', hex: '#e2e8f0' },
];

const SetupScreen: React.FC<{
  playerName: string;
  roomCode: string;
  onCrashLand: (location: string, color: string) => Promise<boolean>;
}> = ({ playerName, roomCode, onCrashLand }) => {
  const [color, setColor] = useState('#10b981');
  const [loc, setLoc] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{2,4}$/.test(loc)) {
      setErrorMsg('Starting location must be a 2 to 4 digit card number.');
      return;
    }

    setErrorMsg(null);
    setSubmitting(true);
    const ok = await onCrashLand(loc, color);
    if (!ok) {
      setErrorMsg('Could not reach Host Map. Check your connection and try again.');
    }
    setSubmitting(false);
  };

  return (
    <section className="screen-view screen-view--centered" aria-labelledby="setup-heading">
      <div className="status-header">
        <div className="explorer-identity">
          <span className="explorer-dot" style={{ backgroundColor: color }} aria-hidden="true" />
          <div className="explorer-meta">
            <span className="explorer-name">{playerName}</span>
            <span className="room-meta">
              <span className="sync-dot" aria-hidden="true" />
              ROOM {roomCode}
            </span>
          </div>
        </div>
      </div>

      <header className="brand-header">
        <h1 id="setup-heading" className="page-title">
          Crash Landing
        </h1>
        <p className="page-subtitle">
          Pick your explorer marker color and enter the 2–4 digit location where you landed.
        </p>
      </header>

      <div className="surface-panel">
        {errorMsg && (
          <div id="setup-error-banner" className="inline-banner inline-banner--error" role="alert">
            <svg className="banner-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <span>{errorMsg}</span>
          </div>
        )}

        <form id="crashland-form" className="form-stack" onSubmit={handleSubmit} noValidate>
          <div className="field-group">
            <div className="field-label-row">
              <span className="field-label">Marker Color</span>
              <span className="field-hint" style={{ fontFamily: 'var(--font-mono)' }}>
                {color.toUpperCase()}
              </span>
            </div>
            <div className="swatch-grid" role="group" aria-label="Preset marker colors">
              {MARKER_SWATCHES.map((swatch) => {
                const isSelected = color.toLowerCase() === swatch.hex.toLowerCase();
                return (
                  <button
                    key={swatch.hex}
                    id={`swatch-${swatch.label.toLowerCase()}`}
                    type="button"
                    className="swatch-btn"
                    style={{ backgroundColor: swatch.hex }}
                    aria-label={swatch.label}
                    aria-pressed={isSelected}
                    onClick={() => setColor(swatch.hex)}
                  />
                );
              })}
              <label className="custom-color-wrap" title="Choose custom color">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                <input
                  id="custom-marker-color"
                  className="custom-color-input"
                  type="color"
                  aria-label="Custom marker color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="start-location-input" className="field-label">
              Starting Location (2–4 digits)
            </label>
            <input
              id="start-location-input"
              className="text-input text-input--mono"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="e.g. 412"
              enterKeyHint="go"
              value={loc}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                setLoc(digits);
                if (errorMsg) setErrorMsg(null);
              }}
            />
          </div>

          <button
            id="crashland-submit-btn"
            type="submit"
            className="btn btn--amber btn--full"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="spinner" aria-hidden="true" />
                <span>Landing&hellip;</span>
              </>
            ) : (
              'Crash Land'
            )}
          </button>
        </form>
      </div>
    </section>
  );
};

// ==========================================
// ACTIVE EXPEDITION / NORMAL SCREEN
// ==========================================

const COMPASS_BEARINGS: Exclude<Direction, null>[] = [
  'N',
  'NE',
  'E',
  'SE',
  'S',
  'SW',
  'W',
  'NW',
  'C',
];

const RESOURCE_META: Array<{ key: ResourceColor; label: string; hex: string }> = [
  { key: 'red', label: 'Red', hex: '#ff4a4a' },
  { key: 'blue', label: 'Blue', hex: '#4a90e2' },
  { key: 'green', label: 'Green', hex: '#34d399' },
  { key: 'yellow', label: 'Yellow', hex: '#f5a623' },
  { key: 'purple', label: 'Purple', hex: '#c084fc' },
  { key: 'orange', label: 'Orange', hex: '#ff8c00' },
];

const NormalScreen: React.FC<{
  gameState: GameState;
  isSyncing: boolean;
  onMove: (loc: string, dir: Direction) => Promise<boolean>;
  onResourceChange: (color: ResourceColor, delta: number) => void;
}> = ({ gameState, isSyncing, onMove, onResourceChange }) => {
  const [targetLoc, setTargetLoc] = useState('');
  const [selectedDirection, setSelectedDirection] = useState<Direction>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  const isPortal = selectedDirection === 'C';

  const handleMoveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDirection) {
      setMoveError('Select a compass bearing (or ★ portal) first.');
      return;
    }
    if (!/^\d{2,4}$/.test(targetLoc)) {
      setMoveError('Enter a 2 to 4 digit destination location.');
      return;
    }

    setMoveError(null);
    setMoving(true);
    const ok = await onMove(targetLoc, selectedDirection);
    setMoving(false);

    if (ok) {
      setTargetLoc('');
      setSelectedDirection(null);
    } else {
      setMoveError('Move failed to reach Host Map. Retry.');
    }
  };

  const bearingLabel = !selectedDirection
    ? 'Tap bearing'
    : isPortal
      ? 'Portal Jump (★)'
      : `Bearing ${selectedDirection}`;

  return (
    <section className="screen-view" aria-label="Active expedition controller">
      {/* Compact Top Explorer & Location Status Bar */}
      <header className="status-header">
        <div className="explorer-identity">
          <span
            className="explorer-dot"
            style={{ backgroundColor: gameState.color }}
            aria-hidden="true"
          />
          <div className="explorer-meta">
            <h1 className="explorer-name" style={{ margin: 0 }}>
              {gameState.name}
            </h1>
            <span className="room-meta">
              <span
                className={`sync-dot ${isSyncing ? 'sync-dot--busy' : ''}`}
                aria-hidden="true"
              />
              {gameState.code} &middot; {isSyncing ? 'SYNCING' : 'LIVE'}
            </span>
          </div>
        </div>

        <div className="location-readout" aria-live="polite">
          <span className="location-readout__label">LOC</span>
          <span id="current-location-value" className="location-readout__value">
            #{gameState.location || '---'}
          </span>
        </div>
      </header>

      <div className="expedition-body">
        {/* Compact 3x2 Resource Tiles (2x3 on wide screens) */}
        <div className="resources-grid" role="group" aria-label="Explorer resources">
          {RESOURCE_META.map(({ key, label, hex }) => {
            const count = gameState.resources[key];
            return (
              <div key={key} className="resource-tile">
                <div className="resource-tile__top">
                  <div className="resource-label-group">
                    <span
                      className="resource-pip"
                      style={{ backgroundColor: hex }}
                      aria-hidden="true"
                    />
                    <span className="resource-name">{label}</span>
                  </div>
                  <span id={`res-${key}-val`} className="resource-count">
                    {count}
                  </span>
                </div>
                <div className="resource-tile__actions">
                  <button
                    id={`res-${key}-dec`}
                    type="button"
                    className="stepper-btn"
                    aria-label={`Decrease ${label}`}
                    disabled={count <= 0}
                    onClick={() => onResourceChange(key, -1)}
                  >
                    &minus;
                  </button>
                  <button
                    id={`res-${key}-inc`}
                    type="button"
                    className="stepper-btn"
                    aria-label={`Increase ${label}`}
                    onClick={() => onResourceChange(key, 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Navigation & Movement Panel */}
        <div className="nav-panel">
          <div className="section-heading-row">
            <h2 className="section-title">Navigation</h2>
            <span
              className={`bearing-readout ${
                selectedDirection
                  ? isPortal
                    ? 'bearing-readout--portal'
                    : 'bearing-readout--active'
                  : ''
              }`}
            >
              {bearingLabel}
            </span>
          </div>

          {/* Fluid Tactile 8-Point + Portal Compass Rose */}
          <div className="compass-stage" role="group" aria-label="Compass direction selector">
            <svg className="compass-ring-svg" viewBox="0 0 224 224" aria-hidden="true">
              <circle
                cx="112"
                cy="112"
                r="84"
                fill="none"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="1.5"
              />
              <circle
                cx="112"
                cy="112"
                r="42"
                fill="none"
                stroke="rgba(255, 255, 255, 0.05)"
                strokeDasharray="3 4"
                strokeWidth="1"
              />
              <line
                x1="112"
                y1="28"
                x2="112"
                y2="196"
                stroke="rgba(255, 255, 255, 0.06)"
                strokeWidth="1"
              />
              <line
                x1="28"
                y1="112"
                x2="196"
                y2="112"
                stroke="rgba(255, 255, 255, 0.06)"
                strokeWidth="1"
              />
              <line
                x1="52.6"
                y1="52.6"
                x2="171.4"
                y2="171.4"
                stroke="rgba(255, 255, 255, 0.04)"
                strokeWidth="1"
              />
              <line
                x1="171.4"
                y1="52.6"
                x2="52.6"
                y2="171.4"
                stroke="rgba(255, 255, 255, 0.04)"
                strokeWidth="1"
              />
            </svg>

            {COMPASS_BEARINGS.map((dir) => {
              const isSelected = selectedDirection === dir;
              const centerPortal = dir === 'C';
              return (
                <button
                  key={dir}
                  id={`compass-dir-${dir.toLowerCase()}`}
                  type="button"
                  className={`compass-node compass-pos-${dir} ${
                    centerPortal ? 'compass-node--portal' : ''
                  }`}
                  aria-label={centerPortal ? 'Portal or Special movement' : `Direction ${dir}`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    setSelectedDirection((prev) => (prev === dir ? null : dir));
                    if (moveError) setMoveError(null);
                  }}
                >
                  {centerPortal ? '★' : dir}
                </button>
              );
            })}
          </div>

          <div className="move-footer">
            {moveError && (
              <div id="move-error-banner" className="inline-banner inline-banner--error" role="alert">
                <svg className="banner-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{moveError}</span>
              </div>
            )}

            <form id="move-form" className="move-bar" onSubmit={handleMoveSubmit} noValidate>
              <input
                id="target-location-input"
                className="text-input text-input--mono"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                placeholder="Location #"
                aria-label="Destination location number"
                enterKeyHint="send"
                value={targetLoc}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setTargetLoc(digits);
                  if (moveError) setMoveError(null);
                }}
              />
              <button
                id="submit-move-btn"
                type="submit"
                className={`btn ${isPortal ? 'btn--amber' : 'btn--primary'}`}
                disabled={moving}
              >
                {moving ? (
                  <span className="spinner" aria-hidden="true" />
                ) : isPortal ? (
                  'Portal ★'
                ) : selectedDirection ? (
                  `Move ${selectedDirection}`
                ) : (
                  'Move'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
};

export default App;