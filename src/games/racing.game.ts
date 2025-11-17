import { BaseGame, PlayerAction, GameResult } from './base.game';
import { GameType, GameSettings } from '../types/core.types';

/**
 * Racing Game
 * Inspired by Forza, Gran Turismo, Need for Speed
 */
export class RacingGame extends BaseGame {
  private track: RaceTrack | null = null;
  private vehicles: Map<string, Vehicle>;
  private checkpoints: Map<string, number>;
  private lapTimes: Map<string, number[]>;

  constructor() {
    super(GameType.RACING, 'Velocity Legends', 'High-speed racing with realistic physics');

    this.vehicles = new Map();
    this.checkpoints = new Map();
    this.lapTimes = new Map();
  }

  async initialize(settings: GameSettings): Promise<void> {
    this.settings = {
      ...settings,
      maxPlayers: settings.maxPlayers || 12,
      mode: settings.mode || 'circuit',
    };

    this.track = {
      name: settings.map || 'Neon City Circuit',
      length: 5000,
      laps: 3,
      checkpoints: this.generateCheckpoints(10),
      weather: 'clear',
      timeOfDay: 'day',
    };

    this.state.currentPhase = 'ready';
    console.log(`🎮 Racing Game initialized: ${this.track.name}`);
  }

  async start(): Promise<void> {
    this.state.currentPhase = 'countdown';

    // Initialize vehicles for all players
    for (const player of this.players.values()) {
      this.vehicles.set(player.id, {
        playerId: player.id,
        model: 'Supercar GT',
        position: { x: 0, y: 0, z: 0 },
        velocity: 0,
        currentLap: 0,
        currentCheckpoint: 0,
        finished: false,
      });

      this.checkpoints.set(player.id, 0);
      this.lapTimes.set(player.id, []);
    }

    // Countdown
    await this.countdown();

    this.state.currentPhase = 'racing';
    this.addEvent('race_started', undefined, { track: this.track!.name });
    console.log('🏎️ Race started!');
    this.emit('game:started');
  }

  async processAction(playerId: string, action: PlayerAction): Promise<void> {
    const player = this.players.get(playerId);
    if (!player) return;

    switch (action.type) {
      case 'accelerate':
        this.handleAccelerate(playerId, action.data);
        break;
      case 'brake':
        this.handleBrake(playerId, action.data);
        break;
      case 'steer':
        this.handleSteer(playerId, action.data);
        break;
      case 'boost':
        this.handleBoost(playerId);
        break;
      case 'checkpoint':
        this.handleCheckpoint(playerId, action.data);
        break;
    }
  }

  update(deltaTime: number): void {
    // Update vehicle physics
    for (const [playerId, vehicle] of this.vehicles.entries()) {
      if (!vehicle.finished) {
        // Simulate forward movement
        vehicle.position.x += vehicle.velocity * (deltaTime / 1000);

        // Check for checkpoint collision
        this.checkCheckpointCollision(playerId, vehicle);
      }
    }

    // Check if all players finished
    const allFinished = Array.from(this.vehicles.values()).every(v => v.finished);
    if (allFinished && this.state.currentPhase === 'racing') {
      this.end();
    }
  }

  async end(): Promise<GameResult> {
    this.state.currentPhase = 'completed';

    // Determine winner by finish order
    const sortedScores = Object.entries(this.state.score).sort((a, b) => b[1] - a[1]);
    const winner = sortedScores[0]?.[0];

    const result: GameResult = {
      winner,
      finalScores: this.state.score,
      statistics: {
        fastestLap: this.calculateFastestLap(),
        averageSpeed: this.calculateAverageSpeed(),
        finishOrder: this.getFinishOrder(),
      },
      duration: Date.now() - this.state.metadata.startTime,
    };

    console.log(`🏆 Race ended. Winner: ${winner}`);
    this.emit('game:ended', result);

    return result;
  }

  private async countdown(): Promise<void> {
    return new Promise(resolve => {
      let count = 3;
      const interval = setInterval(() => {
        this.addEvent('countdown', undefined, { count });
        count--;
        if (count === 0) {
          clearInterval(interval);
          resolve();
        }
      }, 1000);
    });
  }

