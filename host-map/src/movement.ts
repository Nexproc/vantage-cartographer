import type {
  DrawPayload,
  ExportedGameSave,
  GameState,
  GraphSnapshot,
  MovePayload,
  Stroke,
} from './types.ts';

export const DIRS: Record<string, { x: number; y: number }> = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
  NE: { x: 1, y: -1 },
  NW: { x: -1, y: -1 },
  SE: { x: 1, y: 1 },
  SW: { x: -1, y: 1 },
};

export const OPPOSITE_DIRS: Record<string, string> = {
  N: 'S',
  S: 'N',
  E: 'W',
  W: 'E',
  NE: 'SW',
  SW: 'NE',
  NW: 'SE',
  SE: 'NW',
};

export const getKnownNeighbors = (
  state: GameState,
  locationId: string | null | undefined
): Record<string, string> => {
  if (!locationId) return {};
  const neighbors: Record<string, string> = {};

  // 1. Explicit outgoing non-special edges from locationId (keep first known edge per direction)
  const outgoing = state.mapAdjacency[locationId];
  if (outgoing) {
    for (const edge of outgoing) {
      if (!edge.dir.startsWith('Special') && DIRS[edge.dir]) {
        if (!neighbors[edge.dir]) {
          neighbors[edge.dir] = edge.id;
        }
      }
    }
  }

  // 2. Incoming non-special edges (u --dir--> locationId implies locationId --opposite(dir)--> u)
  // Do NOT override if this direction already has a known destination
  for (const fromNodeId in state.mapAdjacency) {
    for (const edge of state.mapAdjacency[fromNodeId]) {
      if (edge.id === locationId && !edge.dir.startsWith('Special')) {
        const opp = OPPOSITE_DIRS[edge.dir];
        if (opp && !neighbors[opp]) {
          neighbors[opp] = fromNodeId;
        }
      }
    }
  }

  return neighbors;
};

export const getAllKnownEdges = (
  state: GameState
): Record<string, Record<string, string>> => {
  const allNodeIds = new Set<string>(Object.keys(state.nodes));
  for (const u in state.mapAdjacency) {
    allNodeIds.add(u);
    for (const edge of state.mapAdjacency[u]) {
      allNodeIds.add(edge.id);
    }
  }
  const result: Record<string, Record<string, string>> = {};
  for (const nodeId of allNodeIds) {
    const neighbors = getKnownNeighbors(state, nodeId);
    if (Object.keys(neighbors).length > 0) {
      result[nodeId] = neighbors;
    }
  }
  return result;
};

export const getGraphSnapshot = (state: GameState): GraphSnapshot => {
  const nodes: GraphSnapshot['nodes'] = {};
  for (const id in state.nodes) {
    const n = state.nodes[id];
    nodes[id] = {
      id: n.id,
      groupId: n.groupId,
      lx: n.lx,
      ly: n.ly,
    };
  }

  const edges: GraphSnapshot['edges'] = {};
  for (const u in state.mapAdjacency) {
    edges[u] = state.mapAdjacency[u].map((e) => ({
      id: e.id,
      dir: e.dir,
      characters: [...e.characters],
    }));
  }

  const characters: GraphSnapshot['characters'] = {};
  for (const c in state.characters) {
    characters[c] = {
      color: state.characters[c].color,
      location_id: state.characters[c].location_id,
      ...(state.characters[c].resources
        ? { resources: { ...state.characters[c].resources } }
        : {}),
    };
  }

  const drawings: Stroke[] = state.drawings.map((s) => ({
    id: s.id,
    groupId: s.groupId,
    author: s.author,
    locationId: s.locationId,
    color: s.color,
    isEraser: s.isEraser,
    points: s.points.map((p) => ({ x: p.x, y: p.y })),
  }));

  return { nodes, edges, characters, drawings };
};

export const GRID_SIZE = 80;
export const SPECIAL_OFFSET = 120;

export const updateGlobalCoords = (state: GameState): void => {
  for (const id in state.nodes) {
    const n = state.nodes[id];
    const g = state.groups[n.groupId];

    // Ensure the group exists before calculating math to prevent NaN drag locks
    if (g) {
      n.gx = g.offsetX + n.lx;
      n.gy = g.offsetY + n.ly;
    }
  }
};

