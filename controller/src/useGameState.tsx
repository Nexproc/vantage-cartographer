import { useState, useRef, useEffect } from 'react';
import type { GameState, ResourceColor, Direction, CompassDirection } from './types';
import { GameService } from './GameService';

const OPPOSITE_COMPASS_DIR: Record<CompassDirection, CompassDirection> = {
  N: 'S',
  S: 'N',
  E: 'W',
  W: 'E',
  NE: 'SW',
  SW: 'NE',
  NW: 'SE',
  SE: 'NW',
};

const COMPASS_DIR_SET = new Set<string>(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);

function isCompassDirection(val: string | null | undefined): val is CompassDirection {
  return typeof val === 'string' && COMPASS_DIR_SET.has(val);
}

function parseKnownNeighbors(raw: unknown): Partial<Record<CompassDirection, string>> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Partial<Record<CompassDirection, string>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (isCompassDirection(k) && typeof v === 'string' && v.length > 0) {
      result[k] = v;
    }
  }
  return result;
}

const initialGameState: GameState = {
  code: '',
  name: '',
  color: '#10b981',
  location: null,
  direction: null,
  resources: { red: 0, blue: 0, green: 0, yellow: 0, purple: 0, orange: 0 },
  knownEdges: {},
};

export const useGameState = () => {
  const [activeScreen, setActiveScreen] = useState<'connect' | 'setup' | 'normal'>('connect');
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [isSyncing, setIsSyncing] = useState(false);

  // Reference to latest state for async callbacks
  const latestState = useRef(gameState);
  useEffect(() => { latestState.current = gameState; }, [gameState]);

  // Sync locks
  const syncLock = useRef({ timer: null as ReturnType<typeof setTimeout> | null, isAwaitingAck: false, pendingSync: false });

  const connect = async (code: string, name: string) => {
    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();
    try {
      const data = await GameService.connect(cleanCode, cleanName);
      const existingLoc = typeof data.location === 'string' ? data.location : null;
      const existingColor = typeof data.color === 'string' ? data.color : undefined;
      const serverNeighbors = parseKnownNeighbors(data.knownNeighbors);

      setGameState(prev => {
        const nextEdges = { ...prev.knownEdges };
        if (existingLoc && Object.keys(serverNeighbors).length > 0) {
          nextEdges[existingLoc] = { ...(nextEdges[existingLoc] ?? {}), ...serverNeighbors };
        }
        return {
          ...prev,
          code: cleanCode,
          name: cleanName,
          location: existingLoc ?? prev.location,
          color: existingColor ?? prev.color,
          knownEdges: nextEdges,
        };
      });
      setActiveScreen(data.hasLocation ? 'normal' : 'setup');
      return true;
    } catch (e) {
      console.error("Connection failed:", e);
      return false;
    }
  };

  const crashLand = async (location: string, color: string): Promise<boolean> => {
    try {
      const data = await GameService.crashLand(gameState.code, gameState.name, location, color);
      const confirmedLoc = typeof data.confirmedLocation === 'string' ? data.confirmedLocation : location;
      const serverNeighbors = parseKnownNeighbors(data.knownNeighbors);

      setGameState(prev => {
        const nextEdges = { ...prev.knownEdges };
        if (Object.keys(serverNeighbors).length > 0) {
          nextEdges[confirmedLoc] = { ...(nextEdges[confirmedLoc] ?? {}), ...serverNeighbors };
        }
        return { ...prev, location: confirmedLoc, color, knownEdges: nextEdges };
      });
      setActiveScreen('normal');
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const move = async (targetLoc: string, direction: Direction): Promise<boolean> => {
    try {
      const fromLoc = gameState.location;
      const data = await GameService.move(gameState.code, gameState.name, fromLoc, targetLoc, direction);
      const nextLoc = typeof data.newLocation === 'string' ? data.newLocation : targetLoc;
      const serverNeighbors = parseKnownNeighbors(data.knownNeighbors);

      setGameState(prev => {
        const nextEdges = { ...prev.knownEdges };

        // Record non-special edge bidirectionally (with explicit outgoing taking precedence)
        if (fromLoc && isCompassDirection(direction)) {
          nextEdges[fromLoc] = {
            ...(nextEdges[fromLoc] ?? {}),
            [direction]: nextLoc,
          };
          const oppDir = OPPOSITE_COMPASS_DIR[direction];
          const existingTargetEdges = nextEdges[nextLoc] ?? {};
          nextEdges[nextLoc] = {
            ...existingTargetEdges,
            // Only set reverse edge if an explicit outgoing edge wasn't already recorded
            [oppDir]: existingTargetEdges[oppDir] ?? fromLoc,
          };
        }

        if (Object.keys(serverNeighbors).length > 0) {
          nextEdges[nextLoc] = {
            ...(nextEdges[nextLoc] ?? {}),
            ...serverNeighbors,
          };
        }

        return { ...prev, location: nextLoc, direction, knownEdges: nextEdges };
      });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const adjustResource = (color: ResourceColor, delta: number) => {
    setGameState(prev => ({
      ...prev,
      resources: { ...prev.resources, [color]: Math.max(0, prev.resources[color] + delta) }
    }));

    setIsSyncing(true);
    if (syncLock.current.timer) clearTimeout(syncLock.current.timer);
    syncLock.current.timer = setTimeout(executeResourceSync, 750);
  };

  const executeResourceSync = async () => {
    if (syncLock.current.isAwaitingAck) {
      syncLock.current.pendingSync = true;
      return;
    }
    syncLock.current.isAwaitingAck = true;

    try {
      const state = latestState.current;
      await GameService.syncResources(state.code, state.name, state.resources);
    } catch (e) {
      console.error(e);
    } finally {
      syncLock.current.isAwaitingAck = false;
      if (syncLock.current.pendingSync) {
        syncLock.current.pendingSync = false;
        executeResourceSync();
      } else {
        setIsSyncing(false);
      }
    }
  };

  return { activeScreen, gameState, isSyncing, connect, crashLand, move, adjustResource };
};