import { useState, useRef, useEffect } from 'react';
import type {
  GameState,
  ResourceColor,
  Direction,
  CompassDirection,
  GraphSnapshot,
  GraphPoint,
  GraphStroke,
  GraphNode,
  GraphEdge,
} from './types';
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

function parseKnownEdgesMap(
  raw: unknown
): Record<string, Partial<Record<CompassDirection, string>>> | null {
  if (!raw || typeof raw !== 'object') return null;
  const result: Record<string, Partial<Record<CompassDirection, string>>> = {};
  for (const [nodeId, neighborsRaw] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof nodeId === 'string' && nodeId.length > 0) {
      const parsed = parseKnownNeighbors(neighborsRaw);
      if (Object.keys(parsed).length > 0) {
        result[nodeId] = parsed;
      }
    }
  }
  return result;
}

function parseGraphSnapshot(raw: unknown): GraphSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const nodes: Record<string, GraphNode> = {};
  if (obj.nodes && typeof obj.nodes === 'object') {
    for (const [id, nRaw] of Object.entries(obj.nodes as Record<string, unknown>)) {
      if (nRaw && typeof nRaw === 'object') {
        const n = nRaw as Record<string, unknown>;
        if (typeof n.groupId === 'number' && typeof n.lx === 'number' && typeof n.ly === 'number') {
          nodes[id] = { id, groupId: n.groupId, lx: n.lx, ly: n.ly };
        }
      }
    }
  }

  const edges: Record<string, GraphEdge[]> = {};
  if (obj.edges && typeof obj.edges === 'object') {
    for (const [u, listRaw] of Object.entries(obj.edges as Record<string, unknown>)) {
      if (Array.isArray(listRaw)) {
        edges[u] = listRaw
          .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
          .map((e) => ({
            id: String(e.id ?? ''),
            dir: String(e.dir ?? ''),
            characters: Array.isArray(e.characters) ? e.characters.map(String) : [],
          }));
      }
    }
  }

  const characters: Record<string, { color: string; location_id: string }> = {};
  if (obj.characters && typeof obj.characters === 'object') {
    for (const [cName, cRaw] of Object.entries(obj.characters as Record<string, unknown>)) {
      if (cRaw && typeof cRaw === 'object') {
        const c = cRaw as Record<string, unknown>;
        if (typeof c.location_id === 'string') {
          characters[cName] = {
            color: typeof c.color === 'string' ? c.color : '#10b981',
            location_id: c.location_id,
          };
        }
      }
    }
  }

  const drawings: GraphStroke[] = [];
  if (Array.isArray(obj.drawings)) {
    for (const sRaw of obj.drawings) {
      if (sRaw && typeof sRaw === 'object') {
        const s = sRaw as Record<string, unknown>;
        if (Array.isArray(s.points)) {
          const pts: GraphPoint[] = [];
          for (const p of s.points) {
            if (p && typeof p === 'object') {
              const pt = p as Record<string, unknown>;
              if (typeof pt.x === 'number' && typeof pt.y === 'number') {
                pts.push({ x: pt.x, y: pt.y });
              }
            }
          }
          drawings.push({
            id: typeof s.id === 'string' ? s.id : undefined,
            groupId: typeof s.groupId === 'number' ? s.groupId : undefined,
            author: typeof s.author === 'string' ? s.author : undefined,
            locationId: typeof s.locationId === 'string' ? s.locationId : undefined,
            color: typeof s.color === 'string' ? s.color : '#f6f2e9',
            isEraser: Boolean(s.isEraser),
            points: pts,
          });
        }
      }
    }
  }

  return { nodes, edges, characters, drawings };
}

