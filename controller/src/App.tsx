import React, { useState, useEffect } from 'react';
import type { GameState, ResourceColor, Direction } from './types';
import { useGameState } from './useGameState';
import { ConnectScreen } from './ConnectScreen';

const PortalSwirlSvg: React.FC<{ className?: string }> = ({ className = 'portal-swirl-icon' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M 3.25 12.6 A 8.5 8.5 0 0 1 20.25 12.6 A 6.75 6.75 0 0 1 6.75 12.6 A 5 5 0 0 1 16.75 12.6 A 3.25 3.25 0 0 1 10.25 12.6 A 1.6 1.6 0 0 1 13.45 12.6" />
  </svg>
);

const OpenDoorSvg: React.FC<{ className?: string }> = ({ className = 'portal-door-icon' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M 14 4.5 H 19 V 19.5" />
    <path d="M 3 19.5 H 5" />
    <path d="M 14 19.5 H 21" />
    <path d="M 5 4.5 L 14 2.5 V 21.5 L 5 19.5 Z" />
    <circle cx="11.2" cy="12" r="1.05" fill="currentColor" stroke="none" />
  </svg>
);

const PortalDoorIcon: React.FC<{ inline?: boolean }> = ({ inline = false }) => (
  <span
    className={`portal-door-glyph ${inline ? 'portal-door-glyph--inline' : ''}`}
    aria-hidden="true"
  >
    <PortalSwirlSvg />
    <span className="portal-glyph-slash">/</span>
    <OpenDoorSvg />
  </span>
);

const App: React.FC = () => {
  const { activeScreen, gameState, isSyncing, connect, crashLand, move, undoMove, adjustResource } = useGameState();

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
          onUndoMove={undoMove}
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
  { label: 'Sky', hex: '#38bdf8' },
  { label: 'Violet', hex: '#c084fc' },
  { label: 'Coral', hex: '#fb7185' },
  { label: 'Orange', hex: '#fb923c' },
  { label: 'Yellow', hex: '#fde047' },
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
  onUndoMove: () => Promise<boolean>;
  onResourceChange: (color: ResourceColor, delta: number) => void;
}> = ({ gameState, isSyncing, onMove, onUndoMove, onResourceChange }) => {
  const [targetLoc, setTargetLoc] = useState('');
  const [selectedDirection, setSelectedDirection] = useState<Direction>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [undoing, setUndoing] = useState(false);

  // Keep floating composer bar docked above virtual keyboard on mobile Safari/Chrome
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const syncKeyboardOffset = () => {
      const offset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      document.documentElement.style.setProperty('--vv-offset', `${offset}px`);
    };
    vv.addEventListener('resize', syncKeyboardOffset);
    vv.addEventListener('scroll', syncKeyboardOffset);
    syncKeyboardOffset();
    return () => {
      vv.removeEventListener('resize', syncKeyboardOffset);
      vv.removeEventListener('scroll', syncKeyboardOffset);
      document.documentElement.style.removeProperty('--vv-offset');
    };
  }, []);

  const currentKnownNeighbors = gameState.location
    ? gameState.knownEdges[gameState.location] ?? {}
    : {};

  const lockedDestination =
    selectedDirection && selectedDirection !== 'C'
      ? currentKnownNeighbors[selectedDirection]
      : undefined;
  const isLocationLocked = Boolean(lockedDestination);
  const effectiveTargetLoc = lockedDestination ?? targetLoc;

  const isPortal = selectedDirection === 'C';
  const hasDirection = selectedDirection !== null;
  const hasLocation = /^\d{2,4}$/.test(effectiveTargetLoc);
  const canMove = hasDirection && hasLocation;
  const canUndo = gameState.lastMove !== null;

  const handleMoveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDirection || !/^\d{2,4}$/.test(effectiveTargetLoc)) {
      return;
    }

    setMoveError(null);
    setMoving(true);
    const ok = await onMove(effectiveTargetLoc, selectedDirection);
    setMoving(false);

    if (ok) {
      setTargetLoc('');
      setSelectedDirection(null);
    } else {
      setMoveError('Move failed to reach Host Map. Retry.');
    }
  };

  const handleUndo = async () => {
    if (!canUndo || undoing || moving) return;
    setMoveError(null);
    setUndoing(true);
    const ok = await onUndoMove();
    setUndoing(false);
    if (ok) {
      setTargetLoc('');
      setSelectedDirection(null);
    } else {
      setMoveError('Undo failed to reach Host Map. Retry.');
    }
  };

  const bearingLabel = !selectedDirection
    ? 'Select direction'
    : isPortal
      ? 'Portal / Enter'
      : lockedDestination
        ? `Bearing ${selectedDirection} -> #${lockedDestination}`
        : `Bearing ${selectedDirection}`;

  return (
    <>
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

          <div className="status-right">
            {canUndo && (
              <button
                id="undo-move-btn"
                type="button"
                className="undo-btn"
                onClick={handleUndo}
                disabled={undoing || moving}
                aria-label={`Undo move to #${gameState.lastMove?.fromLocation}`}
                title={`Undo move (return to #${gameState.lastMove?.fromLocation})`}
              >
                <svg
                  className="undo-btn__icon"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M 7.5 5.5 L 3.5 9.5 L 7.5 13.5" />
                  <path d="M 3.5 9.5 H 12.5 A 4 4 0 0 1 16.5 13.5 V 14.5" />
                </svg>
                <span>Undo</span>
              </button>
            )}
            <div className="location-readout" aria-live="polite">
              <span className="location-readout__label">LOC</span>
              <span id="current-location-value" className="location-readout__value">
                #{gameState.location || '---'}
              </span>
            </div>
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

          {/* Navigation Compass Panel */}
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

            {/* Fluid Tactile 8-Point + Portal/Enter Compass Rose */}
            <div
              className={`compass-stage ${!hasDirection ? 'compass-stage--awaiting' : ''}`}
              role="group"
              aria-label="Compass direction selector"
            >
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
                const knownDest = !centerPortal ? currentKnownNeighbors[dir] : undefined;

                return (
                  <button
                    key={dir}
                    id={`compass-dir-${dir.toLowerCase()}`}
                    type="button"
                    className={`compass-node compass-pos-${dir} ${
                      centerPortal ? 'compass-node--portal' : ''
                    } ${knownDest ? 'compass-node--known' : ''}`}
                    aria-label={
                      centerPortal
                        ? 'Portal or Enter movement'
                        : knownDest
                          ? `Direction ${dir} (known location #${knownDest})`
                          : `Direction ${dir}`
                    }
                    aria-pressed={isSelected}
                    onClick={() => {
                      if (selectedDirection === dir) {
                        setSelectedDirection(null);
                        if (isLocationLocked) {
                          setTargetLoc('');
                        }
                      } else {
                        setSelectedDirection(dir);
                        if (!centerPortal && knownDest) {
                          setTargetLoc(knownDest);
                        } else if (isLocationLocked) {
                          setTargetLoc('');
                        }
                      }
                      if (moveError) setMoveError(null);
                    }}
                  >
                    {centerPortal ? (
                      <PortalDoorIcon />
                    ) : (
                      <>
                        <span className="compass-node__dir">{dir}</span>
                        {knownDest && (
                          <span className="compass-node__dest">#{knownDest}</span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Floating Bottom Chat-Style Location + Move Bar */}
      <div className="composer-dock">
        {moveError && (
          <div id="move-error-banner" className="composer-error-pill" role="alert">
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

        <form
          id="move-form"
          className={`composer-pill ${isPortal ? 'composer-pill--portal' : ''} ${
            isLocationLocked ? 'composer-pill--locked' : ''
          }`}
          onSubmit={handleMoveSubmit}
          noValidate
        >
          {isLocationLocked ? (
            <svg
              className="composer-lock-icon"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="4.5" y="9" width="11" height="8" rx="2" />
              <path d="M 7 9 V 6.5 A 3 3 0 0 1 13 6.5 V 9" />
            </svg>
          ) : (
            <span className="composer-hash" aria-hidden="true">
              #
            </span>
          )}
          <input
            id="target-location-input"
            className={`composer-input ${isLocationLocked ? 'composer-input--locked' : ''}`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            placeholder="Location #"
            aria-label={
              isLocationLocked
                ? `Locked known destination #${effectiveTargetLoc}`
                : 'Destination location number'
            }
            enterKeyHint="send"
            readOnly={isLocationLocked}
            value={effectiveTargetLoc}
            onChange={(e) => {
              if (isLocationLocked) return;
              const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
              setTargetLoc(digits);
              if (moveError) setMoveError(null);
            }}
          />
          {isLocationLocked && (
            <span className="composer-locked-badge" aria-hidden="true">
              KNOWN
            </span>
          )}
          <button
            id="submit-move-btn"
            type="submit"
            className={`btn composer-submit-btn ${
              !canMove
                ? 'btn--inactive'
                : isPortal
                  ? 'btn--amber'
                  : 'btn--primary'
            }`}
            disabled={moving || !canMove}
          >
            {moving ? (
              <span className="spinner" aria-hidden="true" />
            ) : !hasDirection ? (
              'Move'
            ) : isPortal ? (
              <>
                <PortalDoorIcon inline />
                <span>Portal / Enter</span>
              </>
            ) : (
              `Move ${selectedDirection}`
            )}
          </button>
        </form>
      </div>
    </>
  );
};

export default App;