import { BaseGame, PlayerAction, GameResult } from './base.game';
import { GameType, GameSettings } from '../types/core.types';

/**
 * Real-Time Strategy Game
 * Inspired by StarCraft, Age of Empires, Command & Conquer
 */
export class StrategyGame extends BaseGame {
  private gameMap: StrategyMap | null = null;
  private playerBases: Map<string, PlayerBase>;
  private units: Map<string, Unit>;
  private resources: Map<string, number>;

  constructor() {
    super(
      GameType.STRATEGY,
      'Empire Clash',
      'Real-time strategy with base building and resource management'
    );

    this.playerBases = new Map();
    this.units = new Map();
    this.resources = new Map();
  }

  async initialize(settings: GameSettings): Promise<void> {
    this.settings = {
      ...settings,
      maxPlayers: settings.maxPlayers || 8,
      mode: settings.mode || 'conquest',
    };

    this.gameMap = {
      name: settings.map || 'Verdant Valley',
      size: { width: 2000, height: 2000 },
      resourceNodes: this.generateResourceNodes(20),
      startingLocations: this.generateStartingLocations(this.settings.maxPlayers),
    };

    this.state.currentPhase = 'ready';
    console.log(`🎮 Strategy Game initialized: ${this.gameMap.name}`);
  }

  async start(): Promise<void> {
    this.state.currentPhase = 'active';

    // Initialize player bases
    let locationIndex = 0;
    for (const player of this.players.values()) {
      const location = this.gameMap!.startingLocations[locationIndex++];
      this.playerBases.set(player.id, {
        playerId: player.id,
        position: location,
        buildings: [{ type: 'command_center', level: 1, health: 1000 }],
        army: [],
      });

      this.resources.set(player.id, 1000); // Starting resources
    }

    this.addEvent('game_started', undefined, { mode: this.settings.mode });
    console.log('🏰 Strategy Game started!');
    this.emit('game:started');
  }

  async processAction(playerId: string, action: PlayerAction): Promise<void> {
    const player = this.players.get(playerId);
    if (!player) return;

    switch (action.type) {
      case 'build':
        this.handleBuild(playerId, action.data);
        break;
      case 'train_unit':
        this.handleTrainUnit(playerId, action.data);
        break;
      case 'attack':
        this.handleAttack(playerId, action.data);
        break;
      case 'gather':
        this.handleGatherResources(playerId, action.data);
        break;
      case 'research':
        this.handleResearch(playerId, action.data);
        break;
    }
  }

  update(deltaTime: number): void {
    // Process resource gathering
    for (const [playerId, base] of this.playerBases.entries()) {
      const workers = base.army.filter(u => u.type === 'worker').length;
      const resourceGain = workers * 2 * (deltaTime / 1000);
      this.resources.set(playerId, (this.resources.get(playerId) || 0) + resourceGain);
    }

    // Check win condition
    this.checkWinCondition();
  }

  async end(): Promise<GameResult> {
    this.state.currentPhase = 'completed';

    // Determine winner by most buildings/units
    const sortedScores = Object.entries(this.state.score).sort((a, b) => b[1] - a[1]);
    const winner = sortedScores[0]?.[0];

    const result: GameResult = {
      winner,
      finalScores: this.state.score,
      statistics: {
        totalUnitsCreated: this.calculateTotalUnits(),
        totalBuildingsConstructed: this.calculateTotalBuildings(),
        resourcesGathered: this.calculateTotalResources(),
      },
      duration: Date.now() - this.state.metadata.startTime,
    };

    console.log(`🏆 Strategy Game ended. Winner: ${winner}`);
    this.emit('game:ended', result);

    return result;
  }

  private handleBuild(playerId: string, data: any): void {
    const { buildingType, position } = data;
    const cost = this.getBuildingCost(buildingType);
    const playerResources = this.resources.get(playerId) || 0;

    if (playerResources >= cost) {
      this.resources.set(playerId, playerResources - cost);

      const base = this.playerBases.get(playerId);
      if (base) {
        base.buildings.push({ type: buildingType, level: 1, health: 500 });
      }

      this.state.score[playerId] = (this.state.score[playerId] || 0) + 10;
      this.addEvent('building_constructed', playerId, { buildingType, position });
    }
  }

