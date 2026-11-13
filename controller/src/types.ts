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

export interface GameState {
  code: string;
  name: string;
  color: string;
  location: string | null;
  direction: Direction;
  resources: Resources;
  knownEdges: Record<string, Partial<Record<CompassDirection, string>>>;
}