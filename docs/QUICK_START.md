# Quick Start Guide

Get started with the Game Platform in 5 minutes!

## Installation

```bash
npm install
npm run build
```

## Basic Usage

### 1. Initialize the Platform

```typescript
import { GamePlatform } from '@game-platform/core';

const platform = new GamePlatform();
await platform.initialize();
```

### 2. Create Players

```typescript
const player1 = platform.createPlayer('Alice');
const player2 = platform.createPlayer('Bob');

console.log(`Created players: ${player1.username}, ${player2.username}`);
```

### 3. Start a Game Session

```typescript
import { GameType } from '@game-platform/core';

const session = await platform.createSession(
  GameType.FPS,
  [player1.id, player2.id],
  {
    maxPlayers: 10,
    difficulty: 'normal',
    mode: 'deathmatch',
    scoreLimit: 50,
  }
);

console.log(`Session started: ${session.id}`);
```

### 4. Track Game Events

```typescript
// Simulate player actions
platform.trackEvent(session.id, player1.id, 'kill', {
  victim: player2.id,
  weapon: 'assault_rifle',
});

// Update scores
session.state.score[player1.id] = 30;
session.state.score[player2.id] = 25;
```

### 5. End Session and View Results

```typescript
await platform.endSession(session.id);

// Check leaderboard
const leaderboard = platform.getLeaderboard(GameType.FPS);
console.log('Leaderboard:', leaderboard);

// Check player stats
const updatedPlayer = platform.getPlayer(player1.id);
console.log(`${updatedPlayer.username} - Level ${updatedPlayer.level}`);
```

## Run the Demo

```bash
npm run dev
```

This will run the complete demo showing all features.

## Game Types

Try different game types:

```typescript
// FPS Game
const fpsSession = await platform.createSession(GameType.FPS, playerIds, settings);

// Strategy Game
const strategySession = await platform.createSession(GameType.STRATEGY, playerIds, settings);

// Racing Game
const racingSession = await platform.createSession(GameType.RACING, playerIds, settings);

// RPG Game
const rpgSession = await platform.createSession(GameType.RPG, playerIds, settings);
```

## Provider Selection

Choose a specific provider:

```typescript
import { ProviderType } from '@game-platform/core';

// Use Nvidia GeForce (high performance)
const session = await platform.createSession(
  GameType.FPS,
  playerIds,
  settings,
  ProviderType.NVIDIA_GEFORCE
);

// Use Unity Cloud (cross-platform)
const session = await platform.createSession(
  GameType.STRATEGY,
  playerIds,
  settings,
  ProviderType.UNITY_CLOUD
);

// Use Unreal Cloud (high fidelity)
const session = await platform.createSession(
  GameType.RPG,
  playerIds,
  settings,
  ProviderType.UNREAL_CLOUD
);
```

## Listen to Events

```typescript
// Player events
platform.on('player:level:up', (data) => {
  console.log(`🎉 Player leveled up to ${data.newLevel}!`);
});

platform.on('player:achievement:unlocked', (data) => {
  console.log(`🏆 Achievement unlocked: ${data.achievement.name}`);
});

// Session events
platform.on('session:created', (session) => {
  console.log(`🎮 New session: ${session.id}`);
});

platform.on('session:ended', (session) => {
  console.log(`🏁 Session ended: ${session.id}`);
});
```

## Platform Statistics

```typescript
const stats = platform.getStatistics();

console.log(`Total Players: ${stats.players.total}`);
console.log(`Active Sessions: ${stats.sessions.activeSessions}`);
console.log(`Total Sessions: ${stats.sessions.totalSessions}`);

// Top players
stats.players.topPlayers.forEach((player, index) => {
  console.log(`${index + 1}. ${player.username} - Level ${player.level}`);
});
```

## Advanced: Custom Game Settings

```typescript
const advancedSession = await platform.createSession(
  GameType.FPS,
  playerIds,
  {
    maxPlayers: 100,
    difficulty: 'expert',
    mode: 'battle-royale',
    map: 'Apocalypse Island',
    scoreLimit: 1,
    timeLimit: 1800, // 30 minutes
    customRules: {
      respawnTime: 5,
      weaponDropRate: 'high',
      startingHealth: 100,
    },
  }
);
```

## Next Steps

- Read the [API Documentation](./API.md)
- Understand the [Architecture](./ARCHITECTURE.md)
- Explore the [examples](../examples/) directory
- Build your own game implementation!

## Clean Shutdown

Always shutdown the platform when done:

```typescript
await platform.shutdown();
```

## Full Example

```typescript
import { GamePlatform, GameType, ProviderType } from '@game-platform/core';

async function quickStart() {
  // Initialize
  const platform = new GamePlatform();
  await platform.initialize();

  // Create players
  const alice = platform.createPlayer('Alice');
  const bob = platform.createPlayer('Bob');

  // Create session
  const session = await platform.createSession(
    GameType.FPS,
    [alice.id, bob.id],
    {
      maxPlayers: 10,
      difficulty: 'hard',
      mode: 'deathmatch',
      scoreLimit: 50,
    },
    ProviderType.NVIDIA_GEFORCE
  );

  // Simulate gameplay
  session.state.score[alice.id] = 50;
  session.state.score[bob.id] = 30;

  // End session
  await platform.endSession(session.id);

  // View results
  const leaderboard = platform.getLeaderboard(GameType.FPS);
  console.log('Leaderboard:', leaderboard);

  // Shutdown
  await platform.shutdown();
}

quickStart();
```
