import { BaseGame, PlayerAction, GameResult } from './base.game';
import { GameType, GameSettings } from '../types/core.types';

/**
 * Battle Royale Game
 * Inspired by Fortnite, PUBG, Apex Legends, Warzone
 */
export class BattleRoyaleGame extends BaseGame {
  private gameMap: BattleRoyaleMap | null = null;
  private playersAlive: Set<string>;
  private safeZone: SafeZone;
  private lootPool: Map<string, LootItem>;
  private playerLoadouts: Map<string, PlayerLoadout>;
  private eliminationOrder: string[];
  private shrinkTimer: number;

  constructor() {
    super(
      GameType.BATTLE_ROYALE,
      'Last Stand',
      '100-player battle royale - last one standing wins'
    );

    this.playersAlive = new Set();
    this.lootPool = new Map();
    this.playerLoadouts = new Map();
    this.eliminationOrder = [];
    this.shrinkTimer = 0;

    this.safeZone = {
      center: { x: 0, y: 0 },
      radius: 1000,
      nextRadius: 800,
      shrinkRate: 10,
    };
  }

  async initialize(settings: GameSettings): Promise<void> {
    this.settings = {
      ...settings,
      maxPlayers: settings.maxPlayers || 100,
      mode: settings.mode || 'solo',
      difficulty: settings.difficulty || 'normal',
    };

    this.gameMap = {
      name: settings.map || 'Apocalypse Island',
      size: { width: 8000, height: 8000 },
      dropZones: this.generateDropZones(10),
      lootSpawns: this.generateLootSpawns(500),
      landmarks: [
        'Tilted Towers',
        'Military Base',
        'Paradise Palms',
        'Retail Row',
        'Pleasant Park',
      ],
    };

    this.initializeLootPool();

    this.state.currentPhase = 'lobby';
    console.log(`🎮 Battle Royale initialized: ${this.gameMap.name}`);
  }

  async start(): Promise<void> {
    this.state.currentPhase = 'pre-game';

    // All players start in the battle bus
    for (const player of this.players.values()) {
      this.playersAlive.add(player.id);
      this.playerLoadouts.set(player.id, {
        playerId: player.id,
        weapons: [],
        armor: null,
        healing: [],
        materials: { wood: 0, stone: 0, metal: 0 },
        position: { x: 0, y: 0, z: 1000 }, // In the air
      });
    }

    this.state.metadata.startTime = Date.now();
    this.addEvent('battle_royale_started', undefined, {
      totalPlayers: this.players.size,
      mode: this.settings.mode,
    });

    // Start the match after countdown
    setTimeout(() => {
      this.state.currentPhase = 'dropping';
      this.addEvent('drop_phase_started', undefined, {});
    }, 5000);

    // First zone shrink
    setTimeout(() => {
      this.startZoneShrink();
    }, 30000);

    console.log('🪂 Battle Royale started! Drop from the battle bus!');
    this.emit('game:started');
  }

  async processAction(playerId: string, action: PlayerAction): Promise<void> {
    const player = this.players.get(playerId);
    if (!player || !this.playersAlive.has(playerId)) return;

    switch (action.type) {
      case 'drop':
        this.handleDrop(playerId, action.data);
        break;
      case 'move':
        this.handleMove(playerId, action.data);
        break;
      case 'shoot':
        this.handleShoot(playerId, action.data);
        break;
      case 'loot':
        this.handleLoot(playerId, action.data);
        break;
      case 'build':
        this.handleBuild(playerId, action.data);
        break;
      case 'heal':
        this.handleHeal(playerId, action.data);
        break;
      case 'revive':
        this.handleRevive(playerId, action.data);
        break;
    }
  }

  update(deltaTime: number): void {
    if (this.state.currentPhase === 'completed') return;

    // Update zone shrink
    if (this.state.currentPhase === 'active' || this.state.currentPhase === 'final_zone') {
      this.updateSafeZone(deltaTime);
    }

    // Damage players outside safe zone
    this.applyStormDamage();

    // Check win condition
    if (this.playersAlive.size === 1) {
      this.end();
    } else if (this.playersAlive.size === 0) {
      this.end();
    }
  }

