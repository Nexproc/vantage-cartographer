import { useState, useRef, useEffect } from 'react';
import type { GameState, ResourceColor, Direction } from './types';
import { GameService } from './GameService';

const initialGameState: GameState = {
  code: '', name: '', color: '#50e3c2', location: null, direction: null,
  resources: { red: 0, blue: 0, green: 0, yellow: 0, purple: 0, orange: 0 }
};

export const useGameState = () => {
  const [activeScreen, setActiveScreen] = useState<'connect' | 'setup' | 'normal'>('connect');
  const [gameState, setGameState] = useState<GameState>(initialGameState);

  // Reference to latest state for async callbacks
  const latestState = useRef(gameState);
  useEffect(() => { latestState.current = gameState; }, [gameState]);

  // Sync locks
  const syncLock = useRef({ timer: null as ReturnType<typeof setTimeout> | null, isAwaitingAck: false, pendingSync: false });

  const connect = async (code: string, name: string, host?: string) => {
    try {
      // 1. Point the API to the dynamically discovered host, or fallback to the current window
      const targetHost = host || window.location.origin;
      GameService.setHost(targetHost);
  
      // 2. Make the GET request
      const data = await GameService.connect(code, name);
      
      setGameState(prev => ({ ...prev, code, name }));
      setActiveScreen(data.hasLocation ? 'normal' : 'setup');
      return true;
  
    } catch (e) {
      console.error("Connection failed:", e);
      return false;
    }
  };

  const crashLand = async (location: string, color: string) => {
    try {
      // Note: Swap with GameService call when API is ready
      // const data = await GameService.crashLand(gameState.code, gameState.name, location, color);
      await GameService.crashLand(gameState.code, gameState.name, location, color);
      setGameState(prev => ({ ...prev, location, color })); // Use data.confirmedLocation
      setActiveScreen('normal');
    } catch (e) {
      console.error(e);
    }
  };

  const move = async (targetLoc: string, direction: Direction) => {
    try {
      // Note: Swap with GameService call when API is ready
      await GameService.move(gameState.code, gameState.name, gameState.location, targetLoc, direction);
      // await new Promise(r => setTimeout(r, 500));
      setGameState(prev => ({ ...prev, location: targetLoc, direction: direction })); // Use data.newLocation
    } catch (e) {
      console.error(e);
    }
  };

  const adjustResource = (color: ResourceColor, delta: number) => {
    setGameState(prev => ({
      ...prev,
      resources: { ...prev.resources, [color]: Math.max(0, prev.resources[color] + delta) }
    }));

    if (syncLock.current.timer) clearTimeout(syncLock.current.timer);
    syncLock.current.timer = setTimeout(executeResourceSync, 1000);
  };

  const executeResourceSync = async () => {
    if (syncLock.current.isAwaitingAck) {
      syncLock.current.pendingSync = true;
      return;
    }
    syncLock.current.isAwaitingAck = true;

    try {
      const state = latestState.current;
      await GameService.syncResources(state.code, state.name, state.resources);
      console.log("Resources synced!");
    } catch (e) {
      console.error(e);
    } finally {
      syncLock.current.isAwaitingAck = false;
      if (syncLock.current.pendingSync) {
        syncLock.current.pendingSync = false;
        executeResourceSync();
      }
    }
  };

  return { activeScreen, gameState, connect, crashLand, move, adjustResource };
};