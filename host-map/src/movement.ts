import type { GameState, MovePayload } from './types.ts';

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
): void => {
  const { charName, fromId, dir, toId } = moveData;

  if (!dir) {
    throw new Error('Invalid move: Missing direction');
  }

  const isSpecial = dir.startsWith('Special');
  if (!isSpecial && !DIRS[dir]) {
    throw new Error(`Invalid move direction: ${dir}`);
  }

  if (!state.mapAdjacency[fromId]) state.mapAdjacency[fromId] = [];
  const existingEdge = state.mapAdjacency[fromId].find(e => e.id === toId && e.dir === dir);
  if (existingEdge) {
    if (!existingEdge.characters.includes(charName)) existingEdge.characters.push(charName);
    existingEdge.traversalCount = (existingEdge.traversalCount ?? 1) + 1;
  } else {
    state.mapAdjacency[fromId].push({ id: toId, dir, characters: [charName] });
  }

  if (!state.characters[charName]) {
    const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
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
      delete state.groups[oldGroupId];
    }
  }

  updateGlobalCoords(state);
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
    if (state.mapAdjacency[u].some(e => e.id === nodeId)) {
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
  const forwardIdx = forwardList.findIndex(e => e.id === toId && e.dir === dir);
  const forwardEdge = forwardIdx >= 0 ? forwardList[forwardIdx] : undefined;
  const forwardCount = forwardEdge ? Math.max(forwardEdge.traversalCount ?? 1, forwardEdge.characters.length) : 0;

  const isSpecial = dir.startsWith('Special');
  const oppDir = !isSpecial ? OPPOSITE_DIRS[dir] : undefined;
  const reverseList = oppDir ? state.mapAdjacency[toId] || [] : [];
  const reverseEdge = oppDir ? reverseList.find(e => e.id === fromId && e.dir === oppDir) : undefined;
  const reverseCount = reverseEdge ? Math.max(reverseEdge.traversalCount ?? 1, reverseEdge.characters.length) : 0;

  const totalCrossings = forwardCount + reverseCount;

  if (forwardEdge && forwardIdx >= 0) {
    if (totalCrossings <= 1 && forwardCount <= 1) {
      // Only erase the connection if this is the only time the edge has been crossed
      forwardList.splice(forwardIdx, 1);
      if (forwardList.length === 0) {
        delete state.mapAdjacency[fromId];
      }
      edgeRemoved = true;

      // Clean up destination node if it is now completely orphaned
      if (state.nodes[toId] && !isNodeReferenced(state, toId)) {
        const orphanGroupId = state.nodes[toId].groupId;
        delete state.nodes[toId];
        const groupHasRemainingNodes = Object.values(state.nodes).some(n => n.groupId === orphanGroupId);
        if (!groupHasRemainingNodes) {
          delete state.groups[orphanGroupId];
        }
      }
    } else if (forwardEdge.traversalCount && forwardEdge.traversalCount > 1) {
      forwardEdge.traversalCount -= 1;
      if (forwardEdge.traversalCount === 1) {
        delete forwardEdge.traversalCount;
      }
    }
  }

  updateGlobalCoords(state);
  return { edgeRemoved };
};
