# Game Platform

Enterprise-grade game platform with cloud provider architecture, inspired by AWS, Azure, Google Cloud, and top game companies. Now with **full AWS GameLift parity** for game server fleet management!

## Features

### Core Platform
- **Multi-Provider Architecture**: Pluggable game engine providers (AWS-style, Azure-style, Google-style)
- **Multiple Game Types**: FPS, Strategy, Racing, RPG, Battle Royale, MOBA
- **Cloud-Ready**: Built for scalability and distributed gaming
- **Session Management**: Advanced player session and matchmaking
- **Analytics**: Real-time game analytics and leaderboards
- **Event-Driven**: Pub/sub architecture for game events

### AWS GameLift Parity
- **Fleet Management**: Complete game server fleet orchestration like AWS GameLift
- **FlexMatch Matchmaking**: Advanced rule-based matchmaking with team balancing
- **Game Server SDK**: Client library for game servers to integrate with fleet management
- **Session Placement**: Intelligent game session placement across fleets with latency optimization
- **Auto-Scaling**: Automatic fleet scaling based on capacity, utilization, and demand
- **Monitoring & Metrics**: CloudWatch-style metrics, alarms, and dashboards

### Social & Economy
- **Party System**: Group matchmaking and team formation
- **Friend System**: Friend requests, friend lists, and blocking
- **Chat System**: Multi-channel chat with moderation
- **Voice Chat**: Spatial audio, voice activity detection, multi-channel support
- **Virtual Economy**: Dual currency system with store and inventory
- **Tournaments**: Bracket-based tournaments with multiple formats

### LiveOps (PlayFab-style)
- **Title Data Management**: Server-side configuration and game constants
- **Player Data**: Per-player persistent data with permissions
- **Remote Config**: Dynamic configuration with segmentation
- **Feature Flags**: Gradual rollout, A/B testing, scheduled activation
- **Scheduled Events**: Time-based events with recurrence
- **News System**: Targeted announcements and notifications
- **Player Segmentation**: Dynamic player grouping based on behavior
- **A/B Testing**: Experiment framework with variant tracking
- **Cloud Scripts**: Server-side logic execution

### Player Engagement
- **Achievement System**: Steam-style achievements with progressive tracking
- **Leveling & XP**: Configurable XP curves with prestige system
- **Leaderboards**: Multiple leaderboard types with automatic ranking
- **Season Pass**: Battle pass system with free and premium tiers
- **Player Stats**: Comprehensive stat tracking and analytics

### Game Integrity
- **Anti-Cheat**: Multi-layered cheat detection (speed hacks, aimbots, memory editing)
- **Behavior Analysis**: Statistical anomaly detection
- **File Integrity**: Client file validation
- **Network Monitoring**: Packet manipulation detection
- **Ban System**: Temporary and permanent bans with appeals

### Content & Storage
- **Cloud Saves**: Cross-platform save synchronization with conflict resolution
- **Save Slots**: Multiple save slots with metadata
- **Auto-Backup**: Automatic save backups with retention policies
- **Quota Management**: Storage limits and usage tracking
- **Encryption**: End-to-end save encryption

### Replay & Spectator
- **Replay Recording**: Full game state recording with compression
- **Spectator Mode**: Live spectating with multiple camera modes
- **Highlight Detection**: Auto-generated highlights for key moments
- **Replay Analytics**: Heatmaps, player paths, timeline analysis
- **Playback Controls**: Speed control, seeking, filtering

### Enterprise Features
- **Docker Support**: Full containerization with orchestration
- **REST API**: Complete Express-based API
- **Cloud Integrations**: AWS, Azure, and GCP examples
- **CI/CD**: GitHub Actions workflow
- **Testing**: Jest test suite

## Architecture

The platform uses a provider pattern similar to cloud platforms:

```
GamePlatform
├── Providers (Game Engines)
│   ├── NvidiaGeForceProvider (High-performance GPU-accelerated)
│   ├── UnityCloudProvider (Unity-based games)
│   ├── UnrealCloudProvider (Unreal Engine games)
│   └── CustomProvider (Custom game engines)
├── Games
│   ├── FPS Games
│   ├── Strategy Games
│   ├── Racing Games
│   └── RPG Games
├── Session Management
├── Player Management
├── Analytics & Leaderboards
└── Cloud Integration
```

## Installation

```bash
npm install
npm run build
```

## Quick Start

### Basic Platform Usage

```typescript
import { GamePlatform } from '@game-platform/core';

const platform = new GamePlatform();
const session = await platform.createSession('fps-game', 'player-123');
```

### AWS GameLift Features

#### Fleet Management

```typescript
import { FleetManager } from '@game-platform/gamelift';

const fleetManager = new FleetManager();

// Create a fleet
const fleet = fleetManager.createFleet({
  name: 'production-fps-fleet',
  buildId: 'build-123',
  instanceType: 'c5.large',
  desiredInstances: 5,
  minInstances: 2,
  maxInstances: 20,
});

// Create game session
const session = await fleetManager.createGameSession({
  fleetId: fleet.id,
  maximumPlayerSessionCount: 10,
  name: 'FPS Match #1',
});
```

#### FlexMatch Matchmaking

```typescript
import { FlexMatch } from '@game-platform/gamelift';

const flexMatch = new FlexMatch();

// Create matchmaking configuration
const config = flexMatch.createMatchmakingConfiguration({
  name: 'competitive-5v5',
  ruleSetName: 'fps-rules',
  requestTimeoutSeconds: 120,
  acceptanceRequired: true,
});

// Start matchmaking
const ticket = flexMatch.startMatchmaking('competitive-5v5', [
  {
    playerId: 'player-1',
    attributes: [{ name: 'skill', value: 1500 }],
  },
]);
```

#### Auto-Scaling

```typescript
import { AutoScalingService } from '@game-platform/gamelift';

const autoScaling = new AutoScalingService();
autoScaling.start();

// Create target tracking policy
autoScaling.createTargetTrackingPolicy(
  'fleet-123',
  'maintain-50-percent-available',
  'PercentAvailableGameSessions',
  50
);
```

#### Monitoring

```typescript
import { MonitoringService, MetricUnit } from '@game-platform/gamelift';

const monitoring = new MonitoringService();
monitoring.start();

// Publish metrics
monitoring.putMetricData(
  'AWS/GameLift',
  'ActiveInstances',
  5,
  MetricUnit.Count,
  [{ name: 'FleetId', value: 'fleet-123' }]
);

// Create alarms
monitoring.putMetricAlarm({
  alarmName: 'HighCPU',
  metricName: 'CPUUtilization',
  threshold: 80,
  comparisonOperator: 'GreaterThanThreshold',
});
```

See `examples/gamelift-demo.ts` for a complete demo.

## Providers

### Nvidia GeForce Provider
High-performance GPU-accelerated game rendering with ray tracing support.

### Unity Cloud Provider
Cloud-based Unity engine for cross-platform games.

### Unreal Cloud Provider
Unreal Engine 5 powered games with advanced graphics.

## License

MIT
