/**
 * Battle Royale Demo
 *
 * Demonstrates a 100-player Battle Royale game with:
 * - Player drops
 * - Looting and combat
 * - Zone shrinking
 * - Victory Royale
 */

import { GamePlatform } from '../src/core/game-platform';
import { BattleRoyaleGame } from '../src/games/battle-royale.game';
import { GameType, ProviderType } from '../src/types/core.types';

async function battleRoyaleDemo() {
  console.log('='.repeat(60));
  console.log('🪂 BATTLE ROYALE DEMO');
  console.log('='.repeat(60));
  console.log();

  // Initialize platform
  const platform = new GamePlatform();
  await platform.initialize();

  console.log('='.repeat(60));
  console.log('👥 CREATING 20 PLAYERS (Simulating 100-player match)');
  console.log('='.repeat(60));
  console.log();

  const players = [];
  for (let i = 1; i <= 20; i++) {
    const player = platform.createPlayer(`Player${i}`);
    players.push(player);
  }

  console.log(`✅ Created ${players.length} players`);

  console.log();
  console.log('='.repeat(60));
  console.log('🎮 STARTING BATTLE ROYALE SESSION');
  console.log('='.repeat(60));
  console.log();

  // Create Battle Royale session on Nvidia GeForce (high performance)
  const session = await platform.createSession(
    GameType.BATTLE_ROYALE,
    players.map(p => p.id),
    {
      maxPlayers: 100,
      difficulty: 'normal',
      mode: 'solo',
      map: 'Apocalypse Island',
    },
    ProviderType.NVIDIA_GEFORCE
  );

  console.log(`Session ID: ${session.id}`);
  console.log(`Map: Apocalypse Island`);
  console.log(`Players: ${session.players.length}`);
  console.log(`Provider: ${session.provider}`);

  // Create the game instance
  const game = new BattleRoyaleGame();

  // Listen to game events
  game.on('game:event', (event) => {
    const eventMessages: Record<string, (data: any) => string> = {
      'battle_royale_started': (d) => `🎮 Battle Royale started! ${d.totalPlayers} players`,
      'drop_phase_started': () => '🪂 Drop phase! Players jumping from battle bus',
      'player_dropped': (d) => `📍 Player landed at (${Math.round(d.position.x)}, ${Math.round(d.position.y)})`,
      'loot_collected': (d) => `📦 Player looted: ${d.loot.name}`,
      'player_shot': () => `🔫 Player fired weapon`,
      'player_eliminated': (d) => `💀 Player eliminated! Placement: #${d.placement}. ${d.playersRemaining} remaining`,
      'zone_shrinking': (d) => `⚠️  STORM CLOSING! Radius: ${d.currentRadius}m → ${d.nextRadius}m`,
      'zone_shrunk': (d) => `🌀 Storm shrunk! New radius: ${d.newRadius}m`,
      'final_zone': (d) => `🔥 FINAL ZONE! ${d.playersAlive} players alive`,
    };

    const messageGenerator = eventMessages[event.type];
    if (messageGenerator) {
      console.log(messageGenerator(event.data));
    }
  });

  game.on('game:ended', (result) => {
    console.log();
    console.log('='.repeat(60));
    console.log('🏆 BATTLE ROYALE COMPLETE');
    console.log('='.repeat(60));
    console.log();

    if (result.winner) {
      const winner = platform.getPlayer(result.winner);
      console.log(`👑 VICTORY ROYALE!`);
      console.log(`Winner: ${winner?.username}`);
      console.log();
    }

    console.log('Final Placements:');
    const sortedPlayers = Object.entries(result.finalScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    sortedPlayers.forEach(([playerId, score], index) => {
      const player = platform.getPlayer(playerId);
      console.log(`  #${index + 1} ${player?.username} - ${score} points`);
    });

    console.log();
    console.log('Statistics:');
    console.log(`  Total Players: ${result.statistics.totalPlayers}`);
    console.log(`  Total Eliminations: ${result.statistics.totalEliminations}`);
    console.log(`  Match Duration: ${Math.round(result.duration / 1000)}s`);
  });

  // Initialize and start the game
  await game.initialize({
    maxPlayers: 100,
    difficulty: 'normal',
    mode: 'solo',
    map: 'Apocalypse Island',
  });

  // Add players to the game
  players.forEach(p => {
    const player = platform.getPlayer(p.id)!;
    game.addPlayer(player);
  });

  await game.start();

  console.log();
  console.log('⏱️  SIMULATING BATTLE ROYALE MATCH');
  console.log();

  // Simulate game progression
  await sleep(2000);

  // Simulate players dropping
  console.log('🪂 Players dropping from battle bus...');
  for (let i = 0; i < players.length; i++) {
    await game.processAction(players[i].id, {
      type: 'drop',
      data: {
        position: {
          x: Math.random() * 8000,
          y: Math.random() * 8000,
          z: 0,
        },
      },
      timestamp: new Date(),
    });

    if (i % 5 === 0) await sleep(500);
  }

  await sleep(1000);

  console.log();
  console.log('🔫 Combat phase beginning...');
  console.log();

  // Simulate looting
  for (let i = 0; i < 5; i++) {
    const player = players[Math.floor(Math.random() * players.length)];
    await game.processAction(player.id, {
      type: 'loot',
      data: { lootId: `loot-${Math.floor(Math.random() * 100)}` },
      timestamp: new Date(),
    });
    await sleep(300);
  }

  await sleep(1000);

  // Simulate combat and eliminations
  console.log('⚔️  Players engaging in combat...');
  console.log();

  for (let i = 0; i < 15; i++) {
    const attacker = players[Math.floor(Math.random() * players.length)];
    const target = players[Math.floor(Math.random() * players.length)];

    if (attacker.id !== target.id) {
      await game.processAction(attacker.id, {
        type: 'shoot',
        data: {
          targetId: target.id,
          weaponId: 'assault_rifle',
          damage: 30,
        },
        timestamp: new Date(),
      });

      await sleep(500);
    }
  }

  // Trigger game end
  await game.end();

  // End session
  await platform.endSession(session.id);

  console.log();
  console.log('='.repeat(60));
  console.log('🏆 UPDATED LEADERBOARD');
  console.log('='.repeat(60));
  console.log();

  const leaderboard = platform.getLeaderboard(GameType.BATTLE_ROYALE, 10);
  leaderboard.forEach(entry => {
    console.log(`  #${entry.rank} ${entry.username} - ${entry.score} points`);
  });

  console.log();
  console.log('='.repeat(60));
  console.log('✅ BATTLE ROYALE DEMO COMPLETE');
  console.log('='.repeat(60));

  await platform.shutdown();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

if (require.main === module) {
  battleRoyaleDemo().catch(error => {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  });
}

export { battleRoyaleDemo };