  async end(): Promise<GameResult> {
    this.state.currentPhase = 'completed';

    const winner = this.playersAlive.size === 1 ? Array.from(this.playersAlive)[0] : undefined;

    // Calculate placement scores (Victory Royale!)
    const finalScores: Record<string, number> = {};
    let placement = this.players.size;

    // Winner gets max score
    if (winner) {
      finalScores[winner] = 1000;
      placement--;
    }

    // Others get score based on elimination order
    for (let i = this.eliminationOrder.length - 1; i >= 0; i--) {
      const playerId = this.eliminationOrder[i];
      finalScores[playerId] = Math.max(100, 1000 - (placement * 10));
      placement--;
    }

    const result: GameResult = {
      winner,
      finalScores,
      statistics: {
        totalPlayers: this.players.size,
        eliminationOrder: this.eliminationOrder,
        survivorCount: this.playersAlive.size,
        totalEliminations: this.calculateTotalEliminations(),
        averageSurvivalTime: this.calculateAverageSurvivalTime(),
      },
      duration: Date.now() - this.state.metadata.startTime,
    };

    if (winner) {
      const winnerPlayer = this.players.get(winner);
      console.log(`👑 VICTORY ROYALE! Winner: ${winnerPlayer?.username}`);
    }

    this.emit('game:ended', result);
    return result;
  }

  private handleDrop(playerId: string, data: any): void {
    const { position } = data;
    const loadout = this.playerLoadouts.get(playerId);

    if (loadout) {
      loadout.position = { ...position, z: 0 }; // Land on ground
      this.addEvent('player_dropped', playerId, { position });

      // Check if all players have dropped
      const allDropped = Array.from(this.playerLoadouts.values()).every(l => l.position.z === 0);
      if (allDropped && this.state.currentPhase === 'dropping') {
        this.state.currentPhase = 'active';
        this.addEvent('combat_phase_started', undefined, {});
      }
    }
  }

  private handleMove(playerId: string, data: any): void {
    const { position } = data;
    const loadout = this.playerLoadouts.get(playerId);

    if (loadout) {
      loadout.position = position;

      // Check if in safe zone
      const distance = this.calculateDistance(position, this.safeZone.center);
      if (distance > this.safeZone.radius) {
        this.addEvent('player_in_storm', playerId, { distance });
      }
    }
  }

  private handleShoot(playerId: string, data: any): void {
    const { targetId, weaponId, damage } = data;

    if (!this.playersAlive.has(targetId)) return;

    this.addEvent('player_shot', playerId, { targetId, weaponId });

    // Apply damage (simplified)
    if (Math.random() > 0.7) {
      this.eliminatePlayer(targetId, playerId);
    }
  }

  private handleLoot(playerId: string, data: any): void {
    const { lootId } = data;
    const loot = this.lootPool.get(lootId);
    const loadout = this.playerLoadouts.get(playerId);

    if (loot && loadout) {
      switch (loot.type) {
        case 'weapon':
          loadout.weapons.push(loot.name);
          break;
        case 'armor':
          loadout.armor = loot.name;
          break;
        case 'healing':
          loadout.healing.push(loot.name);
          break;
      }

      this.lootPool.delete(lootId);
      this.addEvent('loot_collected', playerId, { lootId, loot });
    }
  }

  private handleBuild(playerId: string, data: any): void {
    const { structureType, position } = data;
    const loadout = this.playerLoadouts.get(playerId);

    if (loadout) {
      const materialCost = 10;
      const material = structureType === 'wall' ? 'wood' : 'stone';

      if (loadout.materials[material] >= materialCost) {
        loadout.materials[material] -= materialCost;
        this.addEvent('structure_built', playerId, { structureType, position });
      }
    }
  }

  private handleHeal(playerId: string, data: any): void {
    const { itemId } = data;
    this.addEvent('player_healed', playerId, { itemId, amount: 50 });
  }

  private handleRevive(playerId: string, data: any): void {
    const { targetId } = data;
    this.addEvent('player_revived', playerId, { targetId });
  }

  private eliminatePlayer(playerId: string, eliminatorId?: string): void {
    if (!this.playersAlive.has(playerId)) return;

    this.playersAlive.delete(playerId);
    this.eliminationOrder.push(playerId);

    const placement = this.playersAlive.size + 1;

    this.addEvent('player_eliminated', eliminatorId, {
      victim: playerId,
      placement,
      playersRemaining: this.playersAlive.size,
    });

    // Award elimination to killer
    if (eliminatorId) {
      this.state.score[eliminatorId] = (this.state.score[eliminatorId] || 0) + 1;
    }

    console.log(`💀 Player eliminated. Placement: #${placement}. ${this.playersAlive.size} remaining`);

    // Check for final circles
    if (this.playersAlive.size <= 10 && this.state.currentPhase !== 'final_zone') {
      this.state.currentPhase = 'final_zone';
      this.addEvent('final_zone', undefined, { playersAlive: this.playersAlive.size });
    }
  }

