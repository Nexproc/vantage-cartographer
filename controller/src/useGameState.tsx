import { useState, useRef, useEffect } from 'react';
import type { GameState, ResourceColor, Direction } from './types';
import { GameService } from './GameService';

const initialGameState: GameState = {
  code: '', name: '', color: '#10b981', location: null, direction: null,
  resources: { red: 0, blue: 0, green: 0, yellow: 0, purple: 0, orange: 0 }
};

export const useGameState = () => {
  const [activeScreen, setActiveScreen] = useState<'connect' | 'setup' | 'normal'>('connect');
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [isSyncing, setIsSyncing] = useState(false);

  // Reference to latest state for async callbacks
  const latestState = useRef(gameState);
  useEffect(() => { latestState.current = gameState; }, [gameState]);

  // Sync locks
  const syncLock = useRef({ timer: null as ReturnType<typeof setTimeout> | null, isAwaitingAck: false, pendingSync: false });

  const connect = async (code: string, name: string) => {
    const cleanCode = code.trim().toUpperCase();
    const cleanName = name.trim();
    try {
      const data = await GameService.connect(cleanCode, cleanName);

      setGameState(prev => ({ ...prev, code: cleanCode, name: cleanName }));
      setActiveScreen(data.hasLocation ? 'normal' : 'setup');
      return true;
    } catch (e) {
      console.error("Connection failed:", e);
      return false;
    }
  };

  const crashLand = async (location: string, color: string): Promise<boolean> => {
    try {
      const data = await GameService.crashLand(gameState.code, gameState.name, location, color);
      const confirmedLoc = typeof data.confirmedLocation === 'string' ? data.confirmedLocation : location;
      setGameState(prev => ({ ...prev, location: confirmedLoc, color }));
      setActiveScreen('normal');
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const move = async (targetLoc: string, direction: Direction): Promise<boolean> => {
    try {
      const data = await GameService.move(gameState.code, gameState.name, gameState.location, targetLoc, direction);
      const nextLoc = typeof data.newLocation === 'string' ? data.newLocation : targetLoc;
      setGameState(prev => ({ ...prev, location: nextLoc, direction }));
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const adjustResource = (color: ResourceColor, delta: number) => {
    setGameState(prev => ({
      ...prev,
      resources: { ...prev.resources, [color]: Math.max(0, prev.resources[color] + delta) }
    }));

    setIsSyncing(true);
    if (syncLock.current.timer) clearTimeout(syncLock.current.timer);
    syncLock.current.timer = setTimeout(executeResourceSync, 750);
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
    } catch (e) {
      console.error(e);
    } finally {
      syncLock.current.isAwaitingAck = false;
      if (syncLock.current.pendingSync) {
        syncLock.current.pendingSync = false;
        executeResourceSync();
      } else {
        setIsSyncing(false);
      }
    }
  };

  return { activeScreen, gameState, isSyncing, connect, crashLand, move, adjustResource };
};