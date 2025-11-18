/**
 * AWS GameLift Feature Demo
 * Demonstrates fleet management, matchmaking, auto-scaling, and monitoring
 */

import {
  FleetManager,
  FlexMatch,
  GameServerSDK,
  SessionPlacementService,
  AutoScalingService,
  MonitoringService,
  GameLiftAlarms,
  MetricUnit,
} from '../src/index';

async function main() {
  console.log('=== AWS GameLift Features Demo ===\n');

  // 1. Fleet Management
  console.log('1. Creating Game Server Fleet...');
  const fleetManager = new FleetManager();

  const fleet = fleetManager.createFleet({
    name: 'production-fps-fleet',
    buildId: 'build-123',
    instanceType: 'c5.large',
    desiredInstances: 5,
    minInstances: 2,
    maxInstances: 20,
    runtimeConfiguration: {
      serverProcesses: [
        {
          launchPath: '/game/bin/server',
          parameters: '--mode=fps --map=dust2',
          concurrentExecutions: 2,
        },
      ],
      maxConcurrentGameSessionActivations: 10,
      gameSessionActivationTimeoutSeconds: 300,
    },
    resourceCreationLimitPolicy: {
      newGameSessionsPerCreator: 3,
      policyPeriodInMinutes: 15,
    },
  });

  console.log(`✓ Fleet created: ${fleet.id} (${fleet.status})`);

  // Activate fleet
  fleetManager.activateFleet(fleet.id);
  console.log(`✓ Fleet activated\n`);

  // 2. FlexMatch Matchmaking
  console.log('2. Setting up FlexMatch Matchmaking...');
  const flexMatch = new FlexMatch();

  // Create rule set
  const ruleSet = flexMatch.createMatchmakingRuleSet({
    ruleSetName: 'fps-competitive',
    ruleSetBody: {
      name: 'FPS Competitive Rules',
      ruleLanguageVersion: '1.0',
      playerAttributes: [
        { name: 'skill', type: 'number' },
        { name: 'team', type: 'string' },
      ],
      teams: [
        {
          name: 'red',
          minPlayers: 5,
          maxPlayers: 5,
        },
        {
          name: 'blue',
          minPlayers: 5,
          maxPlayers: 5,
        },
      ],
      rules: [
        {
          name: 'SkillBalance',
          type: 'distance',
          measurements: ['skill'],
          maxDistance: 100,
        },
        {
          name: 'LowLatency',
          type: 'latency',
          maxLatency: 100,
        },
      ],
    },
  });

  const matchConfig = flexMatch.createMatchmakingConfiguration({
    name: 'fps-competitive-5v5',
    description: '5v5 competitive FPS matchmaking',
    ruleSetName: ruleSet.ruleSetName,
    requestTimeoutSeconds: 120,
    acceptanceTimeoutSeconds: 30,
    acceptanceRequired: true,
    backfillMode: 'AUTOMATIC',
  });

  console.log(`✓ Matchmaking configuration created: ${matchConfig.name}\n`);

  // Start matchmaking for players
  const ticket = flexMatch.startMatchmaking('fps-competitive-5v5', [
    {
      playerId: 'player-1',
      attributes: [{ name: 'skill', value: 1500 }],
      latencyMap: [
        { regionName: 'us-east-1', latencyMs: 50 },
        { regionName: 'us-west-2', latencyMs: 120 },
      ],
    },
    {
      playerId: 'player-2',
      attributes: [{ name: 'skill', value: 1520 }],
      latencyMap: [
        { regionName: 'us-east-1', latencyMs: 45 },
        { regionName: 'us-west-2', latencyMs: 115 },
      ],
    },
  ]);

  console.log(`✓ Matchmaking ticket created: ${ticket.ticketId} (${ticket.status})\n`);

  // 3. Game Server SDK (would run on game server)
  console.log('3. Game Server SDK Example...');
  console.log('   (This would run on the actual game server process)');
  console.log(`
   const sdk = new GameServerSDK();
   await sdk.initSDK();
   await sdk.processReady({
     port: 7777,
     onStartGameSession: (session) => {
       console.log('Game session started:', session.gameSessionId);
       sdk.activateGameSession();
     },
     onProcessTerminate: () => {
       console.log('Process terminating...');
     },
     onHealthCheck: () => true,
   });
  `);

  // 4. Session Placement
  console.log('4. Setting up Session Placement...');
  const placementService = new SessionPlacementService();

  const queue = placementService.createGameSessionQueue('main-queue', {
    timeoutSeconds: 600,
    destinations: [
      {
        destinationArn: `arn:aws:gamelift:us-east-1:account:fleet/${fleet.id}`,
        fleetArn: `arn:aws:gamelift:us-east-1:account:fleet/${fleet.id}`,
        priority: 1,
      },
    ],
    playerLatencyPolicies: [
      { maximumIndividualPlayerLatencyMs: 100, policyDurationSeconds: 60 },
      { maximumIndividualPlayerLatencyMs: 200, policyDurationSeconds: 120 },
    ],
    priorityConfiguration: {
      priorityOrder: ['LATENCY', 'COST', 'DESTINATION'],
    },
  });

  console.log(`✓ Game session queue created: ${queue.name}`);

  const placement = await placementService.startGameSessionPlacement({
    gameSessionQueueName: 'main-queue',
    maximumPlayerSessionCount: 10,
    gameSessionName: 'FPS Match #123',
    playerLatencies: [
      { playerId: 'player-1', regionName: 'us-east-1', latencyMs: 50 },
      { playerId: 'player-2', regionName: 'us-east-1', latencyMs: 45 },
    ],
  });

  console.log(`✓ Game session placement started: ${placement.placementId} (${placement.status})\n`);

  // 5. Auto-Scaling
  console.log('5. Configuring Auto-Scaling...');
  const autoScaling = new AutoScalingService();
  autoScaling.start();

  // Update fleet capacity for auto-scaling
  autoScaling.updateFleetCapacity({
    fleetId: fleet.id,
    instanceType: 'c5.large',
    desiredInstances: 5,
    minInstances: 2,
    maxInstances: 20,
    activeInstances: 5,
    idleInstances: 2,
    terminatingInstances: 0,
    pendingInstances: 0,
  });

  // Create target tracking policy
  const scalingPolicy = autoScaling.createTargetTrackingPolicy(
    fleet.id,
    'target-50-percent-available',
    'PercentAvailableGameSessions',
    50,
    {
      scaleInCooldown: 300,
      scaleOutCooldown: 60,
      disableScaleIn: false,
    }
  );

  console.log(`✓ Auto-scaling policy created: ${scalingPolicy.policyName}`);
  console.log(`  Target: 50% available game sessions`);
  console.log(`  Scale out cooldown: 60s, Scale in cooldown: 300s\n`);

  // Create step scaling policy
  const stepPolicy = autoScaling.createStepScalingPolicy(
    fleet.id,
    'scale-on-high-utilization',
    'PercentIdleInstances',
    10, // threshold
    2, // add 2 instances
    'LessThanThreshold',
    {
      scalingAdjustmentType: 'ChangeInCapacity',
      cooldown: 180,
    }
  );

  console.log(`✓ Step scaling policy created: ${stepPolicy.policyName}`);
  console.log(`  Trigger: Idle instances < 10%`);
  console.log(`  Action: Add 2 instances\n`);

  // 6. Monitoring and Metrics
  console.log('6. Setting up Monitoring...');
  const monitoring = new MonitoringService();
  monitoring.start();

  // Publish metrics
  monitoring.putMetricData(
    'AWS/GameLift',
    MonitoringService.METRICS.ACTIVE_INSTANCES,
    5,
    MetricUnit.Count,
    [{ name: 'FleetId', value: fleet.id }]
  );

  monitoring.putMetricData(
    'AWS/GameLift',
    MonitoringService.METRICS.PERCENT_AVAILABLE_GAME_SESSIONS,
    75,
    MetricUnit.Percent,
    [{ name: 'FleetId', value: fleet.id }]
  );

  monitoring.putMetricData(
    'AWS/GameLift',
    MonitoringService.METRICS.CPU_UTILIZATION,
    65,
    MetricUnit.Percent,
    [{ name: 'FleetId', value: fleet.id }]
  );

  console.log('✓ Metrics published to monitoring service');

  // Create alarms
  const cpuAlarm = GameLiftAlarms.createHighCPUAlarm(monitoring, fleet.id, 80);
  const sessionAlarm = GameLiftAlarms.createLowAvailableSessionsAlarm(monitoring, fleet.id, 20);
  const healthAlarm = GameLiftAlarms.createUnhealthyServersAlarm(monitoring, fleet.id, 90);

  console.log(`✓ Alarms created:`);
  console.log(`  - ${cpuAlarm.alarmName} (CPU > 80%)`);
  console.log(`  - ${sessionAlarm.alarmName} (Available sessions < 20%)`);
  console.log(`  - ${healthAlarm.alarmName} (Healthy processes < 90%)\n`);

  // Create dashboard
  const dashboard = monitoring.createDashboard('fleet-overview', [
    {
      type: 'metric',
      title: 'Active Instances',
      metrics: [MonitoringService.METRICS.ACTIVE_INSTANCES],
    },
    {
      type: 'metric',
      title: 'Game Sessions',
      metrics: [
        MonitoringService.METRICS.ACTIVE_GAME_SESSIONS,
        MonitoringService.METRICS.AVAILABLE_GAME_SESSIONS,
      ],
    },
    {
      type: 'metric',
      title: 'Player Sessions',
      metrics: [MonitoringService.METRICS.CURRENT_PLAYER_SESSIONS],
    },
  ]);

  console.log(`✓ Dashboard created: ${dashboard.dashboardName}\n`);

  // 7. Statistics
  console.log('7. System Statistics...');

  const fleetUtilization = fleetManager.getFleetUtilization(fleet.id);
  console.log('Fleet Utilization:');
  console.log(`  Active servers: ${fleetUtilization.activeServerProcessCount}`);
  console.log(`  Active sessions: ${fleetUtilization.activeGameSessionCount}`);
  console.log(`  Current players: ${fleetUtilization.currentPlayerSessionCount}`);
  console.log(`  Available sessions: ${fleetUtilization.percentAvailableGameSessions}%`);
  console.log(`  Idle instances: ${fleetUtilization.percentIdleInstances}%\n`);

  const matchStats = flexMatch.getStatistics();
  console.log('Matchmaking Statistics:');
  console.log(`  Active tickets: ${matchStats.activeTickets}`);
  console.log(`  Searching: ${matchStats.searchingTickets}`);
  console.log(`  Completed matches: ${matchStats.completedMatches}`);
  console.log(`  Average wait time: ${matchStats.averageWaitTime}ms\n`);

  const placementStats = placementService.getStatistics();
  console.log('Placement Statistics:');
  console.log(`  Active placements: ${placementStats.activePlacements}`);
  console.log(`  Fulfilled: ${placementStats.fulfilledPlacements}`);
  console.log(`  Timed out: ${placementStats.timedOutPlacements}`);
  console.log(`  Average time: ${placementStats.averagePlacementTime}ms\n`);

  const scalingStats = autoScaling.getStatistics(fleet.id);
  console.log('Auto-Scaling Statistics:');
  console.log(`  Total scaling events: ${scalingStats.totalScalingEvents}`);
  console.log(`  Scale out events: ${scalingStats.scaleOutEvents}`);
  console.log(`  Scale in events: ${scalingStats.scaleInEvents}`);
  console.log(`  Average capacity change: ${scalingStats.averageCapacityChange}\n`);

  const metricsSummary = monitoring.getMetricsSummary();
  console.log('Monitoring Summary:');
  console.log(`  Total metrics: ${metricsSummary.totalMetrics}`);
  console.log(`  Total data points: ${metricsSummary.totalDataPoints}`);
  console.log(`  Namespaces: ${metricsSummary.namespaces.join(', ')}\n`);

  console.log('=== Demo Complete ===');
  console.log('\nAWS GameLift parity features implemented:');
  console.log('✓ Fleet Management (GameLift)');
  console.log('✓ Advanced Matchmaking (FlexMatch)');
  console.log('✓ Game Server SDK');
  console.log('✓ Session Placement');
  console.log('✓ Auto-Scaling');
  console.log('✓ Monitoring & Metrics (CloudWatch)');

  // Cleanup
  monitoring.stop();
  autoScaling.stop();
}

main().catch(console.error);