  private startZoneShrink(): void {
    this.state.currentPhase = 'active';
    this.addEvent('zone_shrinking', undefined, {
      currentRadius: this.safeZone.radius,
      nextRadius: this.safeZone.nextRadius,
    });
  }

  private updateSafeZone(deltaTime: number): void {
    this.shrinkTimer += deltaTime;

    if (this.shrinkTimer >= 30000) { // Shrink every 30 seconds
      this.shrinkTimer = 0;

      if (this.safeZone.radius > this.safeZone.nextRadius) {
        this.safeZone.radius = Math.max(
          this.safeZone.nextRadius,
          this.safeZone.radius - this.safeZone.shrinkRate
        );

        if (this.safeZone.radius === this.safeZone.nextRadius) {
          // Start next shrink phase
          this.safeZone.nextRadius = Math.max(50, this.safeZone.nextRadius - 200);
          this.addEvent('zone_shrunk', undefined, {
            newRadius: this.safeZone.radius,
            nextRadius: this.safeZone.nextRadius,
          });
        }
      }
    }
  }

  private applyStormDamage(): void {
    for (const playerId of this.playersAlive) {
      const loadout = this.playerLoadouts.get(playerId);
      if (!loadout) continue;

      const distance = this.calculateDistance(loadout.position, this.safeZone.center);
      if (distance > this.safeZone.radius) {
        // Player is in storm - chance of elimination
        if (Math.random() > 0.95) {
          this.eliminatePlayer(playerId);
        }
      }
    }
  }

  private calculateDistance(pos1: { x: number; y: number }, pos2: { x: number; y: number }): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private initializeLootPool(): void {
    const weapons = ['Assault Rifle', 'Shotgun', 'Sniper', 'SMG', 'Rocket Launcher'];
    const armor = ['Shield Potion', 'Body Armor', 'Helmet'];

    for (let i = 0; i < 100; i++) {
      this.lootPool.set(`loot-${i}`, {
        id: `loot-${i}`,
        type: 'weapon',
        name: weapons[Math.floor(Math.random() * weapons.length)],
        rarity: this.randomRarity(),
      });
    }
  }

  private generateDropZones(count: number): DropZone[] {
    const zones: DropZone[] = [];
    for (let i = 0; i < count; i++) {
      zones.push({
        id: `zone-${i}`,
        position: {
          x: Math.random() * 8000,
          y: Math.random() * 8000,
        },
        name: `Zone ${i + 1}`,
      });
    }
    return zones;
  }

  private generateLootSpawns(count: number): Array<{ x: number; y: number }> {
    const spawns = [];
    for (let i = 0; i < count; i++) {
      spawns.push({
        x: Math.random() * 8000,
        y: Math.random() * 8000,
      });
    }
    return spawns;
  }

  private randomRarity(): 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' {
    const rand = Math.random();
    if (rand < 0.5) return 'common';
    if (rand < 0.75) return 'uncommon';
    if (rand < 0.9) return 'rare';
    if (rand < 0.97) return 'epic';
    return 'legendary';
  }

  private calculateTotalEliminations(): number {
    return Object.values(this.state.score).reduce((sum, score) => sum + score, 0);
  }

  private calculateAverageSurvivalTime(): number {
    const currentTime = Date.now();
    const startTime = this.state.metadata.startTime;
    return (currentTime - startTime) / this.players.size;
  }
}

interface BattleRoyaleMap {
  name: string;
  size: { width: number; height: number };
  dropZones: DropZone[];
  lootSpawns: Array<{ x: number; y: number }>;
  landmarks: string[];
}

interface DropZone {
  id: string;
  position: { x: number; y: number };
  name: string;
}

interface SafeZone {
  center: { x: number; y: number };
  radius: number;
  nextRadius: number;
  shrinkRate: number;
}

interface LootItem {
  id: string;
  type: 'weapon' | 'armor' | 'healing';
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
}

interface PlayerLoadout {
  playerId: string;
  weapons: string[];
  armor: string | null;
  healing: string[];
  materials: {
    wood: number;
    stone: number;
    metal: number;
  };
  position: { x: number; y: number; z: number };
}
