/**
 * Matchmaking System Demo
 *
 * Demonstrates the matchmaking system with:
 * - Queue management
 * - Skill-based matchmaking
 * - Match acceptance
 * - Lobby management
 */

import { GamePlatform } from '../src/core/game-platform';
import { MatchmakingSystem } from '../src/core/matchmaking';
import { GameType } from '../src/types/core.types';

async function matchmakingDemo() {
  console.log('='.repeat(60));
  console.log('🎯 MATCHMAKING SYSTEM DEMO');
  console.log('='.repeat(60));
  console.log();

  // Initialize platform and matchmaking
  const platform = new GamePlatform();
  const matchmaking = new MatchmakingSystem();

  await platform.initialize();

  console.log('='.repeat(60));
  console.log('👥 CREATING PLAYERS');
  console.log('='.repeat(60));
  console.log();

  // Create players with different skill levels
  const players = [];
  for (let i = 1; i <= 12; i++) {
    const player = platform.createPlayer(`Player${i}`);

    // Simulate different skill levels
    for (let j = 0; j < i; j++) {
      platform.getPlayer(player.id)!.stats.wins = i * 2;
      platform.getPlayer(player.id)!.stats.gamesPlayed = i * 4;
      platform.getPlayer(player.id)!.level = i;
    }

    players.push(player);
    console.log(`Created ${player.username} - Level ${player.level}`);
  }

  console.log();
  console.log('='.repeat(60));
  console.log('📋 QUEUE STATUS');
  console.log('='.repeat(60));
  console.log();

  // Show initial queue status
  const queueStatuses = matchmaking.getAllQueueStatuses();
  console.log(`Total queues: ${queueStatuses.length}`);
  queueStatuses.slice(0, 5).forEach(status => {
    console.log(`  ${status.gameType} (${status.mode}): ${status.playersInQueue} players`);
  });

  console.log();
  console.log('='.repeat(60));
  console.log('🎮 FPS MATCHMAKING (10 players needed)');
  console.log('='.repeat(60));
  console.log();

  // Listen for matchmaking events
  matchmaking.on('player:joined:queue', (data) => {
    console.log(`✅ ${data.player.username} joined queue`);
  });

  matchmaking.on('match:found', (lobby) => {
    console.log();
    console.log(`🎯 MATCH FOUND! Lobby: ${lobby.id}`);
    console.log(`Game Type: ${lobby.gameType}`);
    console.log(`Players: ${lobby.players.length}`);
    console.log(`Status: ${lobby.status}`);
    console.log(`Expires in: ${Math.round((lobby.expiresAt - Date.now()) / 1000)}s`);
    console.log();
  });

  matchmaking.on('match:accepted', (data) => {
    const lobby = matchmaking.getLobby(data.lobbyId);
    console.log(`✅ Player accepted (${lobby?.acceptedPlayers.length}/${lobby?.players.length})`);
  });

  matchmaking.on('match:ready', (lobby) => {
    console.log();
    console.log(`🚀 MATCH READY! All players accepted.`);
    console.log(`Lobby: ${lobby.id}`);
    console.log(`Creating game session...`);
    console.log();
  });

  // Add players to FPS queue
  const fpsPlayers = players.slice(0, 10);
  for (const player of fpsPlayers) {
    matchmaking.joinQueue(player, GameType.FPS, { mode: 'deathmatch' });
    await sleep(100);
  }

  // Wait for match to form
  await sleep(1000);

  console.log('='.repeat(60));
  console.log('✓ FPS MATCH ACCEPTANCE');
  console.log('='.repeat(60));
  console.log();

  // Get the lobby
  const lobbies = Array.from((matchmaking as any).lobbies.values());
  if (lobbies.length > 0) {
    const lobby = lobbies[0] as any;

    // Players accept the match
    for (const playerId of lobby.players) {
      matchmaking.acceptMatch(lobby.id, playerId);
      await sleep(200);
    }
  }

  await sleep(1000);

  console.log();
  console.log('='.repeat(60));
  console.log('🏎️ RACING MATCHMAKING (8 players needed)');
  console.log('='.repeat(60));
  console.log();

  // Racing queue
  const racingPlayers = players.slice(0, 8);
  for (const player of racingPlayers) {
    // First leave FPS queue if still in it
    matchmaking.leaveQueue(player.id);
    await sleep(100);
  }

  for (const player of racingPlayers) {
    matchmaking.joinQueue(player, GameType.RACING, { mode: 'circuit' });
    await sleep(100);
  }

  await sleep(1000);

  console.log();
  console.log('='.repeat(60));
  console.log('⚔️ STRATEGY MATCHMAKING (2 players - 1v1)');
  console.log('='.repeat(60));
  console.log();

  // Strategy queue (1v1)
  const strategyPlayers = players.slice(10, 12);
  for (const player of strategyPlayers) {
    matchmaking.joinQueue(player, GameType.STRATEGY, { mode: 'conquest' });
    await sleep(100);
  }

  await sleep(1000);

  console.log();
  console.log('='.repeat(60));
  console.log('📊 FINAL QUEUE STATISTICS');
  console.log('='.repeat(60));
  console.log();

  const finalStatuses = matchmaking.getAllQueueStatuses();
  finalStatuses.forEach(status => {
    if (status.playersInQueue > 0) {
      console.log(`${status.gameType} (${status.mode}):`);
      console.log(`  Players in queue: ${status.playersInQueue}`);
      console.log(`  Average wait time: ${Math.round(status.averageWaitTime / 1000)}s`);
      console.log(`  Estimated match time: ${Math.round(status.estimatedMatchTime / 1000)}s`);
      console.log();
    }
  });

  console.log('='.repeat(60));
  console.log('✅ MATCHMAKING DEMO COMPLETE');
  console.log('='.repeat(60));
  console.log();

  await platform.shutdown();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

if (require.main === module) {
  matchmakingDemo().catch(error => {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  });
}

export { matchmakingDemo };
