/**
 * Game Platform Demo
 *
 * Demonstrates the key features of the game platform:
 * - Multi-provider architecture
 * - Multiple game types
 * - Player management
 * - Analytics and leaderboards
 */

import { GamePlatform } from '../src/core/game-platform';
import { GameType, ProviderType } from '../src/types/core.types';

async function runDemo() {
  console.log('='.repeat(60));
  console.log('🎮 GAME PLATFORM DEMO');
  console.log('='.repeat(60));
  console.log();

  // Initialize the platform
  const platform = new GamePlatform();
  await platform.initialize();

  console.log();
  console.log('='.repeat(60));
  console.log('👥 CREATING PLAYERS');
  console.log('='.repeat(60));
  console.log();

  // Create players
  const player1 = platform.createPlayer('ProGamer123');
  const player2 = platform.createPlayer('EliteSniper');
  const player3 = platform.createPlayer('StrategyMaster');
  const player4 = platform.createPlayer('SpeedRacer');

  console.log(`Created ${[player1, player2, player3, player4].length} players`);

  console.log();
  console.log('='.repeat(60));
  console.log('🎯 FPS GAME SESSION (Nvidia GeForce Provider)');
  console.log('='.repeat(60));
  console.log();

  // Create an FPS game session
  const fpsSession = await platform.createSession(
    GameType.FPS,
    [player1.id, player2.id],
    {
      maxPlayers: 10,
      difficulty: 'hard',
      mode: 'team-deathmatch',
      map: 'Urban Warfare',
      scoreLimit: 50,
    },
    ProviderType.NVIDIA_GEFORCE
  );

  console.log(`Session ID: ${fpsSession.id}`);
  console.log(`Game Type: ${fpsSession.gameType}`);
  console.log(`Provider: ${fpsSession.provider}`);
  console.log(`Players: ${fpsSession.players.length}`);

  // Simulate some game events
  platform.trackEvent(fpsSession.id, player1.id, 'player_kill', {
    victim: player2.id,
    weapon: 'sniper_rifle',
  });

  platform.trackEvent(fpsSession.id, player2.id, 'player_kill', {
    victim: player1.id,
    weapon: 'assault_rifle',
  });

  // Update scores
  fpsSession.state.score[player1.id] = 25;
  fpsSession.state.score[player2.id] = 30;

  // End the session
  await platform.endSession(fpsSession.id);

  console.log();
  console.log('='.repeat(60));
  console.log('🏰 STRATEGY GAME SESSION (Unity Cloud Provider)');
  console.log('='.repeat(60));
  console.log();

  // Create a strategy game session
  const strategySession = await platform.createSession(
    GameType.STRATEGY,
    [player3.id, player4.id],
    {
      maxPlayers: 8,
      difficulty: 'normal',
      mode: 'conquest',
      map: 'Verdant Valley',
    },
    ProviderType.UNITY_CLOUD
  );

  console.log(`Session ID: ${strategySession.id}`);
  console.log(`Game Type: ${strategySession.gameType}`);
  console.log(`Provider: ${strategySession.provider}`);

  // Simulate game events
  platform.trackEvent(strategySession.id, player3.id, 'building_constructed', {
    buildingType: 'barracks',
  });

  platform.trackEvent(strategySession.id, player4.id, 'unit_trained', {
    unitType: 'tank',
  });

  // Update scores
  strategySession.state.score[player3.id] = 150;
  strategySession.state.score[player4.id] = 120;

  await platform.endSession(strategySession.id);

  console.log();
  console.log('='.repeat(60));
  console.log('🏎️ RACING GAME SESSION (Unreal Cloud Provider)');
  console.log('='.repeat(60));
  console.log();

  // Create a racing game session
  const racingSession = await platform.createSession(
    GameType.RACING,
    [player1.id, player2.id, player3.id, player4.id],
    {
      maxPlayers: 12,
      difficulty: 'expert',
      mode: 'circuit',
      map: 'Neon City Circuit',
    },
    ProviderType.UNREAL_CLOUD
  );

  console.log(`Session ID: ${racingSession.id}`);
  console.log(`Game Type: ${racingSession.gameType}`);
  console.log(`Provider: ${racingSession.provider}`);
  console.log(`Players: ${racingSession.players.length}`);

  // Update scores (race positions)
  racingSession.state.score[player4.id] = 100; // 1st place
  racingSession.state.score[player1.id] = 90;  // 2nd place
  racingSession.state.score[player2.id] = 80;  // 3rd place
  racingSession.state.score[player3.id] = 70;  // 4th place

  await platform.endSession(racingSession.id);

  console.log();
  console.log('='.repeat(60));
  console.log('📊 PLATFORM STATISTICS');
  console.log('='.repeat(60));
  console.log();

  const stats = platform.getStatistics();
  console.log(`Total Players: ${stats.players.total}`);
  console.log(`Total Sessions: ${stats.sessions.totalSessions}`);
  console.log(`Completed Sessions: ${stats.sessions.completedSessions}`);
  console.log();

  console.log('Top Players:');
  stats.players.topPlayers.forEach((player, index) => {
    console.log(
      `  ${index + 1}. ${player.username} - Level ${player.level} (${player.stats.wins} wins)`
    );
  });

  console.log();
  console.log('='.repeat(60));
  console.log('🏆 LEADERBOARDS');
  console.log('='.repeat(60));
  console.log();

  // FPS Leaderboard
  console.log('FPS Leaderboard:');
  const fpsLeaderboard = platform.getLeaderboard(GameType.FPS, 5);
  fpsLeaderboard.forEach(entry => {
    console.log(`  ${entry.rank}. ${entry.username} - ${entry.score} points`);
  });

  console.log();
  console.log('Strategy Leaderboard:');
  const strategyLeaderboard = platform.getLeaderboard(GameType.STRATEGY, 5);
  strategyLeaderboard.forEach(entry => {
    console.log(`  ${entry.rank}. ${entry.username} - ${entry.score} points`);
  });

  console.log();
  console.log('Racing Leaderboard:');
  const racingLeaderboard = platform.getLeaderboard(GameType.RACING, 5);
  racingLeaderboard.forEach(entry => {
    console.log(`  ${entry.rank}. ${entry.username} - ${entry.score} points`);
  });

  console.log();
  console.log('Global Leaderboard:');
  const globalLeaderboard = platform.getGlobalLeaderboard(5);
  globalLeaderboard.forEach(entry => {
    console.log(`  ${entry.rank}. ${entry.username} - ${entry.score} total points`);
  });

  console.log();
  console.log('='.repeat(60));
  console.log('📈 ANALYTICS REPORT');
  console.log('='.repeat(60));
  console.log();

  const analyticsReport = platform.generateAnalyticsReport();
  console.log(`Total Events: ${analyticsReport.totalEvents}`);
  console.log(`Unique Players: ${analyticsReport.uniquePlayers}`);
  console.log();
  console.log('Events by Type:');
  Object.entries(analyticsReport.eventsByType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  console.log();
  console.log('='.repeat(60));
  console.log('🎮 PLAYER PROFILES');
  console.log('='.repeat(60));
  console.log();

  [player1, player2, player3, player4].forEach(p => {
    const player = platform.getPlayer(p.id)!;
    console.log(`${player.username}:`);
    console.log(`  Level: ${player.level}`);
    console.log(`  Games Played: ${player.stats.gamesPlayed}`);
    console.log(`  Wins: ${player.stats.wins}`);
    console.log(`  Losses: ${player.stats.losses}`);
    console.log(`  Win Rate: ${((player.stats.wins / player.stats.gamesPlayed) * 100).toFixed(1)}%`);
    console.log(`  Achievements: ${player.achievements.length}`);
    console.log();
  });

  console.log('='.repeat(60));
  console.log('✅ DEMO COMPLETE');
  console.log('='.repeat(60));
  console.log();

  // Shutdown
  await platform.shutdown();
}

// Run the demo
if (require.main === module) {
  runDemo().catch(error => {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  });
}

export { runDemo };