export const processMove = (
  state: GameState,
  moveData: MovePayload,
  viewport: { width: number; height: number } = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1000,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }
): string => {
  const { charName, fromId, dir } = moveData;

  if (!dir) {
    throw new Error('Invalid move: Missing direction');
  }

  const isSpecial = dir.startsWith('Special');
  if (!isSpecial && !DIRS[dir]) {
    throw new Error(`Invalid move direction: ${dir}`);
  }

  // Server-side lock: never override an existing known cardinal/intercardinal destination
  const existingKnownTarget = !isSpecial ? getKnownNeighbors(state, fromId)[dir] : undefined;
  const toId = existingKnownTarget || moveData.toId;

  if (!state.mapAdjacency[fromId]) state.mapAdjacency[fromId] = [];
  const existingEdge = state.mapAdjacency[fromId].find((e) => e.id === toId && e.dir === dir);
  if (existingEdge) {
    if (!existingEdge.characters.includes(charName)) existingEdge.characters.push(charName);
    existingEdge.traversalCount = (existingEdge.traversalCount ?? 1) + 1;
    if (!existingEdge.characterCounts) {
      existingEdge.characterCounts = {};
      for (const c of existingEdge.characters) {
        existingEdge.characterCounts[c] = c === charName ? 0 : 1;
      }
    }
    existingEdge.characterCounts[charName] = (existingEdge.characterCounts[charName] ?? 1) + 1;
  } else {
    state.mapAdjacency[fromId].push({ id: toId, dir, characters: [charName] });
  }

  if (!state.characters[charName]) {
    const randomColor =
      '#' +
      Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, '0');
    state.characters[charName] = { color: randomColor, location_id: toId };
  } else {
    state.characters[charName].location_id = toId;
  }

  if (!state.nodes[fromId]) {
    const gId = state.globalGroupCounter++;
    const offsetX = -state.camera.x + viewport.width / 2;
    const offsetY = -state.camera.y + viewport.height / 2;
    state.groups[gId] = { offsetX, offsetY };
    state.nodes[fromId] = { id: fromId, groupId: gId, lx: 0, ly: 0, gx: offsetX, gy: offsetY };
  }

  if (!state.nodes[toId]) {
    if (isSpecial) {
      const gId = state.globalGroupCounter++;
      state.groups[gId] = {
        offsetX: state.nodes[fromId].gx + SPECIAL_OFFSET,
        offsetY: state.nodes[fromId].gy + SPECIAL_OFFSET,
      };
      state.nodes[toId] = { id: toId, groupId: gId, lx: 0, ly: 0, gx: 0, gy: 0 };
    } else {
      state.nodes[toId] = {
        id: toId,
        groupId: state.nodes[fromId].groupId,
        lx: state.nodes[fromId].lx + DIRS[dir].x * GRID_SIZE,
        ly: state.nodes[fromId].ly + DIRS[dir].y * GRID_SIZE,
        gx: 0,
        gy: 0,
      };
    }
  } else {
    if (!isSpecial && state.nodes[fromId].groupId !== state.nodes[toId].groupId) {
      const targetGroup = state.nodes[fromId].groupId;
      const oldGroupId = state.nodes[toId].groupId;
      const expectedLx = state.nodes[fromId].lx + DIRS[dir].x * GRID_SIZE;
      const expectedLy = state.nodes[fromId].ly + DIRS[dir].y * GRID_SIZE;
      const mergeDx = expectedLx - state.nodes[toId].lx;
      const mergeDy = expectedLy - state.nodes[toId].ly;

      for (const n in state.nodes) {
        if (state.nodes[n].groupId === oldGroupId) {
          state.nodes[n].groupId = targetGroup;
          state.nodes[n].lx += mergeDx;
          state.nodes[n].ly += mergeDy;
        }
      }

      // Snap all drawings belonging to oldGroupId into targetGroup with the exact same relative offset
      for (const stroke of state.drawings) {
        if (stroke.groupId === oldGroupId) {
          stroke.groupId = targetGroup;
          for (const pt of stroke.points) {
            pt.x += mergeDx;
            pt.y += mergeDy;
          }
        }
      }

      delete state.groups[oldGroupId];
    }
  }

  updateGlobalCoords(state);
  return toId;
};

