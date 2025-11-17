# API Documentation

## GamePlatform

The main entry point for the game platform.

### Constructor

```typescript
const platform = new GamePlatform();
```

### Methods

#### `initialize(): Promise<void>`

Initialize the platform with all providers.

```typescript
await platform.initialize();
```

#### `createPlayer(username: string): Player`

Create a new player account.

```typescript
const player = platform.createPlayer('ProGamer123');
```

#### `createSession(gameType: GameType, players: string[], settings: GameSettings, providerType?: ProviderType): Promise<GameSession>`

Create a new game session.

```typescript
const session = await platform.createSession(
  GameType.FPS,
  [player1.id, player2.id],
  {
    maxPlayers: 10,
    difficulty: 'hard',
    mode: 'team-deathmatch',
  }
);
```

#### `endSession(sessionId: string): Promise<void>`

End a game session and record results.

```typescript
await platform.endSession(session.id);
```

#### `getLeaderboard(gameType: GameType, limit?: number): LeaderboardEntry[]`

Get the leaderboard for a specific game type.

```typescript
const leaderboard = platform.getLeaderboard(GameType.FPS, 10);
```

#### `getGlobalLeaderboard(limit?: number): LeaderboardEntry[]`

Get the global leaderboard across all game types.

```typescript
const globalLeaderboard = platform.getGlobalLeaderboard(100);
```

#### `getStatistics(): PlatformStatistics`

Get platform-wide statistics.

```typescript
const stats = platform.getStatistics();
console.log(`Total Players: ${stats.players.total}`);
console.log(`Active Sessions: ${stats.sessions.activeSessions}`);
```

## Game Types

Available game types:

- `GameType.FPS` - First-Person Shooter
- `GameType.STRATEGY` - Real-Time Strategy
- `GameType.RACING` - Racing
- `GameType.RPG` - Role-Playing Game
- `GameType.MOBA` - Multiplayer Online Battle Arena
- `GameType.BATTLE_ROYALE` - Battle Royale

## Provider Types

Available providers:

- `ProviderType.NVIDIA_GEFORCE` - Nvidia GeForce NOW style (GPU-accelerated, ray tracing)
- `ProviderType.UNITY_CLOUD` - Unity Cloud Gaming (cross-platform)
- `ProviderType.UNREAL_CLOUD` - Unreal Engine Cloud (high-fidelity graphics)

## Events

The platform emits the following events:

### Platform Events

- `platform:initialized` - Platform has been initialized
- `platform:shutdown` - Platform has been shut down

### Session Events

- `session:created` - New session created
- `session:ended` - Session ended

### Player Events

- `player:created` - New player created
- `player:level:up` - Player leveled up
- `player:achievement:unlocked` - Achievement unlocked

### Analytics Events

- `leaderboard:updated` - Leaderboard updated

### Example

```typescript
platform.on('player:level:up', (data) => {
  console.log(`Player ${data.playerId} reached level ${data.newLevel}!`);
});

platform.on('player:achievement:unlocked', (data) => {
  console.log(`Achievement unlocked: ${data.achievement.name}`);
});
```

## Game Settings

```typescript
interface GameSettings {
  maxPlayers: number;
  difficulty: 'easy' | 'normal' | 'hard' | 'expert';
  mode: string;
  map?: string;
  timeLimit?: number;
  scoreLimit?: number;
  customRules?: Record<string, any>;
}
```

## Player

```typescript
interface Player {
  id: string;
  username: string;
  level: number;
  experience: number;
  stats: PlayerStats;
  inventory: InventoryItem[];
  achievements: Achievement[];
}
```

## Complete Example

```typescript
import { GamePlatform, GameType, ProviderType } from '@game-platform/core';

async function main() {
  // Initialize platform
  const platform = new GamePlatform();
  await platform.initialize();

  // Create players
  const player1 = platform.createPlayer('Alice');
  const player2 = platform.createPlayer('Bob');

  // Create a game session
  const session = await platform.createSession(
    GameType.FPS,
    [player1.id, player2.id],
    {
      maxPlayers: 10,
      difficulty: 'hard',
      mode: 'deathmatch',
      scoreLimit: 50,
    },
    ProviderType.NVIDIA_GEFORCE
  );

  // Simulate game events
  platform.trackEvent(session.id, player1.id, 'kill', {
    victim: player2.id,
  });

  // Update scores
  session.state.score[player1.id] = 30;
  session.state.score[player2.id] = 25;

  // End session
  await platform.endSession(session.id);

  // Check leaderboard
  const leaderboard = platform.getLeaderboard(GameType.FPS);
  console.log('Top Players:', leaderboard);

  // Shutdown
  await platform.shutdown();
}

main();
```
