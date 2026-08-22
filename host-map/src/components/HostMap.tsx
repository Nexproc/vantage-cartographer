import React, { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import Peer from 'peerjs';
import type { GameState, MovePayload } from '../types';

const HostMap: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showQR, setShowQR] = useState<boolean>(false);
  const [roomCode, setRoomCode] = useState<string>('----');
  const [isLocalhost, setIsLocalhost] = useState<boolean>(false);
  const [mode, setMode] = useState<'drag' | 'draw' | 'erase'>('drag');
  const [penColor, setPenColor] = useState<string>('#ffffff');
  
  // Game State Ref (Mutable to avoid React re-renders killing 60fps canvas)
  const engine = useRef<GameState>({
    mapAdjacency: {
      'c1': [{ id: 'c2', dir: 'E', characters: ['Chan'] }],
      'c2': [{ id: 'c3', dir: 'N', characters: ['Chan'] }],
      'c3': [{ id: 'c4', dir: 'NE', characters: ['Chan'] }],
      'c4': [{ id: 'c5', dir: 'Special_Wormhole', characters: ['Chan'] }],
      't1': [{ id: 't2', dir: 'N', characters: ['Ting'] }],
      't2': [{ id: 't3', dir: 'E', characters: ['Ting'] }],
      't3': [{ id: 't4', dir: 'NE', characters: ['Ting'] }],
      'c5': [{ id: 'shared1', dir: 'S', characters: ['Chan', 'Ting'] }]
    },
    characters: {
      'Chan': { color: '#b683ff', location_id: 'c5' },
      'Ting': { color: '#e6cc55', location_id: 't4' },
      'Both': { color: '#ffffff', location_id: 'shared1' }
    },
    nodes: {}, 
    groups: {}, 
    globalGroupCounter: 0,
    drawings: [], 
    currentStroke: null,
    camera: { x: 0, y: 0 }, 
    isDraggingCamera: false, 
    draggedGroup: null, 
    lastMouse: { x: 0, y: 0 }
  });

  const clearDrawings = () => { 
    engine.current.drawings = []; 
    draw(); 
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const state = engine.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(state.camera.x, state.camera.y);

    // Freehand Drawings
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    state.drawings.forEach(stroke => {
      if (stroke.points.length < 2) return;
      ctx.globalCompositeOperation = stroke.isEraser ? 'destination-out' : 'source-over';
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.lineWidth = stroke.isEraser ? 25 : 3;
      ctx.strokeStyle = stroke.isEraser ? '#000000' : stroke.color;
      ctx.stroke();
    });
    ctx.globalCompositeOperation = 'source-over';

    // Map Paths
    const drawPathArrow = (x1: number, y1: number, x2: number, y2: number, color: string, isSpecial: boolean, offset: number) => {
      const dx = x2 - x1; const dy = y2 - y1; const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return;
      
      const nx = -dy / len; const ny = dx / len;
      let sx = x1 + nx * offset + (dx/len)*10; let sy = y1 + ny * offset + (dy/len)*10;
      let ex = x2 + nx * offset - (dx/len)*10; let ey = y2 + ny * offset - (dy/len)*10;
      
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
      let arrowAngle: number;

      if (isSpecial) {
        ctx.setLineDash([4, 6]);
        const cx = (sx + ex) / 2 + nx * 80; const cy = (sy + ey) / 2 + ny * 80;
        ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx, cy, ex, ey);
        const t = 0.95; 
        const px = (1-t)*(1-t)*sx + 2*(1-t)*t*cx + t*t*ex; 
        const py = (1-t)*(1-t)*sy + 2*(1-t)*t*cy + t*t*ey;
        arrowAngle = Math.atan2(ey - py, ex - px);
      } else {
        ctx.setLineDash([]); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); 
        arrowAngle = Math.atan2(dy, dx);
      }
      ctx.stroke(); ctx.setLineDash([]);

      const headLen = 10; ctx.beginPath();
      ctx.moveTo(ex, ey); ctx.lineTo(ex - headLen * Math.cos(arrowAngle - Math.PI / 6), ey - headLen * Math.sin(arrowAngle - Math.PI / 6));
      ctx.moveTo(ex, ey); ctx.lineTo(ex - headLen * Math.cos(arrowAngle + Math.PI / 6), ey - headLen * Math.sin(arrowAngle + Math.PI / 6));
      ctx.stroke();
    };

    for (const u in state.mapAdjacency) {
      const uNode = state.nodes[u]; if (!uNode) continue;
      state.mapAdjacency[u].forEach(edge => {
        const vNode = state.nodes[edge.id]; if (!vNode) return;
        const isSpecial = edge.dir.startsWith('Special'); const charCount = edge.characters.length;
        edge.characters.forEach((charName, index) => {
          const color = state.characters[charName]?.color || '#ffffff';
          drawPathArrow(uNode.gx, uNode.gy, vNode.gx, vNode.gy, color, isSpecial, (index - (charCount - 1) / 2) * 12);
        });
      });
    }

    // Nodes
    for (const id in state.nodes) {
      const n = state.nodes[id];
      ctx.beginPath(); ctx.arc(n.gx, n.gy, 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#888'; ctx.lineWidth = 2; ctx.fillStyle = '#1a1a1a'; ctx.fill(); ctx.stroke();
    }

    // Labels
    ctx.font = '22px Caveat, cursive, sans-serif'; ctx.textAlign = 'center';
    for (const charName in state.characters) {
      const charData = state.characters[charName]; 
      const locNode = state.nodes[charData.location_id];
      if (locNode) { 
        ctx.fillStyle = charData.color; 
        ctx.fillText(charName, locNode.gx, locNode.gy - 15); 
      }
    }
    ctx.restore();
  };

  const processMove = (moveData: MovePayload) => {
    let { charName, fromId, dir, toId, specialId } = moveData;
    const state = engine.current;
    if (dir === 'Special') dir = 'Special_' + specialId;
    
    if (!state.mapAdjacency[fromId]) state.mapAdjacency[fromId] = [];
    const existingEdge = state.mapAdjacency[fromId].find(e => e.id === toId && e.dir === dir);
    if (existingEdge) {
      if (!existingEdge.characters.includes(charName)) existingEdge.characters.push(charName);
    } else {
      state.mapAdjacency[fromId].push({ id: toId, dir, characters: [charName] });
    }

    if (!state.characters[charName]) {
      const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
      state.characters[charName] = { color: randomColor, location_id: toId };
    } else {
      state.characters[charName].location_id = toId;
    }

    const isSpecial = dir.startsWith('Special');
    const DIRS: Record<string, {x: number, y: number}> = { 
      'N':{x:0,y:-1}, 'S':{x:0,y:1}, 'E':{x:1,y:0}, 'W':{x:-1,y:0}, 
      'NE':{x:1,y:-1}, 'NW':{x:-1,y:-1}, 'SE':{x:1,y:1}, 'SW':{x:-1,y:1} 
    };
    const GRID_SIZE = 80;

    if (!state.nodes[fromId]) {
      const gId = state.globalGroupCounter++;
      state.groups[gId] = { offsetX: -state.camera.x + window.innerWidth / 2, offsetY: -state.camera.y + window.innerHeight / 2 };
      state.nodes[fromId] = { id: fromId, groupId: gId, lx: 0, ly: 0, gx: 0, gy: 0 };
    }

    if (!state.nodes[toId]) {
      if (isSpecial) {
        const gId = state.globalGroupCounter++;
        state.groups[gId] = { offsetX: state.nodes[fromId].gx + 120, offsetY: state.nodes[fromId].gy + 120 };
        state.nodes[toId] = { id: toId, groupId: gId, lx: 0, ly: 0, gx: 0, gy: 0 };
      } else {
        state.nodes[toId] = { 
          id: toId, 
          groupId: state.nodes[fromId].groupId, 
          lx: state.nodes[fromId].lx + DIRS[dir].x * GRID_SIZE, 
          ly: state.nodes[fromId].ly + DIRS[dir].y * GRID_SIZE,
          gx: 0, gy: 0
        };
      }
    } else {
      if (!isSpecial && state.nodes[fromId].groupId !== state.nodes[toId].groupId) {
        const targetGroup = state.nodes[fromId].groupId; 
        const oldGroupId = state.nodes[toId].groupId;
        const expectedLx = state.nodes[fromId].lx + DIRS[dir].x * GRID_SIZE; 
        const expectedLy = state.nodes[fromId].ly + DIRS[dir].y * GRID_SIZE;
        const mergeDx = expectedLx - state.nodes[toId].lx; 
        const mergeDy = expectedLy - state.nodes[toId].ly;
        
        for (const n in state.nodes) { 
          if (state.nodes[n].groupId === oldGroupId) { 
            state.nodes[n].groupId = targetGroup; 
            state.nodes[n].lx += mergeDx; 
            state.nodes[n].ly += mergeDy; 
          } 
        }
        delete state.groups[oldGroupId];
      }
    }

    updateGlobalCoords();
    draw();
  };

  const updateGlobalCoords = () => {
    const state = engine.current;
    for (const id in state.nodes) {
      const n = state.nodes[id]; 
      const g = state.groups[n.groupId];
      n.gx = g.offsetX + n.lx; 
      n.gy = g.offsetY + n.ly;
    }
  };

  // Setup Effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = engine.current;
    
    setIsLocalhost(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    const allNodes = new Set(Object.keys(state.mapAdjacency));
    for (const u in state.mapAdjacency) state.mapAdjacency[u].forEach(e => allNodes.add(e.id));
    
    const DIRS: Record<string, {x: number, y: number}> = { 
      'N':{x:0,y:-1}, 'S':{x:0,y:1}, 'E':{x:1,y:0}, 'W':{x:-1,y:0}, 
      'NE':{x:1,y:-1}, 'NW':{x:-1,y:-1}, 'SE':{x:1,y:1}, 'SW':{x:-1,y:1} 
    };
    const startPositions = [
      {x: window.innerWidth*0.3, y: window.innerHeight*0.4}, 
      {x: window.innerWidth*0.7, y: window.innerHeight*0.6}, 
      {x: window.innerWidth*0.5, y: window.innerHeight*0.8}
    ];
    
    allNodes.forEach(nodeId => {
      if (!state.nodes[nodeId]) {
        const gId = state.globalGroupCounter++;
        const pos = startPositions[gId % startPositions.length] || {x: window.innerWidth/2, y: window.innerHeight/2};
        state.groups[gId] = { offsetX: pos.x, offsetY: pos.y };
        state.nodes[nodeId] = { id: nodeId, groupId: gId, lx: 0, ly: 0, gx: 0, gy: 0 };

        const queue: string[] = [nodeId];
        while (queue.length > 0) {
          const curr = queue.shift()!; 
          const currNode = state.nodes[curr];
          if (state.mapAdjacency[curr]) {
            state.mapAdjacency[curr].forEach(edge => {
              if (!edge.dir.startsWith('Special')) {
                if (!state.nodes[edge.id]) {
                  state.nodes[edge.id] = { 
                    id: edge.id, 
                    groupId: currNode.groupId, 
                    lx: currNode.lx + DIRS[edge.dir].x * 80, 
                    ly: currNode.ly + DIRS[edge.dir].y * 80,
                    gx: 0, gy: 0 
                  };
                  queue.push(edge.id);
                }
              }
            });
          }
        }
      }
    });
    updateGlobalCoords();

    // P2P Setup
    const generateCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    const peer = new Peer(`map-${generateCode}`);
    
    peer.on('open', (id) => {
      setRoomCode(generateCode);
      console.log('Host P2P ID:', id);
    });

    peer.on('connection', (conn) => {
        console.log('Mobile device connected via P2P.');
        
        conn.on('data', (data: any) => {
          if (data.type === 'API_REQUEST') {
            const { endpoint, reqId, body } = data;
            let responseData = {};
            
            try {
              const state = engine.current;
              
              // --- ENDPOINT: /connect ---
              if (endpoint === '/connect') {
                const { playerName } = body;
                const hasLoc = !!state.characters[playerName]?.location_id;
                responseData = { success: true, hasLocation: hasLoc };
              } 
              
              // --- ENDPOINT: /crashland ---
              else if (endpoint === '/crashland') {
                const { playerName, requestedLocation, playerColor } = body;
                state.characters[playerName] = { 
                  color: playerColor || '#ffffff', 
                  location_id: requestedLocation 
                };
                
                // Create isolated node if it doesn't exist
                if (!state.nodes[requestedLocation]) {
                  const gId = state.globalGroupCounter++;
                  state.groups[gId] = { offsetX: window.innerWidth / 2, offsetY: window.innerHeight / 2 };
                  state.nodes[requestedLocation] = { id: requestedLocation, groupId: gId, lx: 0, ly: 0, gx: 0, gy: 0 };
                  updateGlobalCoords();
                }
                responseData = { confirmedLocation: requestedLocation };
                draw();
              } 
              
              // --- ENDPOINT: /move ---
              else if (endpoint === '/move') {
                const { playerName, currentLocation, targetLocation, direction } = body;
                // Re-use our existing processMove logic here
                processMove({
                  charName: playerName,
                  fromId: currentLocation || state.characters[playerName].location_id,
                  dir: direction,
                  toId: targetLocation,
                  specialId: direction.includes('Special') ? targetLocation : ''
                });
                responseData = { newLocation: targetLocation };
              }
  
              // --- ENDPOINT: /resources ---
              else if (endpoint === '/resources') {
                // Store resources in state if needed
                console.log(`Resources synced for ${body.playerName}:`, body.resources);
                responseData = { success: true };
              }
  
              // Send standard response back to the client
              conn.send({ type: 'API_RESPONSE', reqId, ok: true, data: responseData });
  
            } catch (error: any) {
              conn.send({ type: 'API_RESPONSE', reqId, ok: false, error: error.message });
            }
          }
        });
      });

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; draw(); };
    window.addEventListener('resize', resize);
    resize();

    return () => {
      window.removeEventListener('resize', resize);
      peer.destroy();
    };
  }, []);

  // Event Handlers for Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = engine.current;

    const handleDown = (e: MouseEvent) => {
      const wp = { x: e.clientX - state.camera.x, y: e.clientY - state.camera.y }; 
      state.lastMouse = { x: e.clientX, y: e.clientY };
      
      if (mode === 'draw' || mode === 'erase') {
        state.currentStroke = { color: penColor, isEraser: mode === 'erase', points: [wp] };
        state.drawings.push(state.currentStroke);
      } else if (mode === 'drag') {
        const clickedNode = Object.values(state.nodes).find(n => Math.hypot(n.gx - wp.x, n.gy - wp.y) < 20);
        if (clickedNode) state.draggedGroup = state.groups[clickedNode.groupId]; 
        else state.isDraggingCamera = true;
      }
    };
    
    const handleMove = (e: MouseEvent) => {
      const mp = { x: e.clientX, y: e.clientY }; 
      const wp = { x: e.clientX - state.camera.x, y: e.clientY - state.camera.y };
      const dx = mp.x - state.lastMouse.x; 
      const dy = mp.y - state.lastMouse.y;
      
      if ((mode === 'draw' || mode === 'erase') && state.currentStroke) {
        state.currentStroke.points.push(wp); draw();
      } else if (mode === 'drag') {
        if (state.draggedGroup) { 
          state.draggedGroup.offsetX += dx; 
          state.draggedGroup.offsetY += dy; 
          updateGlobalCoords(); draw(); 
        } 
        else if (state.isDraggingCamera) { 
          state.camera.x += dx; 
          state.camera.y += dy; draw(); 
        }
      }
      state.lastMouse = mp;
    };

    const handleUp = () => { 
      state.currentStroke = null; 
      state.draggedGroup = null; 
      state.isDraggingCamera = false; 
    };

    canvas.addEventListener('mousedown', handleDown);
    canvas.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp); 

    return () => {
      canvas.removeEventListener('mousedown', handleDown);
      canvas.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [mode, penColor]);

  const cursorClass = mode === 'draw' ? 'cursor-crosshair' : mode === 'erase' ? 'cursor-cell' : 'cursor-grab active:cursor-grabbing';
  // This dynamically takes your current URL (e.g., https://username.github.io/vantage-cartographer/)
  // and appends the controller subfolder and query string.
  const basePath = window.location.pathname.endsWith('/') 
    ? window.location.pathname 
    : `${window.location.pathname}/`;
    
  const qrConnectUrl = `${window.location.origin}${basePath}controller/?code=${roomCode}`;

  return (
    <div className="w-screen h-screen relative">
      <div className="absolute top-5 left-5 bg-neutral-800/90 p-4 rounded-xl border border-neutral-600 flex gap-4 items-center shadow-xl z-10 font-sans">
        <button onClick={() => setShowQR(true)} className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 px-4 rounded-lg transition-colors shadow">
          📱 Connect Phones
        </button>
        <div className="w-px h-8 bg-neutral-600"></div>
        <button onClick={() => setMode('drag')} className={`px-4 py-2 rounded-lg font-bold transition-colors ${mode === 'drag' ? 'bg-emerald-600 text-white' : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'}`}>✋ Move Map</button>
        <button onClick={() => setMode('draw')} className={`px-4 py-2 rounded-lg font-bold transition-colors ${mode === 'draw' ? 'bg-emerald-600 text-white' : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'}`}>✏️ Draw</button>
        <button onClick={() => setMode('erase')} className={`px-4 py-2 rounded-lg font-bold transition-colors ${mode === 'erase' ? 'bg-emerald-600 text-white' : 'bg-neutral-700 text-neutral-300 hover:bg-neutral-600'}`}>🧽 Erase</button>
        <div className="w-px h-8 bg-neutral-600"></div>
        <input type="color" value={penColor} onChange={(e) => setPenColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0" />
        <button onClick={clearDrawings} className="bg-red-900/50 hover:bg-red-800 text-white p-2 rounded-lg transition-colors shadow">🗑️</button>
      </div>

      {showQR && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center font-sans" onClick={() => setShowQR(false)}>
          <h1 className="text-4xl text-white font-bold mb-2">Join the Game</h1>
          <h2 className="text-2xl text-amber-500 mb-8 tracking-widest">Code: {roomCode}</h2>
          
          {isLocalhost && (
            <div className="mb-6 bg-red-900/50 border border-red-500 text-white p-4 rounded max-w-md text-center">
              <strong>Warning:</strong> You are viewing this on localhost. Phones on your Wi-Fi cannot scan this QR code! Access the host map via your local network IP (e.g. http://192.168.1.X:5173).
            </div>
          )}

          <div className="bg-white p-6 rounded-2xl shadow-2xl mb-4" onClick={(e) => e.stopPropagation()}>
            <QRCodeCanvas value={qrConnectUrl} size={256} />
          </div>
          <p className="text-neutral-400 mt-2 font-mono">{qrConnectUrl}</p>
          <p className="text-neutral-500 mt-4">(Click anywhere to close)</p>
        </div>
      )}

      <canvas ref={canvasRef} className={`block w-full h-full ${cursorClass}`} />
    </div>
  );
};

export default HostMap;