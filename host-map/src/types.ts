export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id?: string;
  groupId?: number;
  author?: string;
  locationId?: string;
  color: string;
  isEraser: boolean;
  points: Point[];
}

export interface Character {
  color: string;
  location_id: string;
  resources?: Record<string, number>;
}

export interface Edge {
  id: string;
  dir: string;
  characters: string[];
  traversalCount?: number;
  characterCounts?: Record<string, number>;
}

export interface MapNode {
  id: string;
  groupId: number;
  lx: number;
  ly: number;
  gx: number;
  gy: number;
}

export interface Group {
  offsetX: number;
  offsetY: number;
}

export interface GameState {
  mapAdjacency: Record<string, Edge[]>;
  characters: Record<string, Character>;
  nodes: Record<string, MapNode>;
  groups: Record<number, Group>;
  globalGroupCounter: number;
  drawings: Stroke[];
  currentStroke: Stroke | null;
  camera: Point;
  isDraggingCamera: boolean;
  draggedGroup: Group | null;
  lastMouse: Point;
}

export interface MovePayload {
  charName: string;
  fromId: string;
  dir: string;
  toId: string;
}

export interface DrawPayload {
  action: 'add' | 'undo' | 'clear';
  playerName?: string;
  anchorLocation?: string;
  groupId?: number;
  stroke?: {
    id?: string;
    color: string;
    isEraser: boolean;
    points: Point[];
    pointsAreRelativeToAnchor?: boolean;
  };
}

export interface GraphSnapshot {
  nodes: Record<string, { id: string; groupId: number; lx: number; ly: number }>;
  edges: Record<string, Array<{ id: string; dir: string; characters: string[] }>>;
  characters: Record<string, Character>;
  drawings: Stroke[];
}

export interface ExportedGameSave {
  format: 'vantage-cartographer-save';
  version: number;
  exportedAt: string;
  roomCode?: string;
  state: {
    mapAdjacency: Record<string, Edge[]>;
    characters: Record<string, Character>;
    nodes: Record<string, MapNode>;
    groups: Record<number, Group>;
    globalGroupCounter: number;
    drawings: Stroke[];
    camera?: Point;
  };
}

export interface PeerMessage {
  type: 'MOVE';
  payload: MovePayload;
}