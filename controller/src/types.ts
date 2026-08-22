export type ResourceColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange';
export type Direction = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW' | 'C' | null;

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
}