import React, { useState, useRef, useEffect } from 'react';
import type { GameState, ResourceColor, Direction } from './types';
import { useGameState } from './useGameState'; // Import your new controller
import { ConnectScreen } from './ConnectScreen'
import { clsButton, clsInput } from './tailwindComponents';

const App: React.FC = () => {
  // Pull everything from the custom hook!
  const { activeScreen, gameState, connect, crashLand, move, adjustResource } = useGameState();

  return (
    <div className="w-full max-w-[400px] h-[100vh] max-h-[850px] relative border-2 border-[#333] rounded-[20px] overflow-y-auto overflow-x-hidden flex flex-col p-5 bg-[#121212]">
      {activeScreen === 'connect' && (
        <ConnectScreen onConnect={connect} />
      )}
      {activeScreen === 'setup' && (
        <SetupScreen playerName={gameState.name} onCrashLand={crashLand} />
      )}
      {activeScreen === 'normal' && (
        <NormalScreen 
          gameState={gameState} 
          onMove={move} 
          onResourceChange={adjustResource}
        />
      )}
    </div>
  );
};

// ==========================================
// SUB-COMPONENTS
// ==========================================

const SetupScreen: React.FC<{ playerName: string, onCrashLand: (l: string, c: string) => void }> = ({ playerName, onCrashLand }) => {
  const [color, setColor] = useState('#50e3c2');
  const [loc, setLoc] = useState('');

  const submit = () => {
    if (!/^\d{2,4}$/.test(loc)) {
      alert("Location ID must be a 2 to 4 digit number.");
      return;
    }
    onCrashLand(loc, color);
  };

  return (
    <div className="flex flex-col h-full w-full animate-fade-in">
      <div className="flex-grow"></div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-normal text-[1.2rem] m-0">{playerName}</h2>
      </div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-normal text-[1.2rem] m-0">Color Picker</h2>
        <input 
          type="color" value={color} onChange={e => setColor(e.target.value)} 
          className="w-10 h-10 rounded-full border border-white cursor-pointer p-0 bg-transparent"
        />
      </div>
      <input 
        className={clsInput}
        type="number" placeholder="Start Location (2-4 digits)" 
        value={loc} onChange={e => setLoc(e.target.value)} 
      />
      <div className="flex-grow"></div>
      <button className={`${clsButton} border-[#ff5252] text-[#ff5252]`} onClick={submit}>
        Crash Land
      </button>
    </div>
  );
};