  private handleTrainUnit(playerId: string, data: any): void {
    const { unitType } = data;
    const cost = this.getUnitCost(unitType);
    const playerResources = this.resources.get(playerId) || 0;

    if (playerResources >= cost) {
      this.resources.set(playerId, playerResources - cost);

      const base = this.playerBases.get(playerId);
      if (base) {
        const unit: Unit = {
          id: `unit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: unitType,
          playerId,
          health: 100,
          attack: this.getUnitAttack(unitType),
        };

        base.army.push(unit);
        this.units.set(unit.id, unit);
      }

      this.state.score[playerId] = (this.state.score[playerId] || 0) + 5;
      this.addEvent('unit_trained', playerId, { unitType });
    }
  }

  private handleAttack(playerId: string, data: any): void {
    const { unitId, targetId } = data;
    const unit = this.units.get(unitId);

    if (unit && unit.playerId === playerId) {
      this.addEvent('unit_attack', playerId, { unitId, targetId });
      this.state.score[playerId] = (this.state.score[playerId] || 0) + 1;
    }
  }

  private handleGatherResources(playerId: string, data: any): void {
    const { unitId, resourceNodeId } = data;
    this.addEvent('resource_gather', playerId, { unitId, resourceNodeId });
  }

  private handleResearch(playerId: string, data: any): void {
    const { technology } = data;
    const cost = 500;
    const playerResources = this.resources.get(playerId) || 0;

    if (playerResources >= cost) {
      this.resources.set(playerId, playerResources - cost);
      this.addEvent('research_completed', playerId, { technology });
      this.state.score[playerId] = (this.state.score[playerId] || 0) + 20;
    }
  }

  private checkWinCondition(): void {
    const activePlayers = Array.from(this.playerBases.values()).filter(
      base => base.buildings.length > 0
    );

    if (activePlayers.length === 1) {
      this.end();
    }
  }

  private getBuildingCost(buildingType: string): number {
    const costs: Record<string, number> = {
      barracks: 200,
      factory: 300,
      defense_tower: 150,
      resource_depot: 100,
    };
    return costs[buildingType] || 100;
  }

  private getUnitCost(unitType: string): number {
    const costs: Record<string, number> = {
      worker: 50,
      soldier: 100,
      tank: 300,
      aircraft: 500,
    };
    return costs[unitType] || 50;
  }

  private getUnitAttack(unitType: string): number {
    const attacks: Record<string, number> = {
      worker: 5,
      soldier: 20,
      tank: 50,
      aircraft: 40,
    };
    return attacks[unitType] || 10;
  }

  private generateResourceNodes(count: number): ResourceNode[] {
    const nodes: ResourceNode[] = [];
    for (let i = 0; i < count; i++) {
      nodes.push({
        id: `resource-${i}`,
        position: { x: Math.random() * 2000, y: Math.random() * 2000 },
        amount: 5000,
        type: i % 2 === 0 ? 'minerals' : 'gas',
      });
    }
    return nodes;
  }

  private generateStartingLocations(count: number): Array<{ x: number; y: number }> {
    const locations = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      locations.push({
        x: 1000 + Math.cos(angle) * 800,
        y: 1000 + Math.sin(angle) * 800,
      });
    }
    return locations;
  }

  private calculateTotalUnits(): number {
    return this.units.size;
  }

  private calculateTotalBuildings(): number {
    let total = 0;
    for (const base of this.playerBases.values()) {
      total += base.buildings.length;
    }
    return total;
  }

  private calculateTotalResources(): number {
    let total = 0;
    for (const amount of this.resources.values()) {
      total += amount;
    }
    return total;
  }
}

interface StrategyMap {
  name: string;
  size: { width: number; height: number };
  resourceNodes: ResourceNode[];
  startingLocations: Array<{ x: number; y: number }>;
}

interface ResourceNode {
  id: string;
  position: { x: number; y: number };
  amount: number;
  type: 'minerals' | 'gas';
}

interface PlayerBase {
  playerId: string;
  position: { x: number; y: number };
  buildings: Building[];
  army: Unit[];
}

interface Building {
  type: string;
  level: number;
  health: number;
}

interface Unit {
  id: string;
  type: string;
  playerId: string;
  health: number;
  attack: number;
}
