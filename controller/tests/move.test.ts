import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import module from 'node:module';

// Register lightweight module hooks so GameService.ts can be imported directly in Node
// even without peerjs installed in node_modules and with extensionless relative imports.
module.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'peerjs') {
      return {
        url: 'data:text/javascript,export default class Peer {}',
        shortCircuit: true,
      };
    }
    if (specifier.startsWith('./') && !specifier.endsWith('.ts') && !specifier.endsWith('.js')) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { GameService } = await import('../src/GameService.ts');
const { processMove, GRID_SIZE, SPECIAL_OFFSET } = await import('../../host-map/src/movement.ts');
import type { Direction } from '../src/types.ts';
import type { GameState } from '../../host-map/src/types.ts';

function createHostState(): GameState {
  return {
    mapAdjacency: {},
    characters: {
      Alice: { color: '#50e3c2', location_id: '100' },
    },
    nodes: {
      '100': { id: '100', groupId: 0, lx: 0, ly: 0, gx: 500, gy: 400 },
    },
    groups: {
      0: { offsetX: 500, offsetY: 400 },
    },
    globalGroupCounter: 1,
    drawings: [],
    currentStroke: null,
    camera: { x: 0, y: 0 },
    isDraggingCamera: false,
    draggedGroup: null,
    lastMouse: { x: 0, y: 0 },
  };
}

describe('Controller GameService.move & End-to-End Move Integration', () => {
  const sentRequests: Array<{ endpoint: string; body: Record<string, unknown> }> = [];

  beforeEach(() => {
    sentRequests.length = 0;
    // Intercept GameService.request to inspect the exact payload sent over PeerJS
    (GameService as unknown as { request: (endpoint: string, body: Record<string, unknown>) => Promise<unknown> }).request =
      async (endpoint: string, body: Record<string, unknown>) => {
        sentRequests.push({ endpoint, body });
        return { newLocation: body.targetLocation };
      };
  });

  const compassDirections: Exclude<Direction, 'C' | null>[] = [
    'N',
    'NE',
    'E',
    'SE',
    'S',
    'SW',
    'W',
    'NW',
  ];

  for (const dir of compassDirections) {
    it(`sends direction="${dir}" in the /move payload for ${dir} movement`, async () => {
      await GameService.move('ABCD', 'Alice', '100', '101', dir);

      assert.equal(sentRequests.length, 1);
      assert.equal(sentRequests[0].endpoint, '/move');
      assert.deepEqual(sentRequests[0].body, {
        gameCode: 'ABCD',
        playerName: 'Alice',
        currentLocation: '100',
        targetLocation: '101',
        direction: dir,
      });
      assert.equal('payloadDir' in sentRequests[0].body, false, 'Must not leak payloadDir key');
    });
  }

  it('converts compass Center ("C") to direction="Special" in the /move payload', async () => {
    await GameService.move('ABCD', 'Alice', '100', '999', 'C');

    assert.equal(sentRequests.length, 1);
    assert.equal(sentRequests[0].endpoint, '/move');
    assert.deepEqual(sentRequests[0].body, {
      gameCode: 'ABCD',
      playerName: 'Alice',
      currentLocation: '100',
      targetLocation: '999',
      direction: 'Special',
    });
    assert.equal('payloadDir' in sentRequests[0].body, false, 'Must not leak payloadDir key');
  });

  it('end-to-end: controller move payloads for all 9 move types are accepted and processed by host-map', async () => {
    const allMoveTypes: Exclude<Direction, null>[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'C'];

    for (const dir of allMoveTypes) {
      const hostState = createHostState();
      sentRequests.length = 0;

      await GameService.move('ABCD', 'Alice', '100', '200', dir);
      const { body } = sentRequests[0];

      // Simulate HostMap.tsx /move endpoint handler
      const { playerName, currentLocation, targetLocation, direction } = body as {
        playerName: string;
        currentLocation: string;
        targetLocation: string;
        direction: string;
      };
      const fromId = currentLocation || hostState.characters[playerName]?.location_id;

      processMove(hostState, {
        charName: playerName,
        fromId,
        dir: direction,
        toId: targetLocation,
      });

      assert.equal(hostState.characters['Alice'].location_id, '200');
      assert.ok(hostState.nodes['200'], `Node 200 should exist after move ${dir}`);

      if (dir === 'C') {
        assert.notEqual(
          hostState.nodes['200'].groupId,
          hostState.nodes['100'].groupId,
          'Portal (C -> Special) move should place target node in a new group'
        );
        assert.equal(hostState.nodes['200'].gx, 500 + SPECIAL_OFFSET);
        assert.equal(hostState.nodes['200'].gy, 400 + SPECIAL_OFFSET);
        assert.equal(hostState.mapAdjacency['100'][0].dir, 'Special');
      } else {
        assert.equal(
          hostState.nodes['200'].groupId,
          hostState.nodes['100'].groupId,
          `Directional move (${dir}) should stay in the same group`
        );
        assert.equal(hostState.mapAdjacency['100'][0].dir, dir);
        const dist = Math.hypot(
          hostState.nodes['200'].gx - hostState.nodes['100'].gx,
          hostState.nodes['200'].gy - hostState.nodes['100'].gy
        );
        assert.ok(dist >= GRID_SIZE, `Directional move (${dir}) should offset node by grid distance`);
      }
    }
  });
});
