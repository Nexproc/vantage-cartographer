import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processMove, undoMove, getKnownNeighbors, getAllKnownEdges, DIRS, GRID_SIZE, SPECIAL_OFFSET } from '../src/movement.ts';
import type { GameState } from '../src/types.ts';

function createInitialState(): GameState {
  return {
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
  };
}

function seedStartNode(state: GameState, charName: string, locId: string, x = 500, y = 400): void {
  const gId = state.globalGroupCounter++;
  state.groups[gId] = { offsetX: x, offsetY: y };
  state.nodes[locId] = { id: locId, groupId: gId, lx: 0, ly: 0, gx: x, gy: y };
  state.characters[charName] = { color: '#50e3c2', location_id: locId };
}

describe('HostMap Movement Logic (processMove)', () => {
  describe('Cardinal and Intercardinal Move Types (N, NE, E, SE, S, SW, W, NW)', () => {
    const expectedVectors: Record<string, { x: number; y: number }> = {
      N: { x: 0, y: -1 },
      NE: { x: 1, y: -1 },
      E: { x: 1, y: 0 },
      SE: { x: 1, y: 1 },
      S: { x: 0, y: 1 },
      SW: { x: -1, y: 1 },
      W: { x: -1, y: 0 },
      NW: { x: -1, y: -1 },
    };

    for (const [dir, vec] of Object.entries(expectedVectors)) {
      it(`correctly moves ${dir} to a new node in the same group with accurate grid offset`, () => {
        const state = createInitialState();
        seedStartNode(state, 'Alice', '100', 500, 400);

        processMove(state, {
          charName: 'Alice',
          fromId: '100',
          dir,
          toId: '101',
        });

        const startNode = state.nodes['100'];
        const targetNode = state.nodes['101'];

        assert.ok(targetNode, `Target node 101 should be created for direction ${dir}`);
        assert.equal(targetNode.groupId, startNode.groupId, 'Directional move should stay in same group');
        assert.equal(targetNode.lx, vec.x * GRID_SIZE);
        assert.equal(targetNode.ly, vec.y * GRID_SIZE);
        assert.equal(targetNode.gx, 500 + vec.x * GRID_SIZE);
        assert.equal(targetNode.gy, 400 + vec.y * GRID_SIZE);
        assert.equal(state.characters['Alice'].location_id, '101');
        assert.deepEqual(state.mapAdjacency['100'], [
          { id: '101', dir, characters: ['Alice'] },
        ]);
      });
    }

    it('chains multiple directional moves and accumulates local and global coordinates', () => {
      const state = createInitialState();
      seedStartNode(state, 'Alice', '100', 300, 300);

      // 100 -> N -> 101 -> E -> 102 -> SE -> 103
      processMove(state, { charName: 'Alice', fromId: '100', dir: 'N', toId: '101' });
      processMove(state, { charName: 'Alice', fromId: '101', dir: 'E', toId: '102' });
      processMove(state, { charName: 'Alice', fromId: '102', dir: 'SE', toId: '103' });

      const n103 = state.nodes['103'];
      // N (0,-1) + E (1,0) + SE (1,1) = (2, 0)
      assert.equal(n103.lx, 2 * GRID_SIZE);
      assert.equal(n103.ly, 0);
      assert.equal(n103.gx, 300 + 2 * GRID_SIZE);
      assert.equal(n103.gy, 300);
      assert.equal(state.characters['Alice'].location_id, '103');
    });
  });

  describe('Special / Portal Move Types', () => {
    it('creates a new isolated group offset from the origin node on a Special move to a new node', () => {
      const state = createInitialState();
      seedStartNode(state, 'Alice', '100', 500, 400);

      processMove(state, {
        charName: 'Alice',
        fromId: '100',
        dir: 'Special',
        toId: '999',
      });

      const fromNode = state.nodes['100'];
      const toNode = state.nodes['999'];

      assert.ok(toNode, 'Portal destination node should be created');
      assert.notEqual(toNode.groupId, fromNode.groupId, 'Special move must create a separate group');
      assert.equal(toNode.lx, 0);
      assert.equal(toNode.ly, 0);
      assert.equal(toNode.gx, fromNode.gx + SPECIAL_OFFSET);
      assert.equal(toNode.gy, fromNode.gy + SPECIAL_OFFSET);
      assert.equal(state.characters['Alice'].location_id, '999');
      assert.deepEqual(state.mapAdjacency['100'], [
        { id: '999', dir: 'Special', characters: ['Alice'] },
      ]);
    });

    it('supports prefixed Special directions (e.g. Special_Wormhole)', () => {
      const state = createInitialState();
      seedStartNode(state, 'Alice', '100', 200, 250);

      processMove(state, {
        charName: 'Alice',
        fromId: '100',
        dir: 'Special_Wormhole',
        toId: '200',
      });

      const toNode = state.nodes['200'];
      assert.notEqual(toNode.groupId, state.nodes['100'].groupId);
      assert.equal(toNode.gx, 200 + SPECIAL_OFFSET);
      assert.equal(toNode.gy, 250 + SPECIAL_OFFSET);
      assert.equal(state.mapAdjacency['100'][0].dir, 'Special_Wormhole');
    });

    it('does NOT merge groups when making a Special move to an already existing node in another group', () => {
      const state = createInitialState();
      seedStartNode(state, 'Alice', '100', 200, 200);
      seedStartNode(state, 'Bob', '200', 700, 600);

      const groupA = state.nodes['100'].groupId;
      const groupB = state.nodes['200'].groupId;

      processMove(state, {
        charName: 'Alice',
        fromId: '100',
        dir: 'Special',
        toId: '200',
      });

      assert.equal(state.nodes['100'].groupId, groupA);
      assert.equal(state.nodes['200'].groupId, groupB, 'Special move to existing node must keep groups separate');
      assert.ok(state.groups[groupA]);
      assert.ok(state.groups[groupB]);
      assert.equal(state.nodes['200'].gx, 700);
      assert.equal(state.nodes['200'].gy, 600);
      assert.equal(state.characters['Alice'].location_id, '200');
    });

    it('correctly positions both nodes when fromId is lazily initialized on a Special move', () => {
      const state = createInitialState();
      processMove(
        state,
        {
          charName: 'Alice',
          fromId: '100',
          dir: 'Special',
          toId: '200',
        },
        { width: 1000, height: 800 }
      );

      assert.equal(state.nodes['100'].gx, 500);
      assert.equal(state.nodes['100'].gy, 400);
      assert.equal(state.nodes['200'].gx, 500 + SPECIAL_OFFSET);
      assert.equal(state.nodes['200'].gy, 400 + SPECIAL_OFFSET);
    });
  });

  describe('Group Merging & Edge Cases', () => {
    it('merges two separate groups when connected by a cardinal/intercardinal move', () => {
      const state = createInitialState();
      seedStartNode(state, 'Alice', '100', 200, 200);
      seedStartNode(state, 'Bob', '200', 600, 600);

      // Bob moves East from 200 to 201 in Group B
      processMove(state, { charName: 'Bob', fromId: '200', dir: 'E', toId: '201' });

      const groupA = state.nodes['100'].groupId;
      const groupB = state.nodes['200'].groupId;
      assert.notEqual(groupA, groupB);

      // Alice moves North from 100 into Bob's node 200 -> merges Group B into Group A
      processMove(state, { charName: 'Alice', fromId: '100', dir: 'N', toId: '200' });

      assert.equal(state.nodes['200'].groupId, groupA);
      assert.equal(state.nodes['201'].groupId, groupA);
      assert.equal(state.groups[groupB], undefined, 'Old group should be deleted after merge');

      // Node 200 is North of 100: (0, -80) relative to 100
      assert.equal(state.nodes['200'].lx, 0);
      assert.equal(state.nodes['200'].ly, -GRID_SIZE);
      assert.equal(state.nodes['200'].gx, 200);
      assert.equal(state.nodes['200'].gy, 200 - GRID_SIZE);

      // Node 201 is East of 200: (80, -80) relative to 100
      assert.equal(state.nodes['201'].lx, GRID_SIZE);
      assert.equal(state.nodes['201'].ly, -GRID_SIZE);
      assert.equal(state.nodes['201'].gx, 200 + GRID_SIZE);
      assert.equal(state.nodes['201'].gy, 200 - GRID_SIZE);
    });

    it('tracks multiple characters on the same edge without duplicating edges or character names', () => {
      const state = createInitialState();
      seedStartNode(state, 'Alice', '100', 200, 200);
      seedStartNode(state, 'Bob', '100', 200, 200);

      processMove(state, { charName: 'Alice', fromId: '100', dir: 'E', toId: '101' });
      processMove(state, { charName: 'Bob', fromId: '100', dir: 'E', toId: '101' });
      // Alice traverses same edge again
      processMove(state, { charName: 'Alice', fromId: '100', dir: 'E', toId: '101' });

      assert.equal(state.mapAdjacency['100'].length, 1);
      assert.deepEqual(state.mapAdjacency['100'][0].characters, ['Alice', 'Bob']);
    });

    it('throws an error when direction is missing or invalid', () => {
      const state = createInitialState();
      seedStartNode(state, 'Alice', '100', 200, 200);

      assert.throws(
        () => processMove(state, { charName: 'Alice', fromId: '100', dir: '' as string, toId: '101' }),
        /Invalid move: Missing direction/
      );

      assert.throws(
        () => processMove(state, { charName: 'Alice', fromId: '100', dir: 'INVALID_DIR', toId: '101' }),
        /Invalid move direction: INVALID_DIR/
      );
    });

    it('defines all 8 compass directions in DIRS', () => {
      assert.deepEqual(Object.keys(DIRS).sort(), ['E', 'N', 'NE', 'NW', 'S', 'SE', 'SW', 'W']);
    });

    it('returns bidirectional known non-special neighbors and excludes Special moves', () => {
      const state = createInitialState();
      seedStartNode(state, 'Alice', '100', 200, 200);

      // 100 --N--> 205
      processMove(state, { charName: 'Alice', fromId: '100', dir: 'N', toId: '205' });
      // 205 --SE--> 310
      processMove(state, { charName: 'Alice', fromId: '205', dir: 'SE', toId: '310' });
      // 205 --Special--> 999 (must NOT appear in known compass neighbors)
      processMove(state, { charName: 'Alice', fromId: '205', dir: 'Special', toId: '999' });

      assert.deepEqual(getKnownNeighbors(state, '100'), { N: '205' });
      assert.deepEqual(getKnownNeighbors(state, '205'), { S: '100', SE: '310' });
      assert.deepEqual(getKnownNeighbors(state, '310'), { NW: '205' });
      assert.deepEqual(getKnownNeighbors(state, '999'), {});
    });

    it('does not override an existing known cardinal/intercardinal destination on the server', () => {
      const state = createInitialState();
      seedStartNode(state, 'Alice', '100', 200, 200);
      seedStartNode(state, 'Bob', '100', 200, 200);

      // First known edge for 100 -> N is 205 (and 205 -> S is 100)
      const firstResolved = processMove(state, { charName: 'Alice', fromId: '100', dir: 'N', toId: '205' });
      assert.equal(firstResolved, '205');

      // Subsequent move from 100 -> N attempting to go to 300 must be locked to 205 server-side
      const secondResolved = processMove(state, { charName: 'Bob', fromId: '100', dir: 'N', toId: '300' });
      assert.equal(secondResolved, '205');
      assert.equal(state.characters['Bob'].location_id, '205');
      assert.equal(state.nodes['300'], undefined, 'Server must not create conflicting node 300');
      assert.equal(state.mapAdjacency['100'].length, 1);
      assert.equal(getKnownNeighbors(state, '100').N, '205');
      assert.deepEqual(getAllKnownEdges(state), {
        '100': { N: '205' },
        '205': { S: '100' },
      });
    });

    it('erases the edge and orphaned target node on undoMove when the edge was only crossed once', () => {
      const state = createInitialState();
      seedStartNode(state, 'Alice', '100', 200, 200);

      processMove(state, { charName: 'Alice', fromId: '100', dir: 'E', toId: '101' });
      assert.equal(state.characters['Alice'].location_id, '101');
      assert.ok(state.nodes['101']);
      assert.equal(state.mapAdjacency['100']?.length, 1);

      const { edgeRemoved } = undoMove(state, { charName: 'Alice', fromId: '100', dir: 'E', toId: '101' });
      assert.equal(edgeRemoved, true);
      assert.equal(state.characters['Alice'].location_id, '100');
      assert.equal(state.mapAdjacency['100'], undefined, 'Edge should be erased when crossed only once');
      assert.equal(state.nodes['101'], undefined, 'Orphaned target node should be cleaned up');
      assert.deepEqual(getKnownNeighbors(state, '100'), {});
    });

    it('preserves the edge on undoMove when the edge has been crossed more than once', () => {
      const state = createInitialState();
      seedStartNode(state, 'Alice', '100', 200, 200);

      // Cross 100 -> E -> 101, then 101 -> W -> 100, then 100 -> E -> 101 again
      processMove(state, { charName: 'Alice', fromId: '100', dir: 'E', toId: '101' });
      processMove(state, { charName: 'Alice', fromId: '101', dir: 'W', toId: '100' });
      processMove(state, { charName: 'Alice', fromId: '100', dir: 'E', toId: '101' });

      const { edgeRemoved } = undoMove(state, { charName: 'Alice', fromId: '100', dir: 'E', toId: '101' });
      assert.equal(edgeRemoved, false, 'Edge crossed multiple times must NOT be erased on undo');
      assert.equal(state.characters['Alice'].location_id, '100');
      assert.equal(state.mapAdjacency['100']?.length, 1);
      assert.ok(state.nodes['101']);
      assert.equal(getKnownNeighbors(state, '100').E, '101');
    });

    it('removes only the undoing character from edge.characters when two players crossed the same edge', () => {
      const state = createInitialState();
      seedStartNode(state, 'Alice', '100', 200, 200);
      seedStartNode(state, 'Bob', '100', 200, 200);

      processMove(state, { charName: 'Alice', fromId: '100', dir: 'E', toId: '101' });
      processMove(state, { charName: 'Bob', fromId: '100', dir: 'E', toId: '101' });
      assert.deepEqual(state.mapAdjacency['100'][0].characters, ['Alice', 'Bob']);

      const { edgeRemoved } = undoMove(state, { charName: 'Bob', fromId: '100', dir: 'E', toId: '101' });
      assert.equal(edgeRemoved, false);
      assert.equal(state.characters['Bob'].location_id, '100');
      assert.deepEqual(state.mapAdjacency['100'][0].characters, ['Alice']);
    });
  });
});
