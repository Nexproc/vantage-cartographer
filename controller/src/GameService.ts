import Peer, { type DataConnection } from "peerjs";
import type { Direction, Resources } from './types';

interface ApiResponseMessage {
  type: 'API_RESPONSE';
  reqId: string;
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

function isApiResponseMessage(val: unknown): val is ApiResponseMessage {
  return (
    typeof val === 'object' &&
    val !== null &&
    (val as { type?: unknown }).type === 'API_RESPONSE' &&
    typeof (val as { reqId?: unknown }).reqId === 'string'
  );
}

export class GameService {
  private static peer: Peer | null = null;
  private static conn: DataConnection | null = null;
  private static currentHostCode: string | null = null;
  private static pendingRequests: Record<
    string,
    { resolve: (value: Record<string, unknown>) => void; reject: (reason?: Error) => void }
  > = {};

  static async setHost(hostCode: string): Promise<void> {
    const cleanCode = hostCode.trim().toUpperCase();

    // If we are already connected to this host, don't reconnect
    if (this.conn && this.conn.open && this.currentHostCode === cleanCode) return;

    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
      this.conn = null;
      this.currentHostCode = null;
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(handshakeTimer);
        if (err) {
          if (this.peer) {
            this.peer.destroy();
            this.peer = null;
            this.conn = null;
            this.currentHostCode = null;
          }
          reject(err);
        } else {
          this.currentHostCode = cleanCode;
          resolve();
        }
      };

      const handshakeTimer = setTimeout(() => {
        finish(new Error('Connection timed out'));
      }, 8000);

      const peer = new Peer();
      this.peer = peer;

      peer.on('error', (err) => {
        finish(err instanceof Error ? err : new Error(String(err)));
      });

      peer.on('open', () => {
        if (settled) return;
        const conn = peer.connect(`map-${cleanCode}`);
        this.conn = conn;

        conn.on('open', () => {
          finish();
        });

        conn.on('data', (data: unknown) => {
          if (isApiResponseMessage(data) && this.pendingRequests[data.reqId]) {
            if (data.ok) {
              this.pendingRequests[data.reqId].resolve(data.data ?? {});
            } else {
              this.pendingRequests[data.reqId].reject(new Error(data.error ?? 'Request failed'));
            }
            delete this.pendingRequests[data.reqId];
          }
        });

        conn.on('error', (err) => {
          finish(err instanceof Error ? err : new Error(String(err)));
        });

        conn.on('close', () => {
          if (!settled) {
            finish(new Error('Connection closed'));
          }
        });
      });
    });
  }

  private static async request(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    // Safety check: ensure gameCode is present to auto-connect if needed
    if ((!this.conn || !this.conn.open) && typeof body.gameCode === 'string') {
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
    const cleanCode = code.trim().toUpperCase();
    // Explicitly guarantee connection is established before firing the endpoint
    await this.setHost(cleanCode);
    return this.request('/connect', { gameCode: cleanCode, playerName: name });
  }

  static async crashLand(code: string, name: string, location: string, color: string) {
    return this.request('/crashland', { gameCode: code, playerName: name, requestedLocation: location, playerColor: color });
  }

  static async move(code: string, name: string, currentLoc: string | null, targetLoc: string, direction: Direction) {
    const payloadDir = direction === 'C' ? 'Special' : direction;
    return this.request('/move', { gameCode: code, playerName: name, currentLocation: currentLoc, targetLocation: targetLoc, direction: payloadDir });
  }

  static async syncResources(code: string, name: string, resources: Resources) {
    return this.request('/resources', { gameCode: code, playerName: name, resources });
  }
}