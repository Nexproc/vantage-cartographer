import type { Direction, Resources } from './types';

const API_BASE = 'https://your-api-url.com/api';

export class GameService {
  // Default to relative path, but allow dynamic overriding
  static apiBase = '/api'; 

  static setHost(hostUrl: string) {
    // If the URL has a trailing slash, remove it for clean concatenation
    const cleanHost = hostUrl.replace(/\/$/, '');
    this.apiBase = `${cleanHost}/api`;
  }

  static async connect(code: string, name: string) {
    const response = await fetch(`${this.apiBase}/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      // Now you can easily add additional player data to this payload later
      body: JSON.stringify({
        gameCode: code,
        playerName: name
      })
    });

    if (!response.ok) throw new Error('Game not found or connection rejected');
    
    // Server should still return { success: true, hasLocation: boolean }
    return response.json(); 
  }

  static async crashLand(code: string, name: string, location: string, color: string) {
    const response = await fetch(`${API_BASE}/crashland`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameCode: code, playerName: name, requestedLocation: location, playerColor: color })
    });
    if (!response.ok) throw new Error('Crash land failed');
    return response.json(); // Expected to return { confirmedLocation: "123" }
  }

  static async move(code: string, name: string, currentLoc: string | null, targetLoc: string, direction: Direction) {
    const response = await fetch(`${API_BASE}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameCode: code, playerName: name, currentLocation: currentLoc, targetLocation: targetLoc, direction })
    });
    if (!response.ok) throw new Error('Move request rejected');
    return response.json(); // Expected to return { newLocation: "456" }
  }

  static async syncResources(code: string, name: string, resources: Resources) {
    const response = await fetch(`${API_BASE}/resources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameCode: code, playerName: name, resources })
    });
    if (!response.ok) throw new Error('Failed to sync resources');
    return true;
  }
}