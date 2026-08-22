import Peer, { DataConnection } from 'peerjs';
import type { Direction, Resources } from './types';

export class GameService {
  private static peer: Peer | null = null;
  private static conn: DataConnection | null = null;
  
  // Stores unresolved promises mapped to request IDs
  private static pendingRequests: Record<string, { resolve: Function, reject: Function }> = {};

  static async setHost(hostCode: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.peer = new Peer();
      
      this.peer.on('open', () => {
        this.conn = this.peer!.connect(`map-${hostCode}`);
        
        this.conn.on('open', () => {
          resolve(); // Connection established!
        });

        // Listen for API Responses from the Host
        this.conn.on('data', (data: any) => {
          if (data.type === 'API_RESPONSE' && this.pendingRequests[data.reqId]) {
            if (data.ok) {
              this.pendingRequests[data.reqId].resolve(data.data);
            } else {
              this.pendingRequests[data.reqId].reject(new Error(data.error));
            }
            delete this.pendingRequests[data.reqId];
          }
        });
        
        this.conn.on('error', reject);
      });
    });
  }

  // Internal Helper: Emulates an HTTP fetch over WebRTC
  private static async request(endpoint: string, body: any): Promise<any> {
    if (!this.conn || !this.conn.open) throw new Error('Not connected to a Host Map.');
    
    const reqId = crypto.randomUUID(); // Unique ID for this request
    
    return new Promise((resolve, reject) => {
      this.pendingRequests[reqId] = { resolve, reject };
      
      this.conn!.send({
        type: 'API_REQUEST',
        endpoint,
        reqId,
        body
      });

      // Optional: Add a 5-second timeout
      setTimeout(() => {
        if (this.pendingRequests[reqId]) {
          reject(new Error('Request timed out'));
          delete this.pendingRequests[reqId];
        }
      }, 5000);
    });
  }

  static async connect(code: string, name: string) {
    if (!this.conn) await this.setHost(code);
    return this.request('/connect', { gameCode: code, playerName: name });
  }

  static async crashLand(code: string, name: string, location: string, color: string) {
    return this.request('/crashland', { gameCode: code, playerName: name, requestedLocation: location, playerColor: color });
  }

  static async move(code: string, name: string, currentLoc: string | null, targetLoc: string, direction: Direction) {
    return this.request('/move', { gameCode: code, playerName: name, currentLocation: currentLoc, targetLocation: targetLoc, direction });
  }

  static async syncResources(code: string, name: string, resources: Resources) {
    return this.request('/resources', { gameCode: code, playerName: name, resources });
  }
}