  private handleAccelerate(playerId: string, data: any): void {
    const vehicle = this.vehicles.get(playerId);
    if (vehicle) {
      vehicle.velocity = Math.min(vehicle.velocity + 10, 300); // Max speed 300
      this.addEvent('vehicle_accelerate', playerId, { velocity: vehicle.velocity });
    }
  }

  private handleBrake(playerId: string, data: any): void {
    const vehicle = this.vehicles.get(playerId);
    if (vehicle) {
      vehicle.velocity = Math.max(vehicle.velocity - 20, 0);
      this.addEvent('vehicle_brake', playerId, { velocity: vehicle.velocity });
    }
  }

  private handleSteer(playerId: string, data: any): void {
    const { direction, angle } = data;
    this.addEvent('vehicle_steer', playerId, { direction, angle });
  }

  private handleBoost(playerId: string): void {
    const vehicle = this.vehicles.get(playerId);
    if (vehicle) {
      vehicle.velocity += 50;
      this.addEvent('boost_activated', playerId, {});
    }
  }

  private handleCheckpoint(playerId: string, data: any): void {
    const { checkpointId } = data;
    const vehicle = this.vehicles.get(playerId);

    if (vehicle) {
      vehicle.currentCheckpoint++;

      // Check if lap completed
      if (vehicle.currentCheckpoint >= this.track!.checkpoints.length) {
        vehicle.currentLap++;
        vehicle.currentCheckpoint = 0;

        const lapTime = Date.now() - this.state.metadata.lapStartTime;
        this.lapTimes.get(playerId)?.push(lapTime);

        this.addEvent('lap_completed', playerId, {
          lap: vehicle.currentLap,
          lapTime,
        });

        // Check if race finished
        if (vehicle.currentLap >= this.track!.laps) {
          this.handleFinish(playerId);
        }
      }
    }
  }

  private checkCheckpointCollision(playerId: string, vehicle: Vehicle): void {
    // Simplified checkpoint detection
    const nextCheckpoint = this.track!.checkpoints[vehicle.currentCheckpoint];
    if (nextCheckpoint && Math.abs(vehicle.position.x - nextCheckpoint.position) < 10) {
      this.handleCheckpoint(playerId, { checkpointId: vehicle.currentCheckpoint });
    }
  }

  private handleFinish(playerId: string): void {
    const vehicle = this.vehicles.get(playerId);
    if (vehicle) {
      vehicle.finished = true;

      const finishPosition = Array.from(this.vehicles.values()).filter(v => v.finished).length;
      const points = Math.max(100 - finishPosition * 10, 0);

      this.state.score[playerId] = points;
      this.addEvent('race_finished', playerId, { position: finishPosition, points });
    }
  }

  private generateCheckpoints(count: number): Checkpoint[] {
    const checkpoints: Checkpoint[] = [];
    const trackLength = 5000;

    for (let i = 0; i < count; i++) {
      checkpoints.push({
        id: `checkpoint-${i}`,
        position: (trackLength / count) * i,
        number: i + 1,
      });
    }

    return checkpoints;
  }

  private calculateFastestLap(): number {
    let fastest = Infinity;
    for (const times of this.lapTimes.values()) {
      for (const time of times) {
        if (time < fastest) fastest = time;
      }
    }
    return fastest === Infinity ? 0 : fastest;
  }

  private calculateAverageSpeed(): number {
    let totalSpeed = 0;
    for (const vehicle of this.vehicles.values()) {
      totalSpeed += vehicle.velocity;
    }
    return totalSpeed / this.vehicles.size;
  }

  private getFinishOrder(): string[] {
    return Array.from(this.vehicles.entries())
      .filter(([_, v]) => v.finished)
      .sort((a, b) => this.state.score[b[0]] - this.state.score[a[0]])
      .map(([playerId]) => playerId);
  }
}

interface RaceTrack {
  name: string;
  length: number;
  laps: number;
  checkpoints: Checkpoint[];
  weather: string;
  timeOfDay: string;
}

interface Checkpoint {
  id: string;
  position: number;
  number: number;
}

interface Vehicle {
  playerId: string;
  model: string;
  position: { x: number; y: number; z: number };
  velocity: number;
  currentLap: number;
  currentCheckpoint: number;
  finished: boolean;
}