const NormalScreen: React.FC<{ 
  gameState: GameState;
  onMove: (loc: string, dir: Direction) => void;
  onResourceChange: (color: ResourceColor, delta: number) => void;
}> = ({ gameState, onMove, onResourceChange }) => {
  
  const [targetLoc, setTargetLoc] = useState('');
  const [localDirection, setLocalDirection] = useState<Direction>(gameState.direction);
  const resourceColors: ResourceColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];

  const RES_STYLES: Record<ResourceColor, { border: string, text: string }> = {
    red: { border: 'border-[#ff4a4a]', text: 'text-[#ff4a4a]' },
    blue: { border: 'border-[#4a90e2]', text: 'text-[#4a90e2]' },
    green: { border: 'border-[#50e3c2]', text: 'text-[#50e3c2]' },
    yellow: { border: 'border-[#f5a623]', text: 'text-[#f5a623]' },
    purple: { border: 'border-[#bd10e0]', text: 'text-[#bd10e0]' },
    orange: { border: 'border-[#ff8c00]', text: 'text-[#ff8c00]' }
  };

  const COMPASS_POS = {
    N: 'top-0 left-[60px]',
    NE: 'top-[15px] right-[15px]',
    E: 'top-[60px] right-0',
    SE: 'bottom-[15px] right-[15px]',
    S: 'bottom-0 left-[60px]',
    SW: 'bottom-[15px] left-[15px]',
    W: 'top-[60px] left-0',
    NW: 'top-[15px] left-[15px]',
    C: 'top-[60px] left-[60px] rounded-full'
  };

  // --- STRICT RESOURCE DEBOUNCE & ACK LOGIC ---
  const syncState = useRef({
    timer: null as ReturnType<typeof setTimeout> | null,
    isAwaitingAck: false,
    pendingSync: false
  });
  
  const latestResources = useRef(gameState.resources);
  useEffect(() => {
    latestResources.current = gameState.resources;
  }, [gameState.resources]);

  const triggerResourceChange = (color: ResourceColor, delta: number) => {
    onResourceChange(color, delta);
    
    if (syncState.current.timer) clearTimeout(syncState.current.timer);
    syncState.current.timer = setTimeout(attemptResourceSync, 1000);
  };

  const attemptResourceSync = async () => {
    if (syncState.current.isAwaitingAck) {
      syncState.current.pendingSync = true;
      return;
    }
    syncState.current.isAwaitingAck = true;

    try {
      await new Promise(r => setTimeout(r, 400));
      console.log("Resources synced to server:", latestResources.current);
    } catch (e) {
      console.error("Resource sync failed", e);
    } finally {
      syncState.current.isAwaitingAck = false;
      if (syncState.current.pendingSync) {
        syncState.current.pendingSync = false;
        attemptResourceSync();
      }
    }
  };

  const submitMove = () => {
    if (!localDirection) {
      alert("Please select a direction on the compass.");
      return;
    }
    if (!/^\d{2,4}$/.test(targetLoc)) {
      alert("Target Location must be a 2 to 4 digit number.");
      return;
    }
    onMove(targetLoc, localDirection);
    setTargetLoc('');
    setLocalDirection(null);
  };

  return (
    <div className="flex flex-col h-full w-full animate-fade-in">
      <div className="flex justify-between items-center mb-5">
        <button 
          className={`${clsButton} w-auto px-4 py-1.5 rounded-2xl text-sm`} 
          onClick={() => console.log("Undo requested")}
        >
          Undo
        </button>
      </div>
      
      <div className="mb-5">
        <div className="text-[1.2rem] font-bold mb-1" style={{ color: gameState.color }}>
          {gameState.name}
        </div>
        <div>Location: {gameState.location || '###'}</div>
      </div>

      <div className="flex flex-row justify-between items-center flex-grow">
        
        {/* Resources Column */}
        <div className="flex flex-col gap-2.5">
          {resourceColors.map(color => (
            <div key={color} className="flex items-center gap-2.5">
              <div className={`w-[30px] h-[30px] rounded-full border ${RES_STYLES[color].border}`}></div>
              <div className={`flex flex-col border border-[#555] rounded-lg overflow-hidden px-1 py-0.5 ${RES_STYLES[color].text}`}>
                <button className="bg-transparent border-none text-white text-xs px-2.5 py-0.5 cursor-pointer active:bg-[#333]" onClick={() => triggerResourceChange(color, 1)}>▲</button>
                <span className="text-center text-sm my-0.5">{gameState.resources[color]}</span>
                <button className="bg-transparent border-none text-white text-xs px-2.5 py-0.5 cursor-pointer active:bg-[#333]" onClick={() => triggerResourceChange(color, -1)}>▼</button>
              </div>
            </div>
          ))}
        </div>

        {/* Compass Column */}
        <div className="relative w-[150px] h-[150px]">
          {(Object.keys(COMPASS_POS) as Direction[]).map(dir => {
            if (!dir) return null;
            const isSelected = localDirection === dir;
            return (
              <button 
                key={dir}
                className={`absolute w-[30px] h-[30px] border border-white rounded-[5px] flex justify-center items-center text-[0.7rem] cursor-pointer p-0 transition-colors ${COMPASS_POS[dir]} ${isSelected ? 'bg-white text-[#121212]' : 'bg-transparent text-white'}`}
                onClick={() => setLocalDirection(dir)}
              >
                {dir === 'C' ? '★' : dir}
              </button>
            )
          })}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="flex gap-2.5 mt-5">
        <input 
          className={`${clsInput} !mb-0 flex-grow`}
          type="number" placeholder="###" 
          value={targetLoc} onChange={e => setTargetLoc(e.target.value)} 
        />
        <button className={`${clsButton} w-auto flex-grow`} onClick={submitMove}>Move</button>
      </div>
    </div>
  );
};

export default App;