// Merge incoming neighbors without overriding any already-known cardinal/intercardinal destination
function mergeWithoutOverriding(
  existing: Partial<Record<CompassDirection, string>> | undefined,
  incoming: Partial<Record<CompassDirection, string>>
): Partial<Record<CompassDirection, string>> {
  const merged: Partial<Record<CompassDirection, string>> = { ...(existing ?? {}) };
  for (const [dir, dest] of Object.entries(incoming) as Array<
    [CompassDirection, string | undefined]
  >) {
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

const emptyGraphSnapshot: GraphSnapshot = {
  nodes: {},
  edges: {},
  characters: {},
  drawings: [],
};

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
  graphSnapshot: emptyGraphSnapshot,
};

export const useGameState = () => {
  const [activeScreen, setActiveScreen] = useState<'connect' | 'setup' | 'normal'>('connect');
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [isSyncing, setIsSyncing] = useState(false);

  // Reference to latest state for async callbacks
  const latestState = useRef(gameState);
  useEffect(() => {
    latestState.current = gameState;
  }, [gameState]);

  // Subscribe to real-time MAP_SYNC broadcasts from HostMap (when any player moves, undoes, or draws)
  useEffect(() => {
    return GameService.onMapSync((rawKnownEdges, rawGraphSnapshot) => {
      const authoritativeEdges = parseKnownEdgesMap(rawKnownEdges);
      const parsedSnapshot = parseGraphSnapshot(rawGraphSnapshot);
      setGameState((prev) => ({
        ...prev,
        knownEdges: authoritativeEdges ?? prev.knownEdges,
        graphSnapshot: parsedSnapshot ?? prev.graphSnapshot,
      }));
    });
  }, []);

  // Sync locks
  const syncLock = useRef({
    timer: null as ReturnType<typeof setTimeout> | null,
    isAwaitingAck: false,
    pendingSync: false,
  });

  const connect = async (code: string, name: string) => {
    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();
    try {
      const data = await GameService.connect(cleanCode, cleanName);
      const existingLoc = typeof data.location === 'string' ? data.location : null;
      const existingColor = typeof data.color === 'string' ? data.color : undefined;
      const serverNeighbors = parseKnownNeighbors(data.knownNeighbors);
      const serverEdgesMap = parseKnownEdgesMap(data.knownEdges);
      const parsedSnapshot = parseGraphSnapshot(data.graphSnapshot);

      setGameState((prev) => {
        const nextEdges = serverEdgesMap ? { ...serverEdgesMap } : { ...prev.knownEdges };
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
          graphSnapshot: parsedSnapshot ?? prev.graphSnapshot,
        };
      });
      setActiveScreen(data.hasLocation ? 'normal' : 'setup');
      return true;
    } catch (e) {
      console.error('Connection failed:', e);
      return false;
    }
  };

  const crashLand = async (location: string, color: string): Promise<boolean> => {
    try {
      const data = await GameService.crashLand(gameState.code, gameState.name, location, color);
      const confirmedLoc =
        typeof data.confirmedLocation === 'string' ? data.confirmedLocation : location;
      const serverNeighbors = parseKnownNeighbors(data.knownNeighbors);
      const serverEdgesMap = parseKnownEdgesMap(data.knownEdges);
      const parsedSnapshot = parseGraphSnapshot(data.graphSnapshot);

      setGameState((prev) => {
        const nextEdges = serverEdgesMap ? { ...serverEdgesMap } : { ...prev.knownEdges };
        if (Object.keys(serverNeighbors).length > 0) {
          nextEdges[confirmedLoc] = mergeWithoutOverriding(
            nextEdges[confirmedLoc],
            serverNeighbors
          );
        }
        return {
          ...prev,
          location: confirmedLoc,
          color,
          knownEdges: nextEdges,
          lastMove: null,
          graphSnapshot: parsedSnapshot ?? prev.graphSnapshot,
        };
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
      const data = await GameService.move(
        gameState.code,
        gameState.name,
        fromLoc,
        targetLoc,
        direction
      );
      const nextLoc = typeof data.newLocation === 'string' ? data.newLocation : targetLoc;
      const serverNeighbors = parseKnownNeighbors(data.knownNeighbors);
      const serverEdgesMap = parseKnownEdgesMap(data.knownEdges);
      const parsedSnapshot = parseGraphSnapshot(data.graphSnapshot);

      setGameState((prev) => {
        const nextEdges = serverEdgesMap ? { ...serverEdgesMap } : { ...prev.knownEdges };
        const nextCounts = { ...prev.edgeTraverseCounts };
        let edgeKey: string | null = null;

        // Record non-special edge bidirectionally WITHOUT overriding existing known directions
        if (fromLoc && isCompassDirection(direction)) {
          edgeKey = canonicalEdgeKey(fromLoc, direction, nextLoc);
          nextCounts[edgeKey] = (nextCounts[edgeKey] ?? 0) + 1;

          nextEdges[fromLoc] = mergeWithoutOverriding(nextEdges[fromLoc], {
            [direction]: nextLoc,
          });
          const oppDir = OPPOSITE_COMPASS_DIR[direction];
          nextEdges[nextLoc] = mergeWithoutOverriding(nextEdges[nextLoc], {
            [oppDir]: fromLoc,
          });
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
          graphSnapshot: parsedSnapshot ?? prev.graphSnapshot,
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
      const revertedLoc =
        typeof data.revertedLocation === 'string' ? data.revertedLocation : last.fromLocation;
      const serverEdgeRemoved = data.edgeRemoved === true;
      const serverNeighbors = parseKnownNeighbors(data.knownNeighbors);
      const serverEdgesMap = parseKnownEdgesMap(data.knownEdges);
      const parsedSnapshot = parseGraphSnapshot(data.graphSnapshot);

      setGameState((prev) => {
        const nextEdges = serverEdgesMap ? { ...serverEdgesMap } : { ...prev.knownEdges };
        const nextCounts = { ...prev.edgeTraverseCounts };

        if (isCompassDirection(last.direction) && last.edgeKey) {
          const prevCount = nextCounts[last.edgeKey] ?? 1;
          const onlyCrossedOnce =
            prevCount <= 1 && (data.edgeRemoved === undefined || serverEdgeRemoved);

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
          graphSnapshot: parsedSnapshot ?? prev.graphSnapshot,
        };
      });
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const addDrawingStroke = async (stroke: {
    color: string;
    isEraser: boolean;
    points: GraphPoint[]; // relative to current location (anchorLocation)
  }): Promise<boolean> => {
    const state = latestState.current;
    const anchorLoc = state.location;
    if (!anchorLoc || stroke.points.length === 0) return false;

    const anchorNode = state.graphSnapshot.nodes[anchorLoc];
    const baseLx = anchorNode ? anchorNode.lx : 0;
    const baseLy = anchorNode ? anchorNode.ly : 0;
    const groupId = anchorNode ? anchorNode.groupId : 0;
    const strokeId = `${state.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const optimisticStroke: GraphStroke = {
      id: strokeId,
      groupId,
      author: state.name,
      locationId: anchorLoc,
      color: stroke.color,
      isEraser: stroke.isEraser,
      points: stroke.points.map((pt) => ({ x: baseLx + pt.x, y: baseLy + pt.y })),
    };

    setGameState((prev) => ({
      ...prev,
      graphSnapshot: {
        ...prev.graphSnapshot,
        drawings: [...prev.graphSnapshot.drawings, optimisticStroke],
      },
    }));

    try {
      setIsSyncing(true);
      const data = await GameService.draw(state.code, state.name, anchorLoc, 'add', {
        id: strokeId,
        color: stroke.color,
        isEraser: stroke.isEraser,
        points: stroke.points,
        pointsAreRelativeToAnchor: true,
      });
      const parsedSnapshot = parseGraphSnapshot(data.graphSnapshot);
      if (parsedSnapshot) {
        setGameState((prev) => ({ ...prev, graphSnapshot: parsedSnapshot }));
      }
      return true;
    } catch (e) {
      console.error('Failed to sync stroke:', e);
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  const undoDrawingStroke = async (): Promise<boolean> => {
    const state = latestState.current;
    try {
      setIsSyncing(true);
      const data = await GameService.draw(state.code, state.name, state.location, 'undo');
      const parsedSnapshot = parseGraphSnapshot(data.graphSnapshot);
      if (parsedSnapshot) {
        setGameState((prev) => ({ ...prev, graphSnapshot: parsedSnapshot }));
      }
      return true;
    } catch (e) {
      console.error('Failed to undo stroke:', e);
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  const clearDrawings = async (): Promise<boolean> => {
    const state = latestState.current;
    try {
      setIsSyncing(true);
      const data = await GameService.draw(state.code, state.name, state.location, 'clear');
      const parsedSnapshot = parseGraphSnapshot(data.graphSnapshot);
      if (parsedSnapshot) {
        setGameState((prev) => ({ ...prev, graphSnapshot: parsedSnapshot }));
      }
      return true;
    } catch (e) {
      console.error('Failed to clear drawings:', e);
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  const adjustResource = (color: ResourceColor, delta: number) => {
    setGameState((prev) => ({
      ...prev,
      resources: { ...prev.resources, [color]: Math.max(0, prev.resources[color] + delta) },
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

  return {
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
  };
};