export const applyDrawAction = (
  state: GameState,
  payload: DrawPayload
): { ok: boolean; groupId?: number } => {
  const { action, playerName, anchorLocation, groupId: explicitGroupId, stroke } = payload;

  const anchorNode = anchorLocation
    ? state.nodes[anchorLocation]
    : playerName && state.characters[playerName]
      ? state.nodes[state.characters[playerName].location_id]
      : undefined;

  const resolvedGroupId = anchorNode ? anchorNode.groupId : explicitGroupId;

  if (action === 'add') {
    if (!stroke || !Array.isArray(stroke.points) || stroke.points.length === 0) {
      return { ok: false };
    }
    const useRelative = stroke.pointsAreRelativeToAnchor !== false && !!anchorNode;
    const baseLx = useRelative && anchorNode ? anchorNode.lx : 0;
    const baseLy = useRelative && anchorNode ? anchorNode.ly : 0;

    const newStroke: Stroke = {
      id: stroke.id || `${playerName || 'host'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      groupId: resolvedGroupId,
      author: playerName,
      locationId: anchorNode?.id ?? anchorLocation,
      color: stroke.color || '#f6f2e9',
      isEraser: Boolean(stroke.isEraser),
      points: stroke.points.map((pt) => ({
        x: baseLx + pt.x,
        y: baseLy + pt.y,
      })),
    };
    state.drawings.push(newStroke);
    return { ok: true, groupId: resolvedGroupId };
  }

  if (action === 'undo') {
    for (let i = state.drawings.length - 1; i >= 0; i--) {
      const s = state.drawings[i];
      const matchesAuthor = playerName ? s.author === playerName : true;
      const matchesGroup =
        resolvedGroupId !== undefined ? s.groupId === resolvedGroupId : true;
      if (matchesAuthor && matchesGroup) {
        state.drawings.splice(i, 1);
        return { ok: true, groupId: resolvedGroupId };
      }
    }
    return { ok: false, groupId: resolvedGroupId };
  }

  if (action === 'clear') {
    state.drawings = state.drawings.filter((s) => {
      if (playerName && anchorLocation) {
        return !(s.author === playerName && s.locationId === anchorLocation);
      }
      if (playerName) {
        return s.author !== playerName;
      }
      if (resolvedGroupId !== undefined) {
        return s.groupId !== resolvedGroupId;
      }
      return false;
    });
    return { ok: true, groupId: resolvedGroupId };
  }

  return { ok: false };
};

const isNodeReferenced = (state: GameState, nodeId: string): boolean => {
  // Check if any character is currently at this node
  for (const charName in state.characters) {
    if (state.characters[charName].location_id === nodeId) {
      return true;
    }
  }
  // Check outgoing edges
  if (state.mapAdjacency[nodeId] && state.mapAdjacency[nodeId].length > 0) {
    return true;
  }
  // Check incoming edges
  for (const u in state.mapAdjacency) {
    if (state.mapAdjacency[u].some((e) => e.id === nodeId)) {
      return true;
    }
  }
  return false;
};

export const undoMove = (
  state: GameState,
  moveData: MovePayload
): { edgeRemoved: boolean } => {
  const { charName, fromId, dir, toId } = moveData;

  if (state.characters[charName]) {
    state.characters[charName].location_id = fromId;
  }

  let edgeRemoved = false;

  // Count total crossings across both forward (fromId --dir--> toId) and reverse (toId --oppDir--> fromId)
  const forwardList = state.mapAdjacency[fromId] || [];
  const forwardIdx = forwardList.findIndex((e) => e.id === toId && e.dir === dir);
  const forwardEdge = forwardIdx >= 0 ? forwardList[forwardIdx] : undefined;
  const forwardCount = forwardEdge
    ? Math.max(forwardEdge.traversalCount ?? 1, forwardEdge.characters.length)
    : 0;

  const isSpecial = dir.startsWith('Special');
  const oppDir = !isSpecial ? OPPOSITE_DIRS[dir] : undefined;
  const reverseList = oppDir ? state.mapAdjacency[toId] || [] : [];
  const reverseEdge = oppDir
    ? reverseList.find((e) => e.id === fromId && e.dir === oppDir)
    : undefined;
  const reverseCount = reverseEdge
    ? Math.max(reverseEdge.traversalCount ?? 1, reverseEdge.characters.length)
    : 0;

  const totalCrossings = forwardCount + reverseCount;

  if (forwardEdge && forwardIdx >= 0) {
    if (forwardCount <= 1) {
      // Remove this single-traversal forward directed edge
      forwardList.splice(forwardIdx, 1);
      if (forwardList.length === 0) {
        delete state.mapAdjacency[fromId];
      }
      // The undirected connection is only completely erased if reverseCount is also 0 (totalCrossings <= 1)
      edgeRemoved = totalCrossings <= 1;

      if (edgeRemoved && state.nodes[toId] && !isNodeReferenced(state, toId)) {
        const orphanGroupId = state.nodes[toId].groupId;
        delete state.nodes[toId];
        const groupHasRemainingNodes = Object.values(state.nodes).some(
          (n) => n.groupId === orphanGroupId
        );
        if (!groupHasRemainingNodes) {
          delete state.groups[orphanGroupId];
        }
      }
    } else {
      if (forwardEdge.traversalCount && forwardEdge.traversalCount > 1) {
        forwardEdge.traversalCount -= 1;
        if (forwardEdge.traversalCount === 1) {
          delete forwardEdge.traversalCount;
        }
      }
      if (forwardEdge.characterCounts && forwardEdge.characterCounts[charName]) {
        forwardEdge.characterCounts[charName] -= 1;
        if (forwardEdge.characterCounts[charName] <= 0) {
          delete forwardEdge.characterCounts[charName];
          forwardEdge.characters = forwardEdge.characters.filter((c) => c !== charName);
        }
      }
    }
  }

  updateGlobalCoords(state);
  return { edgeRemoved };
};

export const exportGameState = (
  state: GameState,
  roomCode?: string
): ExportedGameSave => {
  const mapAdjacency: ExportedGameSave['state']['mapAdjacency'] = {};
  for (const u in state.mapAdjacency) {
    mapAdjacency[u] = state.mapAdjacency[u].map((e) => ({
      id: e.id,
      dir: e.dir,
      characters: [...e.characters],
      ...(e.traversalCount !== undefined ? { traversalCount: e.traversalCount } : {}),
      ...(e.characterCounts ? { characterCounts: { ...e.characterCounts } } : {}),
    }));
  }

  const characters: ExportedGameSave['state']['characters'] = {};
  for (const name in state.characters) {
    const c = state.characters[name];
    characters[name] = {
      color: c.color,
      location_id: c.location_id,
      ...(c.resources ? { resources: { ...c.resources } } : {}),
    };
  }

  const nodes: ExportedGameSave['state']['nodes'] = {};
  for (const id in state.nodes) {
    const n = state.nodes[id];
    nodes[id] = {
      id: n.id,
      groupId: n.groupId,
      lx: n.lx,
      ly: n.ly,
      gx: n.gx,
      gy: n.gy,
    };
  }

  const groups: ExportedGameSave['state']['groups'] = {};
  for (const gId in state.groups) {
    const numId = Number(gId);
    groups[numId] = {
      offsetX: state.groups[numId].offsetX,
      offsetY: state.groups[numId].offsetY,
    };
  }

  const drawings: Stroke[] = state.drawings.map((s) => ({
    id: s.id,
    groupId: s.groupId,
    author: s.author,
    locationId: s.locationId,
    color: s.color,
    isEraser: s.isEraser,
    points: s.points.map((p) => ({ x: p.x, y: p.y })),
  }));

  return {
    format: 'vantage-cartographer-save',
    version: 1,
    exportedAt: new Date().toISOString(),
    ...(roomCode ? { roomCode } : {}),
    state: {
      mapAdjacency,
      characters,
      nodes,
      groups,
      globalGroupCounter: state.globalGroupCounter,
      drawings,
      camera: { x: state.camera.x, y: state.camera.y },
    },
  };
};

export const importGameState = (
  targetState: GameState,
  rawPayload: unknown
): { nodeCount: number; characterCount: number; drawingCount: number } => {
  if (!rawPayload || typeof rawPayload !== 'object') {
    throw new Error('Invalid save file: expected a JSON object.');
  }

  const root = rawPayload as Record<string, unknown>;
  if (root.format !== undefined && root.format !== 'vantage-cartographer-save') {
    throw new Error('Invalid save file: unrecognized save format.');
  }

  const source =
    root.state && typeof root.state === 'object'
      ? (root.state as Record<string, unknown>)
      : root;

  if (!source.nodes || typeof source.nodes !== 'object') {
    throw new Error('Invalid save file: missing map nodes.');
  }

  const nextNodes: GameState['nodes'] = {};
  let maxGroupId = -1;
  for (const [id, nRaw] of Object.entries(source.nodes as Record<string, unknown>)) {
    if (!nRaw || typeof nRaw !== 'object') continue;
    const n = nRaw as Record<string, unknown>;
    const groupId = typeof n.groupId === 'number' ? n.groupId : 0;
    const lx = typeof n.lx === 'number' ? n.lx : 0;
    const ly = typeof n.ly === 'number' ? n.ly : 0;
    const gx = typeof n.gx === 'number' ? n.gx : lx;
    const gy = typeof n.gy === 'number' ? n.gy : ly;
    nextNodes[id] = { id, groupId, lx, ly, gx, gy };
    if (groupId > maxGroupId) maxGroupId = groupId;
  }

  const nextGroups: GameState['groups'] = {};
  if (source.groups && typeof source.groups === 'object') {
    for (const [gKey, gRaw] of Object.entries(source.groups as Record<string, unknown>)) {
      const gId = Number(gKey);
      if (!Number.isNaN(gId) && gRaw && typeof gRaw === 'object') {
        const g = gRaw as Record<string, unknown>;
        nextGroups[gId] = {
          offsetX: typeof g.offsetX === 'number' ? g.offsetX : 0,
          offsetY: typeof g.offsetY === 'number' ? g.offsetY : 0,
        };
        if (gId > maxGroupId) maxGroupId = gId;
      }
    }
  }

  // Ensure every node's groupId exists in nextGroups
  for (const id in nextNodes) {
    const n = nextNodes[id];
    if (!nextGroups[n.groupId]) {
      nextGroups[n.groupId] = { offsetX: n.gx - n.lx, offsetY: n.gy - n.ly };
    }
  }

  const nextAdjacency: GameState['mapAdjacency'] = {};
  if (source.mapAdjacency && typeof source.mapAdjacency === 'object') {
    for (const [u, listRaw] of Object.entries(source.mapAdjacency as Record<string, unknown>)) {
      if (!Array.isArray(listRaw)) continue;
      nextAdjacency[u] = listRaw
        .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
        .map((e) => ({
          id: String(e.id ?? ''),
          dir: String(e.dir ?? ''),
          characters: Array.isArray(e.characters) ? e.characters.map(String) : [],
          ...(typeof e.traversalCount === 'number' ? { traversalCount: e.traversalCount } : {}),
          ...(e.characterCounts && typeof e.characterCounts === 'object'
            ? { characterCounts: { ...(e.characterCounts as Record<string, number>) } }
            : {}),
        }));
    }
  }

  const nextCharacters: GameState['characters'] = {};
  if (source.characters && typeof source.characters === 'object') {
    for (const [cName, cRaw] of Object.entries(source.characters as Record<string, unknown>)) {
      if (!cRaw || typeof cRaw !== 'object') continue;
      const c = cRaw as Record<string, unknown>;
      if (typeof c.location_id === 'string') {
        nextCharacters[cName] = {
          color: typeof c.color === 'string' ? c.color : '#10b981',
          location_id: c.location_id,
          ...(c.resources && typeof c.resources === 'object'
            ? { resources: { ...(c.resources as Record<string, number>) } }
            : {}),
        };
      }
    }
  }

  const nextDrawings: Stroke[] = [];
  if (Array.isArray(source.drawings)) {
    for (const sRaw of source.drawings) {
      if (!sRaw || typeof sRaw !== 'object') continue;
      const s = sRaw as Record<string, unknown>;
      if (!Array.isArray(s.points)) continue;
      const pts = s.points
        .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
        .filter((p) => typeof p.x === 'number' && typeof p.y === 'number')
        .map((p) => ({ x: Number(p.x), y: Number(p.y) }));
      nextDrawings.push({
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

  const savedCounter =
    typeof source.globalGroupCounter === 'number' ? source.globalGroupCounter : 0;
  targetState.nodes = nextNodes;
  targetState.groups = nextGroups;
  targetState.mapAdjacency = nextAdjacency;
  targetState.characters = nextCharacters;
  targetState.drawings = nextDrawings;
  targetState.currentStroke = null;
  targetState.draggedGroup = null;
  targetState.isDraggingCamera = false;
  targetState.globalGroupCounter = Math.max(savedCounter, maxGroupId + 1);

  if (source.camera && typeof source.camera === 'object') {
    const cam = source.camera as Record<string, unknown>;
    if (typeof cam.x === 'number' && typeof cam.y === 'number') {
      targetState.camera = { x: cam.x, y: cam.y };
    }
  }

  updateGlobalCoords(targetState);

  return {
    nodeCount: Object.keys(nextNodes).length,
    characterCount: Object.keys(nextCharacters).length,
    drawingCount: nextDrawings.length,
  };
};
