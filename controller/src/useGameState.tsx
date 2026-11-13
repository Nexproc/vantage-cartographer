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

// Merge incoming neighbors without overriding any already-known cardinal/intercardinal destination
function mergeWithoutOverriding(
  existing: Partial<Record<CompassDirection, string>> | undefined,
  incoming: Partial<Record<CompassDirection, string>>
): Partial<Record<CompassDirection, string>> {
  const merged: Partial<Record<CompassDirection, string>> = { ...(existing ?? {}) };
  for (const [dir, dest] of Object.entries(incoming) as Array<[CompassDirection, string | undefined]>) {
    if (dest && !merged[dir]) {
      merged[dir] = dest;
    }
  }
  return merged;
}

function canonicalEdgeKey(fromLoc: string, dir: CompassDirection, toLoc: string): string {
  const oppDir = OPPOSITE_COMPASS_DIR[dir];
  const a = `${fromLoc}:${dir}:${toLoc}`;
  const b = `${toLoc}:${oppDir}:${fromLoc}`;
  return a < b ? a : b;
}

const initialGameState: GameState = {
  code: '',
  name: '',
  color: '#10b981',
  location: null,
  direction: null,
  resources: { red: 0, blue: 0, green: 0, yellow: 0, purple: 0, orange: 0 },
  knownEdges: {},
  edgeTraverseCounts: {},
  lastMove: null,
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
          nextEdges[existingLoc] = mergeWithoutOverriding(nextEdges[existingLoc], serverNeighbors);
        }
        return {
          ...prev,
          code: cleanCode,
          name: cleanName,
          location: existingLoc ?? prev.location,
          color: existingColor ?? prev.color,
          knownEdges: nextEdges,
          lastMove: null,
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
          nextEdges[confirmedLoc] = mergeWithoutOverriding(nextEdges[confirmedLoc], serverNeighbors);
        }
        return { ...prev, location: confirmedLoc, color, knownEdges: nextEdges, lastMove: null };
      });
      setActiveScreen('normal');
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const move = async (targetLoc: string, direction: Direction): Promise<boolean> => {
    if (!direction) return false;
    try {
      const fromLoc = gameState.location;
      const data = await GameService.move(gameState.code, gameState.name, fromLoc, targetLoc, direction);
      const nextLoc = typeof data.newLocation === 'string' ? data.newLocation : targetLoc;
      const serverNeighbors = parseKnownNeighbors(data.knownNeighbors);

      setGameState(prev => {
        const nextEdges = { ...prev.knownEdges };
        const nextCounts = { ...prev.edgeTraverseCounts };
        let edgeKey: string | null = null;

        // Record non-special edge bidirectionally WITHOUT overriding existing known directions
        if (fromLoc && isCompassDirection(direction)) {
          edgeKey = canonicalEdgeKey(fromLoc, direction, nextLoc);
          nextCounts[edgeKey] = (nextCounts[edgeKey] ?? 0) + 1;

          nextEdges[fromLoc] = mergeWithoutOverriding(nextEdges[fromLoc], { [direction]: nextLoc });
          const oppDir = OPPOSITE_COMPASS_DIR[direction];
          nextEdges[nextLoc] = mergeWithoutOverriding(nextEdges[nextLoc], { [oppDir]: fromLoc });
        }

        if (Object.keys(serverNeighbors).length > 0) {
          nextEdges[nextLoc] = mergeWithoutOverriding(nextEdges[nextLoc], serverNeighbors);
        }

        return {
          ...prev,
          location: nextLoc,
          direction,
          knownEdges: nextEdges,
          edgeTraverseCounts: nextCounts,
          lastMove: fromLoc
            ? {
                fromLocation: fromLoc,
                toLocation: nextLoc,
                direction,
                edgeKey,
              }
            : null,
        };
      });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const undoMove = async (): Promise<boolean> => {
    const last = gameState.lastMove;
    if (!last) return false;

    try {
      const data = await GameService.undo(
        gameState.code,
        gameState.name,
        last.fromLocation,
        last.toLocation,
        last.direction
      );
      const revertedLoc = typeof data.revertedLocation === 'string' ? data.revertedLocation : last.fromLocation;
      const serverEdgeRemoved = data.edgeRemoved === true;
      const serverNeighbors = parseKnownNeighbors(data.knownNeighbors);

      setGameState(prev => {
        const nextEdges = { ...prev.knownEdges };
        const nextCounts = { ...prev.edgeTraverseCounts };

        if (isCompassDirection(last.direction) && last.edgeKey) {
          const prevCount = nextCounts[last.edgeKey] ?? 1;
          const onlyCrossedOnce = prevCount <= 1 && (data.edgeRemoved === undefined || serverEdgeRemoved);

          if (onlyCrossedOnce) {
            delete nextCounts[last.edgeKey];
            const fromMap = { ...(nextEdges[last.fromLocation] ?? {}) };
            if (fromMap[last.direction] === last.toLocation) {
              delete fromMap[last.direction];
            }
            nextEdges[last.fromLocation] = fromMap;

            const oppDir = OPPOSITE_COMPASS_DIR[last.direction];
            const toMap = { ...(nextEdges[last.toLocation] ?? {}) };
            if (toMap[oppDir] === last.fromLocation) {
              delete toMap[oppDir];
            }
            nextEdges[last.toLocation] = toMap;
          } else {
            nextCounts[last.edgeKey] = Math.max(1, prevCount - 1);
          }
        }

        if (Object.keys(serverNeighbors).length > 0) {
          nextEdges[revertedLoc] = mergeWithoutOverriding(nextEdges[revertedLoc], serverNeighbors);
        }

        return {
          ...prev,
          location: revertedLoc,
          direction: null,
          knownEdges: nextEdges,
          edgeTraverseCounts: nextCounts,
          lastMove: null,
        };
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

  return { activeScreen, gameState, isSyncing, connect, crashLand, move, undoMove, adjustResource };
};