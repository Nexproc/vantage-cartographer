export type ResourceColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange';
export type CompassDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export type Direction = CompassDirection | 'C' | null;

export interface Resources {
  red: number;
  blue: number;
  green: number;
  yellow: number;
  purple: number;
  orange: number;
}

export interface LastMoveRecord {
  fromLocation: string;
  toLocation: string;
  direction: Exclude<Direction, null>;
  edgeKey: string | null;
}

export interface GraphPoint {
  x: number;
  y: number;
}

export interface GraphStroke {
  id?: string;
  groupId?: number;
  author?: string;
  locationId?: string;
  color: string;
  isEraser: boolean;
  points: GraphPoint[];
}

export interface GraphNode {
  id: string;
  groupId: number;
  lx: number;
  ly: number;
}

export interface GraphEdge {
  id: string;
  dir: string;
  characters: string[];
}

export interface GraphSnapshot {
  nodes: Record<string, GraphNode>;
  edges: Record<string, GraphEdge[]>;
  characters: Record<string, { color: string; location_id: string; resources?: Partial<Resources> }>;
  drawings: GraphStroke[];
}

export interface GameState {
  code: string;
  name: string;
  color: string;
  location: string | null;
  direction: Direction;
  resources: Resources;
  knownEdges: Record<string, Partial<Record<CompassDirection, string>>>;
  edgeTraverseCounts: Record<string, number>;
  lastMove: LastMoveRecord | null;
  graphSnapshot: GraphSnapshot;
}