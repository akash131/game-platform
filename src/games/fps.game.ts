import { BaseGame, PlayerAction, GameResult } from './base.game';
import { GameType, GameSettings } from '../types/core.types';

/**
 * First-Person Shooter Game
 * Inspired by Call of Duty, Battlefield, Counter-Strike
 */
export class FPSGame extends BaseGame {
  private weaponRegistry: Map<string, Weapon>;
  private mapData: FPSMap | null = null;
  private respawnQueue: string[] = [];

  constructor() {
    super(
      GameType.FPS,
      'Tactical Strike',
      'Fast-paced first-person shooter with tactical gameplay'
    );

    this.weaponRegistry = new Map([
      ['assault_rifle', { name: 'M4A1', damage: 30, fireRate: 600, range: 50 }],
      ['sniper_rifle', { name: 'AWP', damage: 100, fireRate: 40, range: 100 }],
      ['shotgun', { name: 'M870', damage: 80, fireRate: 90, range: 10 }],
      ['smg', { name: 'MP5', damage: 20, fireRate: 900, range: 30 }],
    ]);
  }

  async initialize(settings: GameSettings): Promise<void> {
    this.settings = {
      ...settings,
      maxPlayers: settings.maxPlayers || 10,
      mode: settings.mode || 'team-deathmatch',
      scoreLimit: settings.scoreLimit || 100,
    };

    this.mapData = {
      name: settings.map || 'Urban Warfare',
      spawnPoints: this.generateSpawnPoints(this.settings.maxPlayers),
      objectives: ['capture_flag', 'secure_zone'],
      size: { width: 1000, height: 1000 },
    };

    this.state.currentPhase = 'ready';
    console.log(`🎮 FPS Game initialized: ${this.mapData.name}`);
  }

  async start(): Promise<void> {
    this.state.currentPhase = 'active';
    this.addEvent('game_started', undefined, {
      mode: this.settings.mode,
      map: this.mapData?.name,
    });

    // Spawn all players
    for (const player of this.players.values()) {
      this.spawnPlayer(player.id);
    }

    console.log('🎯 FPS Game started!');
    this.emit('game:started');
  }

  async processAction(playerId: string, action: PlayerAction): Promise<void> {
    const player = this.players.get(playerId);
    if (!player) return;

    switch (action.type) {
      case 'shoot':
        this.handleShoot(playerId, action.data);
        break;
      case 'reload':
        this.handleReload(playerId);
        break;
      case 'move':
        this.handleMove(playerId, action.data);
        break;
      case 'switch_weapon':
        this.handleWeaponSwitch(playerId, action.data);
        break;
    }
  }

  update(deltaTime: number): void {
    // Process respawn queue
    if (this.respawnQueue.length > 0) {
      const playerId = this.respawnQueue.shift();
      if (playerId) {
        this.spawnPlayer(playerId);
      }
    }

    // Check win conditions
    this.checkWinCondition();
  }

  async end(): Promise<GameResult> {
    this.state.currentPhase = 'completed';

    const sortedScores = Object.entries(this.state.score).sort((a, b) => b[1] - a[1]);
    const winner = sortedScores[0]?.[0];

    const result: GameResult = {
      winner,
      finalScores: this.state.score,
      statistics: {
        totalKills: this.calculateTotalKills(),
        totalDeaths: this.calculateTotalDeaths(),
        accuracy: this.calculateAccuracy(),
      },
      duration: Date.now() - this.state.metadata.startTime,
    };

    console.log(`🏆 FPS Game ended. Winner: ${winner}`);
    this.emit('game:ended', result);

    return result;
  }

  private spawnPlayer(playerId: string): void {
    const spawnPoint = this.mapData?.spawnPoints[0] || { x: 0, y: 0, z: 0 };
    this.addEvent('player_spawned', playerId, {
      position: spawnPoint,
      loadout: ['assault_rifle', 'pistol'],
    });
  }

  private handleShoot(playerId: string, data: any): void {
    const { targetId, weaponId, hitPosition } = data;

    this.addEvent('player_shot', playerId, { weaponId, hitPosition });

    if (targetId && this.players.has(targetId)) {
      const weapon = this.weaponRegistry.get(weaponId);
      if (weapon && this.isHit(hitPosition)) {
        this.handleKill(playerId, targetId, weaponId);
      }
    }
  }

  private handleKill(killerId: string, victimId: string, weaponId: string): void {
    this.state.score[killerId] = (this.state.score[killerId] || 0) + 1;

    this.addEvent('player_killed', killerId, {
      victim: victimId,
      weapon: weaponId,
    });

    this.respawnQueue.push(victimId);
  }

  private handleReload(playerId: string): void {
    this.addEvent('player_reload', playerId, {});
  }

  private handleMove(playerId: string, data: any): void {
    const { position, velocity } = data;
    this.state.metadata[`player_${playerId}_position`] = position;
  }

  private handleWeaponSwitch(playerId: string, data: any): void {
    this.addEvent('weapon_switch', playerId, { weaponId: data.weaponId });
  }

  private isHit(hitPosition: any): boolean {
    return Math.random() > 0.3; // 70% hit rate simulation
  }

  private checkWinCondition(): void {
    if (this.settings.scoreLimit) {
      for (const [playerId, score] of Object.entries(this.state.score)) {
        if (score >= this.settings.scoreLimit) {
          this.end();
        }
      }
    }
  }

  private generateSpawnPoints(count: number): Array<{ x: number; y: number; z: number }> {
    const points = [];
    for (let i = 0; i < count; i++) {
      points.push({
        x: Math.random() * 1000,
        y: Math.random() * 1000,
        z: 0,
      });
    }
    return points;
  }

  private calculateTotalKills(): number {
    return Object.values(this.state.score).reduce((sum, score) => sum + score, 0);
  }

  private calculateTotalDeaths(): number {
    return this.state.events.filter(e => e.type === 'player_killed').length;
  }

  private calculateAccuracy(): number {
    const shots = this.state.events.filter(e => e.type === 'player_shot').length;
    const kills = this.calculateTotalKills();
    return shots > 0 ? (kills / shots) * 100 : 0;
  }
}

interface Weapon {
  name: string;
  damage: number;
  fireRate: number;
  range: number;
}

interface FPSMap {
  name: string;
  spawnPoints: Array<{ x: number; y: number; z: number }>;
  objectives: string[];
  size: { width: number; height: number };
}
