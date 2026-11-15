import React, { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import Peer, { type DataConnection } from 'peerjs';
import type { Character, GameState, MovePayload } from '../types';
import {
  processMove as applyMove,
  undoMove as revertMove,
  updateGlobalCoords as syncGlobalCoords,
  getKnownNeighbors,
  getAllKnownEdges,
  DIRS,
} from '../movement';

const INK_SWATCHES = [
  { label: 'Parchment', hex: '#f6f2e9' },
  { label: 'Emerald', hex: '#10b981' },
  { label: 'Amber', hex: '#f59e0b' },
  { label: 'Sky', hex: '#38bdf8' },
  { label: 'Coral', hex: '#fb7185' },
];

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

const HostMap: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showQR, setShowQR] = useState<boolean>(false);
  const [roomCode, setRoomCode] = useState<string>('----');
  const [isLocalhost, setIsLocalhost] = useState<boolean>(false);
  const [mode, setMode] = useState<'drag' | 'draw' | 'erase'>('drag');
  const [penColor, setPenColor] = useState<string>('#f6f2e9');
  const [explorerRoster, setExplorerRoster] = useState<Array<{ name: string } & Character>>([]);

  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const connectionsRef = useRef<Set<DataConnection>>(new Set());

  // Game State Ref (Mutable to avoid React re-renders killing 60fps canvas)
  const engine = useRef<GameState>({
    mapAdjacency: {},
    characters: {},
    nodes: {},
    groups: {},
    globalGroupCounter: 0,
    drawings: [],
    currentStroke: null,
    camera: { x: 0, y: 0 },
    isDraggingCamera: false,
    draggedGroup: null,
    lastMouse: { x: 0, y: 0 },
  });

  const syncRosterState = () => {
    const chars = engine.current.characters;
    const list = Object.keys(chars).map((name) => ({
      name,
      color: chars[name].color,
      location_id: chars[name].location_id,
    }));
    setExplorerRoster(list);
  };

  const clearDrawings = () => {
    engine.current.drawings = [];
    draw();
  };

  const recenterMap = () => {
    const state = engine.current;
    const nodeList = Object.values(state.nodes);
    if (nodeList.length === 0) {
      state.camera.x = 0;
      state.camera.y = 0;
      draw();
      return;
    }
    const avgX = nodeList.reduce((acc, n) => acc + n.gx, 0) / nodeList.length;
    const avgY = nodeList.reduce((acc, n) => acc + n.gy, 0) / nodeList.length;
    state.camera.x = window.innerWidth / 2 - avgX;
    state.camera.y = window.innerHeight / 2 - avgY;
    draw();
  };

  const focusNode = (locationId: string) => {
    const state = engine.current;
    const target = state.nodes[locationId];
    if (!target) return;
    state.camera.x = window.innerWidth / 2 - target.gx;
    state.camera.y = window.innerHeight / 2 - target.gy;
    draw();
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const state = engine.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Subtle Panning Cartographic Grid
    const gridSpacing = 80;
    const majorEvery = 4;
    const offsetX = ((state.camera.x % gridSpacing) + gridSpacing) % gridSpacing;
    const offsetY = ((state.camera.y % gridSpacing) + gridSpacing) % gridSpacing;
    const startWorldCol = Math.floor(-state.camera.x / gridSpacing);
    const startWorldRow = Math.floor(-state.camera.y / gridSpacing);

    ctx.save();
    for (let x = offsetX, i = 0; x < canvas.width; x += gridSpacing, i++) {
      const colIndex = startWorldCol + i;
      const isMajor = colIndex % majorEvery === 0;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.strokeStyle = isMajor ? 'rgba(226, 204, 162, 0.065)' : 'rgba(226, 204, 162, 0.025)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (let y = offsetY, j = 0; y < canvas.height; y += gridSpacing, j++) {
      const rowIndex = startWorldRow + j;
      const isMajor = rowIndex % majorEvery === 0;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.strokeStyle = isMajor ? 'rgba(226, 204, 162, 0.065)' : 'rgba(226, 204, 162, 0.025)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(state.camera.x, state.camera.y);

    // 2. Freehand Ink Layer (drawn on an offscreen-compatible composite or directly)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    state.drawings.forEach((stroke) => {
      if (stroke.points.length < 2) return;
      ctx.globalCompositeOperation = stroke.isEraser ? 'destination-out' : 'source-over';
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.lineWidth = stroke.isEraser ? 26 : 3;
      ctx.strokeStyle = stroke.isEraser ? '#000000' : stroke.color;
      ctx.stroke();
    });
    ctx.globalCompositeOperation = 'source-over';

    // 3. Directional Map Paths
    const drawPathArrow = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      color: string,
      isSpecial: boolean,
      offset: number
    ) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return;

      const nx = -dy / len;
      const ny = dx / len;
      const clearance = 26;
      const sx = x1 + nx * offset + (dx / len) * clearance;
      const sy = y1 + ny * offset + (dy / len) * clearance;
      const ex = x2 + nx * offset - (dx / len) * clearance;
      const ey = y2 + ny * offset - (dy / len) * clearance;

      let arrowAngle: number;
      ctx.beginPath();
      if (isSpecial) {
        ctx.setLineDash([5, 6]);
        const cx = (sx + ex) / 2 + nx * 72;
        const cy = (sy + ey) / 2 + ny * 72;
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(cx, cy, ex, ey);
        const t = 0.94;
        const px = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * cx + t * t * ex;
        const py = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * cy + t * t * ey;
        arrowAngle = Math.atan2(ey - py, ex - px);
      } else {
        ctx.setLineDash([]);
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        arrowAngle = Math.atan2(dy, dx);
      }

      // Subtle dark casing for legibility
      ctx.strokeStyle = 'rgba(11, 14, 20, 0.85)';
      ctx.lineWidth = 5;
      ctx.stroke();

      ctx.strokeStyle = color;
      ctx.lineWidth = 2.25;
      ctx.stroke();
      ctx.setLineDash([]);

      const headLen = 9;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(
        ex - headLen * Math.cos(arrowAngle - Math.PI / 6),
        ey - headLen * Math.sin(arrowAngle - Math.PI / 6)
      );
      ctx.moveTo(ex, ey);
      ctx.lineTo(
        ex - headLen * Math.cos(arrowAngle + Math.PI / 6),
        ey - headLen * Math.sin(arrowAngle + Math.PI / 6)
      );
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.25;
      ctx.stroke();
    };

    for (const u in state.mapAdjacency) {
      const uNode = state.nodes[u];
      if (!uNode) continue;
      state.mapAdjacency[u].forEach((edge) => {
        const vNode = state.nodes[edge.id];
        if (!vNode) return;
        const isSpecial = edge.dir.startsWith('Special');
        const charCount = edge.characters.length;
        edge.characters.forEach((charName, index) => {
          const color = state.characters[charName]?.color || '#e5cf9e';
          drawPathArrow(
            uNode.gx,
            uNode.gy,
            vNode.gx,
            vNode.gy,
            color,
            isSpecial,
            (index - (charCount - 1) / 2) * 11
          );
        });
      });
    }

    // Group explorers by location so we can style occupied Vantage Location Cards
    const occupantsByNode: Record<string, Array<{ name: string; color: string }>> = {};
    for (const charName in state.characters) {
      const charData = state.characters[charName];
      if (!occupantsByNode[charData.location_id]) {
        occupantsByNode[charData.location_id] = [];
      }
      occupantsByNode[charData.location_id].push({
        name: charName,
        color: charData.color,
      });
    }

    // 4. Vantage Location Card Nodes
    const cardW = 52;
    const cardH = 36;
    for (const id in state.nodes) {
      const n = state.nodes[id];
      const occupants = occupantsByNode[id] || [];
      const hasOccupants = occupants.length > 0;
      const primaryColor = hasOccupants ? occupants[0].color : '#d5bd90';

      const x = n.gx - cardW / 2;
      const y = n.gy - cardH / 2;

      // Card drop shadow / active explorer aura
      ctx.save();
      ctx.shadowColor = hasOccupants ? primaryColor : 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = hasOccupants ? 14 : 10;
      ctx.shadowOffsetY = hasOccupants ? 0 : 3;

      drawRoundedRect(ctx, x, y, cardW, cardH, 8);
      ctx.fillStyle = '#141923';
      ctx.fill();
      ctx.restore();

      // Top Vantage Card Header Band
      ctx.save();
      drawRoundedRect(ctx, x, y, cardW, cardH, 8);
      ctx.clip();
      ctx.fillStyle = hasOccupants
        ? 'rgba(229, 207, 158, 0.14)'
        : 'rgba(229, 207, 158, 0.07)';
      ctx.fillRect(x, y, cardW, 10);
      ctx.restore();

      // Outer Card Frame Border
      drawRoundedRect(ctx, x, y, cardW, cardH, 8);
      ctx.strokeStyle = hasOccupants ? primaryColor : 'rgba(226, 204, 162, 0.45)';
      ctx.lineWidth = hasOccupants ? 2 : 1.5;
      ctx.stroke();

      // Inner Vantage Card Hairline Frame
      drawRoundedRect(ctx, x + 2.5, y + 2.5, cardW - 5, cardH - 5, 5.5);
      ctx.strokeStyle = 'rgba(255, 248, 231, 0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Small Compass Diamond Pip in Upper-Right of Card Header
      ctx.save();
      ctx.translate(x + cardW - 8, y + 6);
      ctx.beginPath();
      ctx.moveTo(0, -2.2);
      ctx.lineTo(2.2, 0);
      ctx.lineTo(0, 2.2);
      ctx.lineTo(-2.2, 0);
      ctx.closePath();
      ctx.fillStyle = hasOccupants ? primaryColor : 'rgba(229, 207, 158, 0.55)';
      ctx.fill();
      ctx.restore();

      // Location Card Number (#412)
      const label = /^\d+$/.test(id) ? `#${id}` : id.slice(0, 5);
      ctx.font = '700 12px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f6f2e9';
      ctx.fillText(label, n.gx, n.gy + 3.5);

      // 5. Explorer Name Badges Above Occupied Node
      if (hasOccupants) {
        occupants.forEach((occ, idx) => {
          const badgeY = y - 10 - idx * 20;
          ctx.font = '700 11px "Plus Jakarta Sans", system-ui, sans-serif';
          const textWidth = ctx.measureText(occ.name).width;
          const pillW = textWidth + 20;
          const pillH = 17;
          const pillX = n.gx - pillW / 2;
          const pillY = badgeY - pillH / 2;

          drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 8.5);
          ctx.fillStyle = 'rgba(15, 19, 28, 0.92)';
          ctx.fill();
          ctx.strokeStyle = occ.color;
          ctx.lineWidth = 1.25;
          ctx.stroke();

          // Explorer Dot
          ctx.beginPath();
          ctx.arc(pillX + 7.5, badgeY, 3, 0, Math.PI * 2);
          ctx.fillStyle = occ.color;
          ctx.fill();

          // Explorer Name
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#f6f2e9';
          ctx.fillText(occ.name, pillX + 13.5, badgeY + 0.5);
        });
      }
    }

    ctx.restore();
  };

  const processMove = (moveData: MovePayload): string => {
    const resolvedToId = applyMove(engine.current, moveData);
    syncRosterState();
    draw();
    return resolvedToId;
  };

  const broadcastMapSync = () => {
    const knownEdges = getAllKnownEdges(engine.current);
    connectionsRef.current.forEach((clientConn) => {
      if (clientConn.open) {
        clientConn.send({ type: 'MAP_SYNC', knownEdges });
      }
    });
  };

  const updateGlobalCoords = () => {
    syncGlobalCoords(engine.current);
  };

  // Setup Effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const state = engine.current;

    setIsLocalhost(
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    );

    const allNodes = new Set(Object.keys(state.mapAdjacency));
    for (const u in state.mapAdjacency) state.mapAdjacency[u].forEach((e) => allNodes.add(e.id));

    const startPositions = [
      { x: window.innerWidth * 0.3, y: window.innerHeight * 0.4 },
      { x: window.innerWidth * 0.7, y: window.innerHeight * 0.6 },
      { x: window.innerWidth * 0.5, y: window.innerHeight * 0.8 },
    ];

    allNodes.forEach((nodeId) => {
      if (!state.nodes[nodeId]) {
        const gId = state.globalGroupCounter++;
        const pos = startPositions[gId % startPositions.length] || {
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        };
        state.groups[gId] = { offsetX: pos.x, offsetY: pos.y };
        state.nodes[nodeId] = { id: nodeId, groupId: gId, lx: 0, ly: 0, gx: 0, gy: 0 };

        const queue: string[] = [nodeId];
        while (queue.length > 0) {
          const curr = queue.shift()!;
          const currNode = state.nodes[curr];
          if (state.mapAdjacency[curr]) {
            state.mapAdjacency[curr].forEach((edge) => {
              if (!edge.dir.startsWith('Special')) {
                if (!state.nodes[edge.id]) {
                  state.nodes[edge.id] = {
                    id: edge.id,
                    groupId: currNode.groupId,
                    lx: currNode.lx + DIRS[edge.dir].x * 80,
                    ly: currNode.ly + DIRS[edge.dir].y * 80,
                    gx: 0,
                    gy: 0,
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
      connectionsRef.current.add(conn);
      conn.on('close', () => {
        connectionsRef.current.delete(conn);
      });
      conn.on('error', () => {
        connectionsRef.current.delete(conn);
      });

      conn.on('data', (data: any) => {
        if (data.type === 'API_REQUEST') {
          const { endpoint, reqId, body } = data;
          let responseData = {};
          let shouldBroadcast = false;
          try {
            const state = engine.current;

            // --- ENDPOINT: /connect ---
            if (endpoint === '/connect') {
              const { playerName } = body;
              const existingChar = state.characters[playerName];
              const locId = existingChar?.location_id || null;
              const hasLoc = !!locId;
              responseData = {
                success: true,
                hasLocation: hasLoc,
                location: locId,
                color: existingChar?.color,
                knownNeighbors: getKnownNeighbors(state, locId),
                knownEdges: getAllKnownEdges(state),
              };
            }

            // --- ENDPOINT: /crashland ---
            else if (endpoint === '/crashland') {
              let { playerName, requestedLocation, playerColor } = body;

              if (!requestedLocation) {
                requestedLocation = `${playerName}_dropzone`;
              }

              state.characters[playerName] = {
                color: playerColor || '#ffffff',
                location_id: requestedLocation,
              };

              if (!state.nodes[requestedLocation]) {
                const gId = state.globalGroupCounter++;
                const spreadX = (Math.random() - 0.5) * 300;
                const spreadY = (Math.random() - 0.5) * 300;

                state.groups[gId] = {
                  offsetX: window.innerWidth / 2 + spreadX - state.camera.x,
                  offsetY: window.innerHeight / 2 + spreadY - state.camera.y,
                };

                state.nodes[requestedLocation] = {
                  id: requestedLocation,
                  groupId: gId,
                  lx: 0,
                  ly: 0,
                  gx: 0,
                  gy: 0,
                };
              }

              updateGlobalCoords();
              syncRosterState();
              responseData = {
                confirmedLocation: requestedLocation,
                knownNeighbors: getKnownNeighbors(state, requestedLocation),
                knownEdges: getAllKnownEdges(state),
              };
              draw();
            }

            // --- ENDPOINT: /move ---
            else if (endpoint === '/move') {
              const { playerName, currentLocation, targetLocation, direction } = body;
              const fromId = currentLocation || state.characters[playerName]?.location_id;

              if (!fromId || !targetLocation) {
                throw new Error(
                  `Invalid move: Missing fromId (${fromId}) or targetLocation (${targetLocation})`
                );
              }

              const resolvedLocation = processMove({
                charName: playerName,
                fromId: fromId,
                dir: direction,
                toId: targetLocation,
              });

              responseData = {
                newLocation: resolvedLocation,
                knownNeighbors: getKnownNeighbors(state, resolvedLocation),
                knownEdges: getAllKnownEdges(state),
              };
              shouldBroadcast = true;
            }

            // --- ENDPOINT: /undo ---
            else if (endpoint === '/undo') {
              const { playerName, fromLocation, toLocation, direction } = body;

              if (!fromLocation || !toLocation || !direction) {
                throw new Error(
                  `Invalid undo: Missing fromLocation (${fromLocation}), toLocation (${toLocation}), or direction (${direction})`
                );
              }

              const { edgeRemoved } = revertMove(state, {
                charName: playerName,
                fromId: fromLocation,
                dir: direction,
                toId: toLocation,
              });
              syncRosterState();
              draw();

              responseData = {
                revertedLocation: fromLocation,
                edgeRemoved,
                knownNeighbors: getKnownNeighbors(state, fromLocation),
                knownEdges: getAllKnownEdges(state),
              };
              shouldBroadcast = true;
            }

            // --- ENDPOINT: /resources ---
            else if (endpoint === '/resources') {
              console.log(`Resources synced for ${body.playerName}:`, body.resources);
              responseData = { success: true };
            }

            conn.send({ type: 'API_RESPONSE', reqId, ok: true, data: responseData });
            if (shouldBroadcast) {
              broadcastMapSync();
            }
          } catch (error: any) {
            console.error('[Host API] Error:', error.message);
            conn.send({ type: 'API_RESPONSE', reqId, ok: false, error: error.message });
          }
        }
      });
    });

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      draw();
    };
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
      const wp = { x: e.offsetX - state.camera.x, y: e.offsetY - state.camera.y };
      state.lastMouse = { x: e.offsetX, y: e.offsetY };

      if (modeRef.current === 'draw' || modeRef.current === 'erase') {
        state.currentStroke = {
          color: penColor,
          isEraser: modeRef.current === 'erase',
          points: [wp],
        };
        state.drawings.push(state.currentStroke);
      } else if (modeRef.current === 'drag') {
        const clickedNode = Object.values(state.nodes).find(
          (n) => Math.hypot(n.gx - wp.x, n.gy - wp.y) < 50
        );

        if (clickedNode && state.groups[clickedNode.groupId]) {
          state.draggedGroup = state.groups[clickedNode.groupId];
        } else {
          state.isDraggingCamera = true;
        }
      }
    };

    const handleMove = (e: MouseEvent) => {
      const mp = { x: e.offsetX, y: e.offsetY };
      const wp = { x: e.offsetX - state.camera.x, y: e.offsetY - state.camera.y };
      const dx = mp.x - state.lastMouse.x;
      const dy = mp.y - state.lastMouse.y;

      if ((modeRef.current === 'draw' || modeRef.current === 'erase') && state.currentStroke) {
        state.currentStroke.points.push(wp);
        draw();
      } else if (modeRef.current === 'drag') {
        if (state.draggedGroup) {
          state.draggedGroup.offsetX += dx;
          state.draggedGroup.offsetY += dy;
          updateGlobalCoords();
          draw();
        } else if (state.isDraggingCamera) {
          state.camera.x += dx;
          state.camera.y += dy;
          draw();
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

  const cursorClass =
    mode === 'draw'
      ? 'host-canvas--draw'
      : mode === 'erase'
        ? 'host-canvas--erase'
        : 'host-canvas--drag';

  const hostPath = (
    window.location.pathname.endsWith('/')
      ? window.location.pathname
      : `${window.location.pathname}/`
  ).replace('host-map', 'controller');

  const qrConnectUrl = `${window.location.origin}${hostPath}?code=${roomCode}`;

  return (
    <div className="host-viewport">
      {/* Top Vantage Card HUD */}
      <header className="host-hud-top">
        <div className="vantage-card host-toolbar">
          <div className="host-brand-group">
            <div className="host-card-plaque">
              <svg
                className="host-card-plaque__icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
              </svg>
              <div className="host-card-plaque__meta">
                <span className="host-card-plaque__eyebrow">Vantage</span>
                <span className="host-card-plaque__title">Cartographer</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowQR(true)}
              className="connect-phones-btn"
              title="Open QR Code to connect explorer phones"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <path d="M14 14h3v3h-3z" />
                <path d="M20 14v3" />
                <path d="M14 20h7" />
              </svg>
              <span>Connect Phones</span>
              <span className="connect-phones-btn__code">{roomCode}</span>
            </button>
          </div>

          <div className="hud-divider" aria-hidden="true" />

          {/* Segmented Map Tools */}
          <div className="tool-segment" role="group" aria-label="Map tools">
            <button
              type="button"
              onClick={() => setMode('drag')}
              className={`tool-btn ${mode === 'drag' ? 'tool-btn--active' : ''}`}
            >
              <svg
                className="tool-btn__icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="5 9 2 12 5 15" />
                <polyline points="9 5 12 2 15 5" />
                <polyline points="15 19 12 22 9 19" />
                <polyline points="19 9 22 12 19 15" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <line x1="12" y1="2" x2="12" y2="22" />
              </svg>
              <span>Move Map</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('draw')}
              className={`tool-btn ${mode === 'draw' ? 'tool-btn--active' : ''}`}
            >
              <svg
                className="tool-btn__icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 19l7-7 3 3-7 7-3-3z" />
                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                <path d="M2 2l7.586 7.586" />
              </svg>
              <span>Draw</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('erase')}
              className={`tool-btn ${mode === 'erase' ? 'tool-btn--active' : ''}`}
            >
              <svg
                className="tool-btn__icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
                <path d="M22 21H7" />
                <path d="m5 11 9 9" />
              </svg>
              <span>Erase</span>
            </button>
          </div>

          <div className="hud-divider" aria-hidden="true" />

          {/* Ink Swatches & Map Actions */}
          <div className="ink-controls" aria-label="Ink colors and canvas actions">
            {INK_SWATCHES.map((swatch) => {
              const selected = penColor.toLowerCase() === swatch.hex.toLowerCase();
              return (
                <button
                  key={swatch.hex}
                  type="button"
                  className={`ink-swatch ${selected ? 'ink-swatch--selected' : ''}`}
                  style={{ backgroundColor: swatch.hex }}
                  title={`Ink color: ${swatch.label}`}
                  aria-label={`Ink color ${swatch.label}`}
                  onClick={() => {
                    setPenColor(swatch.hex);
                    if (mode !== 'draw') setMode('draw');
                  }}
                />
              );
            })}

            <label className="ink-picker-label" title="Custom ink color">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <input
                type="color"
                value={penColor}
                onChange={(e) => {
                  setPenColor(e.target.value);
                  if (mode !== 'draw') setMode('draw');
                }}
                className="ink-picker-input"
                aria-label="Custom ink color"
              />
            </label>

            <button
              type="button"
              onClick={recenterMap}
              className="icon-action-btn"
              title="Recenter map view"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4" />
                <path d="M12 18v4" />
                <path d="M2 12h4" />
                <path d="M18 12h4" />
              </svg>
              <span>Center</span>
            </button>

            <button
              type="button"
              onClick={clearDrawings}
              className="icon-action-btn icon-action-btn--danger"
              title="Clear freehand ink drawings"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span>Clear Ink</span>
            </button>
          </div>
        </div>

        {/* Active Explorers Roster Card */}
        <aside className="vantage-card roster-card" aria-label="Active Explorers">
          <div className="roster-card__header">
            <span className="roster-card__title">Explorers</span>
            <span className="roster-card__count">{explorerRoster.length} ACTIVE</span>
          </div>
          {explorerRoster.length === 0 ? (
            <p className="roster-empty">
              No explorers landed yet. Click <strong>Connect Phones</strong> to pair devices.
            </p>
          ) : (
            <div className="roster-list">
              {explorerRoster.map((exp) => (
                <button
                  key={exp.name}
                  type="button"
                  className="roster-item"
                  onClick={() => focusNode(exp.location_id)}
                  title={`Center map on ${exp.name} (#${exp.location_id})`}
                >
                  <span className="roster-item__identity">
                    <span
                      className="roster-item__dot"
                      style={{ backgroundColor: exp.color }}
                      aria-hidden="true"
                    />
                    <span className="roster-item__name">{exp.name}</span>
                  </span>
                  <span className="roster-item__loc">#{exp.location_id}</span>
                </button>
              ))}
            </div>
          )}
        </aside>
      </header>

      {/* Bottom Legend Card */}
      <div className="vantage-card host-legend" aria-hidden="true">
        <span className="host-legend__item">
          <span className="host-legend__line" />
          <span>Cardinal Path</span>
        </span>
        <span className="host-legend__item">
          <span className="host-legend__line host-legend__line--dashed" />
          <span>Portal / Enter</span>
        </span>
      </div>

      {/* Vantage Transmission QR Modal */}
      {showQR && (
        <div
          className="qr-backdrop"
          onClick={() => setShowQR(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-modal-title"
        >
          <div className="vantage-card qr-card" onClick={(e) => e.stopPropagation()}>
            <div className="qr-card__top-bar">
              <span className="qr-card__badge">Transmission // P2P</span>
              <button
                type="button"
                className="qr-card__close"
                onClick={() => setShowQR(false)}
                aria-label="Close QR modal"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <h1 id="qr-modal-title" className="qr-card__title">
              Join the Expedition
            </h1>
            <p className="qr-card__subtitle">
              Scan with your phone camera to open the Explorer Controller with this room code pre-filled.
            </p>

            <div className="qr-room-plaque">
              <span className="qr-room-plaque__label">Room Code</span>
              <span className="qr-room-plaque__code">{roomCode}</span>
            </div>

            {isLocalhost && (
              <div className="qr-warning" role="alert">
                <strong>Localhost Notice:</strong> Phones on Wi-Fi cannot reach{' '}
                <code>localhost</code>. Open the Host Map using your LAN IP (e.g.{' '}
                <code>http://192.168.1.X:5173</code>).
              </div>
            )}

            <div className="qr-frame">
              <QRCodeCanvas value={qrConnectUrl} size={220} />
            </div>

            <p className="qr-url">{qrConnectUrl}</p>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className={`host-canvas ${cursorClass}`} />
    </div>
  );
};

export default HostMap;