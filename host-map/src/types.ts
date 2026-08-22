export interface Point {
    x: number;
    y: number;
  }
  
  export interface Stroke {
    color: string;
    isEraser: boolean;
    points: Point[];
  }
  
  export interface Character {
    color: string;
    location_id: string;
  }
  
  export interface Edge {
    id: string;
    dir: string;
    characters: string[];
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
    specialId: string;
  }
  
  export interface PeerMessage {
    type: 'MOVE';
    payload: MovePayload;
  }