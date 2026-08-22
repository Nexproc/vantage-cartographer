import Peer, { type DataConnection } from "peerjs";
import type { Direction, Resources } from './types';

export class GameService {
  private static peer: Peer | null = null;
  private static conn: DataConnection | null = null;
  private static pendingRequests: Record<string, { resolve: Function, reject: Function }> = {};

  static async setHost(hostCode: string): Promise<void> {
    // If we are already connected to this host, don't reconnect
    if (this.conn && this.conn.open) return;

    return new Promise((resolve, reject) => {
      this.peer = new Peer();
      
      this.peer.on('open', () => {
        this.conn = this.peer!.connect(`map-${hostCode}`);
        
        this.conn.on('open', () => {
          resolve(); 
        });

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
        
        this.conn.on('error', (err) => {
          reject(err);
        });
      });
    });
  }

  private static async request(endpoint: string, body: any): Promise<any> {
    // Safety check: ensure gameCode is present to auto-connect if needed
    if ((!this.conn || !this.conn.open) && body.gameCode) {
      await this.setHost(body.gameCode);
    }

    if (!this.conn || !this.conn.open) {
      throw new Error('Not connected to a Host Map.');
    }
    
    const reqId = crypto.randomUUID();
    
    return new Promise((resolve, reject) => {
      this.pendingRequests[reqId] = { resolve, reject };
      
      this.conn!.send({
        type: 'API_REQUEST',
        endpoint,
        reqId,
        body
      });

      setTimeout(() => {
        if (this.pendingRequests[reqId]) {
          reject(new Error('Request timed out'));
          delete this.pendingRequests[reqId];
        }
      }, 8000); // Bumped timeout to 8s for slow mobile handshakes
    });
  }

  static async connect(code: string, name: string) {
    // Explicitly guarantee connection is established before firing the endpoint
    await this.setHost(code);
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