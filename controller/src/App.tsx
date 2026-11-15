import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { GameState, ResourceColor, Direction, GraphPoint, GraphStroke } from './types';
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
  const {
    activeScreen,
    gameState,
    isSyncing,
    connect,
    crashLand,
    move,
    undoMove,
    adjustResource,
    addDrawingStroke,
    undoDrawingStroke,
    clearDrawings,
  } = useGameState();

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
          onAddStroke={addDrawingStroke}
          onUndoStroke={undoDrawingStroke}
          onClearStrokes={clearDrawings}
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

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

const NormalScreen: React.FC<{
  gameState: GameState;
  isSyncing: boolean;
  onMove: (loc: string, dir: Direction) => Promise<boolean>;
  onUndoMove: () => Promise<boolean>;
  onResourceChange: (color: ResourceColor, delta: number) => void;
  onAddStroke: (stroke: {
    color: string;
    isEraser: boolean;
    points: GraphPoint[];
  }) => Promise<boolean>;
  onUndoStroke: () => Promise<boolean>;
  onClearStrokes: () => Promise<boolean>;
}> = ({
  gameState,
  isSyncing,
  onMove,
  onUndoMove,
  onResourceChange,
  onAddStroke,
  onUndoStroke,
  onClearStrokes,
}) => {
  const [activeTab, setActiveTab] = useState<'navigate' | 'sketch'>('navigate');
  const [targetLoc, setTargetLoc] = useState('');
  const [selectedDirection, setSelectedDirection] = useState<Direction>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [undoing, setUndoing] = useState(false);

  // Sketch tab state
  const [sketchTool, setSketchTool] = useState<'draw' | 'erase' | 'pan'>('draw');
  const [sketchColor, setSketchColor] = useState<string>(gameState.color || '#10b981');

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

  const sketchSwatches = [
    gameState.color || '#10b981',
    '#f6f2e9',
    '#f59e0b',
    '#38bdf8',
    '#fb7185',
  ].filter((hex, idx, arr) => arr.findIndex((h) => h.toLowerCase() === hex.toLowerCase()) === idx);

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

        {/* Mode Tab Switcher: Compass & Resources vs Sketch Map */}
        <div className="controller-tabs" role="tablist" aria-label="Controller workspace tabs">
          <button
            id="tab-navigate"
            type="button"
            role="tab"
            aria-selected={activeTab === 'navigate'}
            className="controller-tab-btn"
            onClick={() => setActiveTab('navigate')}
          >
            <svg
              className="controller-tab-btn__icon"
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
            <span>Compass &amp; Resources</span>
          </button>

          <button
            id="tab-sketch"
            type="button"
            role="tab"
            aria-selected={activeTab === 'sketch'}
            className="controller-tab-btn"
            onClick={() => setActiveTab('sketch')}
          >
            <svg
              className="controller-tab-btn__icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" />
            </svg>
            <span>Sketch Map</span>
          </button>
        </div>

        {activeTab === 'navigate' ? (
          <div className="expedition-body">
            {/* Compact 3x2 Resource Tiles (2x3 on wide screens) */}
            <div className="resources-grid" role="group" aria-label="Explorer resources">
              {RESOURCE_META.map(({ key, label, hex }) => {
                const count = gameState.resources[key];
                return (
                  <div
                    key={key}
                    className="resource-tile"
                    style={{ '--tile-accent': hex } as React.CSSProperties}
                  >
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
                    stroke="rgba(226, 204, 162, 0.16)"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx="112"
                    cy="112"
                    r="64"
                    fill="none"
                    stroke="rgba(226, 204, 162, 0.08)"
                    strokeDasharray="2 4"
                    strokeWidth="1"
                  />
                  {/* Vantage Card Compass Diamond & Star Rose */}
                  <polygon
                    points="112,34 130,94 190,112 130,130 112,190 94,130 34,112 94,94"
                    fill="rgba(226, 204, 162, 0.03)"
                    stroke="rgba(226, 204, 162, 0.14)"
                    strokeWidth="1"
                  />
                  <polygon
                    points="112,68 156,112 112,156 68,112"
                    fill="none"
                    stroke="rgba(226, 204, 162, 0.12)"
                    strokeWidth="1"
                  />
                  <line
                    x1="112"
                    y1="28"
                    x2="112"
                    y2="196"
                    stroke="rgba(226, 204, 162, 0.1)"
                    strokeWidth="1"
                  />
                  <line
                    x1="28"
                    y1="112"
                    x2="196"
                    y2="112"
                    stroke="rgba(226, 204, 162, 0.1)"
                    strokeWidth="1"
                  />
                  <line
                    x1="52.6"
                    y1="52.6"
                    x2="171.4"
                    y2="171.4"
                    stroke="rgba(226, 204, 162, 0.07)"
                    strokeWidth="1"
                  />
                  <line
                    x1="171.4"
                    y1="52.6"
                    x2="52.6"
                    y2="171.4"
                    stroke="rgba(226, 204, 162, 0.07)"
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
                          {knownDest && <span className="compass-node__dest">#{knownDest}</span>}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <GraphSketchPanel
            gameState={gameState}
            sketchTool={sketchTool}
            sketchColor={sketchColor}
            onAddStroke={onAddStroke}
          />
        )}
      </section>

      {/* Bottom Floating Bar: Either Move Composer (Navigate Tab) or Sketch Controls (Sketch Tab) */}
      <div className="composer-dock">
        {activeTab === 'navigate' ? (
          <>
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
                  !canMove ? 'btn--inactive' : isPortal ? 'btn--amber' : 'btn--primary'
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
          </>
        ) : (
          <div className="sketch-dock-pill" role="toolbar" aria-label="Sketch tools">
            <div className="sketch-tool-group" role="group" aria-label="Drawing mode">
              <button
                id="sketch-tool-draw"
                type="button"
                className={`sketch-tool-btn ${
                  sketchTool === 'draw' ? 'sketch-tool-btn--active' : ''
                }`}
                onClick={() => setSketchTool('draw')}
              >
                Draw
              </button>
              <button
                id="sketch-tool-erase"
                type="button"
                className={`sketch-tool-btn ${
                  sketchTool === 'erase' ? 'sketch-tool-btn--active' : ''
                }`}
                onClick={() => setSketchTool('erase')}
              >
                Erase
              </button>
              <button
                id="sketch-tool-pan"
                type="button"
                className={`sketch-tool-btn ${
                  sketchTool === 'pan' ? 'sketch-tool-btn--active' : ''
                }`}
                onClick={() => setSketchTool('pan')}
              >
                Pan
              </button>
            </div>

            <div className="sketch-swatches" role="group" aria-label="Ink color">
              {sketchSwatches.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className="sketch-swatch-dot"
                  style={{ backgroundColor: hex }}
                  aria-label={`Ink color ${hex}`}
                  aria-pressed={sketchColor.toLowerCase() === hex.toLowerCase()}
                  onClick={() => {
                    setSketchColor(hex);
                    if (sketchTool === 'erase') setSketchTool('draw');
                  }}
                />
              ))}
            </div>

            <div className="sketch-actions-group">
              <button
                id="sketch-undo-btn"
                type="button"
                className="sketch-icon-btn"
                onClick={onUndoStroke}
                title="Undo last stroke"
                aria-label="Undo last stroke"
              >
                <svg
                  width="15"
                  height="15"
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
              </button>

              <button
                id="sketch-clear-btn"
                type="button"
                className="sketch-icon-btn sketch-icon-btn--danger"
                onClick={onClearStrokes}
                title="Clear your drawings at this location"
                aria-label="Clear your drawings at this location"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

// ==========================================
// GRAPH & LOCATION SKETCHPAD PANEL
// ==========================================

const GraphSketchPanel: React.FC<{
  gameState: GameState;
  sketchTool: 'draw' | 'erase' | 'pan';
  sketchColor: string;
  onAddStroke: (stroke: {
    color: string;
    isEraser: boolean;
    points: GraphPoint[];
  }) => Promise<boolean>;
}> = ({ gameState, sketchTool, sketchColor, onAddStroke }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inkLayerRef = useRef<HTMLCanvasElement | null>(null);

  const currentLocId = gameState.location;
  const snapshot = gameState.graphSnapshot;
  const currentNode = currentLocId ? snapshot.nodes[currentLocId] : undefined;
  const activeGroupId = currentNode?.groupId ?? 0;

  // All nodes in the player's connected graph (fallback to synthetic node if snapshot hasn't arrived yet)
  const groupNodes = Object.values(snapshot.nodes).filter((n) => n.groupId === activeGroupId);
  if (groupNodes.length === 0 && currentLocId) {
    groupNodes.push({ id: currentLocId, groupId: activeGroupId, lx: 0, ly: 0 });
  }

  const anchorLx = currentNode?.lx ?? 0;
  const anchorLy = currentNode?.ly ?? 0;

  const [viewMode, setViewMode] = useState<'location' | 'graph'>('location');
  const cameraRef = useRef<{ cx: number; cy: number; scale: number }>({
    cx: anchorLx,
    cy: anchorLy,
    scale: 1.15,
  });
  const liveStrokeRef = useRef<GraphStroke | null>(null);
  const pointerStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    lastX: number;
    lastY: number;
  }>({ active: false, pointerId: null, lastX: 0, lastY: 0 });

  const focusCurrentLocation = useCallback(() => {
    cameraRef.current = {
      cx: anchorLx,
      cy: anchorLy,
      scale: 1.15,
    };
    setViewMode('location');
  }, [anchorLx, anchorLy]);

  const fitFullGraph = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || groupNodes.length === 0) return;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const n of groupNodes) {
      minX = Math.min(minX, n.lx - 60);
      maxX = Math.max(maxX, n.lx + 60);
      minY = Math.min(minY, n.ly - 60);
      maxY = Math.max(maxY, n.ly + 60);
    }
    const spanX = Math.max(160, maxX - minX);
    const spanY = Math.max(160, maxY - minY);
    const scaleX = (canvas.width * 0.78) / spanX;
    const scaleY = (canvas.height * 0.78) / spanY;
    const scale = Math.max(0.42, Math.min(1.25, Math.min(scaleX, scaleY)));
    cameraRef.current = {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      scale,
    };
    setViewMode('graph');
  }, [groupNodes]);

  // Recenter when player moves to a new location
  useEffect(() => {
    cameraRef.current.cx = anchorLx;
    cameraRef.current.cy = anchorLy;
  }, [anchorLx, anchorLy, currentLocId]);

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const { cx, cy, scale } = cameraRef.current;

    ctx.clearRect(0, 0, w, h);

    // Helper: group-local (lx, ly) -> canvas pixel (px, py)
    const toScreenX = (lx: number) => w / 2 + (lx - cx) * scale;
    const toScreenY = (ly: number) => h / 2 + (ly - cy) * scale;

    // 1. Cartographic Grid in Group-Local Space
    const gridStep = 80;
    const worldLeft = cx - w / (2 * scale);
    const worldRight = cx + w / (2 * scale);
    const worldTop = cy - h / (2 * scale);
    const worldBottom = cy + h / (2 * scale);

    const startGx = Math.floor(worldLeft / gridStep) * gridStep;
    const startGy = Math.floor(worldTop / gridStep) * gridStep;

    ctx.save();
    for (let gx = startGx; gx <= worldRight; gx += gridStep) {
      const sx = toScreenX(gx);
      const isMajor = Math.round(gx / gridStep) % 4 === 0;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
      ctx.strokeStyle = isMajor ? 'rgba(226, 204, 162, 0.08)' : 'rgba(226, 204, 162, 0.03)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (let gy = startGy; gy <= worldBottom; gy += gridStep) {
      const sy = toScreenY(gy);
      const isMajor = Math.round(gy / gridStep) % 4 === 0;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
      ctx.strokeStyle = isMajor ? 'rgba(226, 204, 162, 0.08)' : 'rgba(226, 204, 162, 0.03)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    // 2. Group-Anchored Ink Layer (rendered on offscreen canvas so eraser only erases ink)
    const groupStrokes = snapshot.drawings.filter(
      (s) => s.groupId === undefined || s.groupId === activeGroupId
    );
    const allStrokes = liveStrokeRef.current
      ? [...groupStrokes, liveStrokeRef.current]
      : groupStrokes;

    if (allStrokes.length > 0) {
      if (!inkLayerRef.current) {
        inkLayerRef.current = document.createElement('canvas');
      }
      const inkCanvas = inkLayerRef.current;
      if (inkCanvas.width !== w || inkCanvas.height !== h) {
        inkCanvas.width = w;
        inkCanvas.height = h;
      }
      const inkCtx = inkCanvas.getContext('2d');
      if (inkCtx) {
        inkCtx.clearRect(0, 0, w, h);
        inkCtx.save();
        inkCtx.translate(w / 2, h / 2);
        inkCtx.scale(scale, scale);
        inkCtx.translate(-cx, -cy);
        inkCtx.lineCap = 'round';
        inkCtx.lineJoin = 'round';

        allStrokes.forEach((stroke) => {
          if (stroke.points.length === 0) return;
          inkCtx.globalCompositeOperation = stroke.isEraser ? 'destination-out' : 'source-over';
          inkCtx.beginPath();
          inkCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
          if (stroke.points.length === 1) {
            inkCtx.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y + 0.1);
          } else {
            for (let i = 1; i < stroke.points.length; i++) {
              inkCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
            }
          }
          inkCtx.lineWidth = stroke.isEraser ? 22 : 3;
          inkCtx.strokeStyle = stroke.isEraser ? '#000000' : stroke.color;
          inkCtx.stroke();
        });

        inkCtx.restore();
        ctx.drawImage(inkCanvas, 0, 0);
      }
    }

    // 3. Graph Edges & Vantage Location Cards in Group-Local Space
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);

    const groupNodeMap = new Map(groupNodes.map((n) => [n.id, n]));

    // Draw edges between nodes in this group
    for (const [uId, edgeList] of Object.entries(snapshot.edges)) {
      const uNode = groupNodeMap.get(uId);
      if (!uNode) continue;
      edgeList.forEach((edge) => {
        const vNode = groupNodeMap.get(edge.id);
        if (!vNode) return;
        const dx = vNode.lx - uNode.lx;
        const dy = vNode.ly - uNode.ly;
        const len = Math.hypot(dx, dy);
        if (len === 0) return;
        const clearance = 25;
        const sx = uNode.lx + (dx / len) * clearance;
        const sy = uNode.ly + (dy / len) * clearance;
        const ex = vNode.lx - (dx / len) * clearance;
        const ey = vNode.ly - (dy / len) * clearance;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = 'rgba(229, 207, 158, 0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }

    // Draw Vantage Location Card nodes
    const cardW = 48;
    const cardH = 32;
    groupNodes.forEach((n) => {
      const isCurrent = n.id === currentLocId;
      const x = n.lx - cardW / 2;
      const y = n.ly - cardH / 2;

      drawRoundedRect(ctx, x, y, cardW, cardH, 7);
      ctx.fillStyle = isCurrent ? 'rgba(20, 25, 35, 0.94)' : 'rgba(20, 25, 35, 0.84)';
      ctx.fill();

      ctx.strokeStyle = isCurrent ? gameState.color : 'rgba(226, 204, 162, 0.42)';
      ctx.lineWidth = isCurrent ? 2 : 1.3;
      ctx.stroke();

      drawRoundedRect(ctx, x + 2, y + 2, cardW - 4, cardH - 4, 5);
      ctx.strokeStyle = 'rgba(255, 248, 231, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isCurrent ? '#ffffff' : '#f6f2e9';
      ctx.fillText(`#${n.id}`, n.lx, n.ly + 1);
    });

    ctx.restore();
  }, [activeGroupId, currentLocId, gameState.color, groupNodes, snapshot]);

  // Keep canvas sized to wrapper and redraw
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const syncSize = () => {
      const rect = wrap.getBoundingClientRect();
      canvas.width = Math.max(240, Math.floor(rect.width));
      canvas.height = Math.max(180, Math.floor(rect.height));
      renderCanvas();
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [renderCanvas]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const screenToLocalPoint = (clientX: number, clientY: number): GraphPoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const { cx, cy, scale } = cameraRef.current;
    return {
      x: cx + (px - canvas.width / 2) / scale,
      y: cy + (py - canvas.height / 2) / scale,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    pointerStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      lastX: e.clientX,
      lastY: e.clientY,
    };

    if (sketchTool === 'draw' || sketchTool === 'erase') {
      const pt = screenToLocalPoint(e.clientX, e.clientY);
      liveStrokeRef.current = {
        groupId: activeGroupId,
        author: gameState.name,
        locationId: currentLocId ?? undefined,
        color: sketchColor,
        isEraser: sketchTool === 'erase',
        points: [pt],
      };
      renderCanvas();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ps = pointerStateRef.current;
    if (!ps.active || ps.pointerId !== e.pointerId) return;

    if ((sketchTool === 'draw' || sketchTool === 'erase') && liveStrokeRef.current) {
      const pt = screenToLocalPoint(e.clientX, e.clientY);
      liveStrokeRef.current.points.push(pt);
      renderCanvas();
    } else if (sketchTool === 'pan') {
      const dx = e.clientX - ps.lastX;
      const dy = e.clientY - ps.lastY;
      cameraRef.current.cx -= dx / cameraRef.current.scale;
      cameraRef.current.cy -= dy / cameraRef.current.scale;
      ps.lastX = e.clientX;
      ps.lastY = e.clientY;
      renderCanvas();
    }
  };

  const handlePointerUpOrCancel = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ps = pointerStateRef.current;
    if (!ps.active || ps.pointerId !== e.pointerId) return;
    ps.active = false;
    ps.pointerId = null;

    const stroke = liveStrokeRef.current;
    liveStrokeRef.current = null;
    if (stroke && stroke.points.length > 0) {
      // Convert points from group-local (lx, ly) to offsets relative to current location (anchorLx, anchorLy)
      const relativePoints = stroke.points.map((pt) => ({
        x: Math.round((pt.x - anchorLx) * 10) / 10,
        y: Math.round((pt.y - anchorLy) * 10) / 10,
      }));
      await onAddStroke({
        color: stroke.color,
        isEraser: stroke.isEraser,
        points: relativePoints,
      });
    } else {
      renderCanvas();
    }
  };

  const cursorClass =
    sketchTool === 'draw'
      ? 'sketch-canvas--draw'
      : sketchTool === 'erase'
        ? 'sketch-canvas--erase'
        : 'sketch-canvas--pan';

  return (
    <div className="sketch-panel" role="region" aria-label="Graph and location sketchpad">
      <div className="sketch-header">
        <div className="sketch-header__meta">
          <h2 className="section-title">Graph Sketch</h2>
          <span className="sketch-header__sub">
            {groupNodes.length} {groupNodes.length === 1 ? 'NODE' : 'NODES'} IN GRAPH
          </span>
        </div>

        <div className="sketch-view-controls">
          <button
            id="sketch-focus-loc-btn"
            type="button"
            className={`sketch-chip-btn ${
              viewMode === 'location' ? 'sketch-chip-btn--active' : ''
            }`}
            onClick={() => {
              focusCurrentLocation();
              renderCanvas();
            }}
          >
            Focus #{currentLocId || '---'}
          </button>
          <button
            id="sketch-fit-graph-btn"
            type="button"
            className={`sketch-chip-btn ${viewMode === 'graph' ? 'sketch-chip-btn--active' : ''}`}
            onClick={() => {
              fitFullGraph();
              renderCanvas();
            }}
          >
            Fit Graph
          </button>
        </div>
      </div>

      <div ref={wrapRef} className="sketch-canvas-wrap">
        <canvas
          ref={canvasRef}
          id="controller-sketch-canvas"
          className={`sketch-canvas ${cursorClass}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUpOrCancel}
          onPointerCancel={handlePointerUpOrCancel}
        />
        <div className="sketch-hint-overlay" aria-hidden="true">
          <span>Drawings belong to your graph &amp; snap when graphs join</span>
          <span>{sketchTool.toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
};

export default App;