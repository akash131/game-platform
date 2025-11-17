import { BaseGame, PlayerAction, GameResult } from './base.game';
import { GameType, GameSettings } from '../types/core.types';

/**
 * MOBA Game (Multiplayer Online Battle Arena)
 * Inspired by League of Legends, Dota 2, Heroes of the Storm
 */
export class MOBAGame extends BaseGame {
  private gameMap: MOBAMap | null = null;
  private teams: Map<string, Team>;
  private heroes: Map<string, Hero>;
  private towers: Map<string, Tower>;
  private minions: Map<string, Minion>;
  private gameTime: number;
  private minionSpawnTimer: number;

  constructor() {
    super(GameType.MOBA, 'Legends Arena', '5v5 MOBA - destroy the enemy base');

    this.teams = new Map();
    this.heroes = new Map();
    this.towers = new Map();
    this.minions = new Map();
    this.gameTime = 0;
    this.minionSpawnTimer = 0;
  }

  async initialize(settings: GameSettings): Promise<void> {
    this.settings = {
      ...settings,
      maxPlayers: settings.maxPlayers || 10,
      mode: settings.mode || '5v5',
      difficulty: settings.difficulty || 'normal',
    };

    this.gameMap = {
      name: settings.map || 'Summoner\'s Rift',
      lanes: ['top', 'mid', 'bot'],
      jungle: {
        camps: this.generateJungleCamps(),
        objectives: ['Dragon', 'Baron', 'Herald'],
      },
      bases: {
        blue: { x: 0, y: 0, health: 5000 },
        red: { x: 1000, y: 1000, health: 5000 },
      },
    };

    // Initialize teams
    this.teams.set('blue', {
      id: 'blue',
      name: 'Blue Team',
      players: [],
      kills: 0,
      towers: 0,
      gold: 0,
    });

    this.teams.set('red', {
      id: 'red',
      name: 'Red Team',
      players: [],
      kills: 0,
      towers: 0,
      gold: 0,
    });

    // Initialize towers
    this.initializeTowers();

    this.state.currentPhase = 'champion_select';
    console.log(`🎮 MOBA initialized: ${this.gameMap.name}`);
  }

  async start(): Promise<void> {
    this.state.currentPhase = 'pre-game';

    // Assign players to teams
    const playerIds = Array.from(this.players.keys());
    const blueTeam = this.teams.get('blue')!;
    const redTeam = this.teams.get('red')!;

    playerIds.forEach((playerId, index) => {
      const team = index < playerIds.length / 2 ? 'blue' : 'red';
      const teamObj = this.teams.get(team)!;
      teamObj.players.push(playerId);

      // Create hero for player
      this.heroes.set(playerId, {
        playerId,
        team,
        champion: this.selectRandomChampion(),
        level: 1,
        experience: 0,
        stats: {
          health: 600,
          maxHealth: 600,
          mana: 300,
          maxMana: 300,
          attack: 60,
          defense: 30,
          speed: 330,
        },
        abilities: ['Q', 'W', 'E', 'R'],
        items: [],
        gold: 500,
        kills: 0,
        deaths: 0,
        assists: 0,
        position: team === 'blue' ? { x: 0, y: 0 } : { x: 1000, y: 1000 },
      });
    });

    this.state.metadata.startTime = Date.now();
    this.addEvent('moba_started', undefined, {
      blueTeam: blueTeam.players.length,
      redTeam: redTeam.players.length,
    });

    // Start minion spawns
    setTimeout(() => {
      this.state.currentPhase = 'active';
      this.addEvent('minions_spawned', undefined, {});
    }, 90000); // 90 second countdown

    console.log('⚔️ MOBA started! Destroy the enemy Nexus!');
    this.emit('game:started');
  }

  async processAction(playerId: string, action: PlayerAction): Promise<void> {
    const player = this.players.get(playerId);
    if (!player) return;

    const hero = this.heroes.get(playerId);
    if (!hero || hero.stats.health <= 0) return;

    switch (action.type) {
      case 'move':
        this.handleMove(playerId, action.data);
        break;
      case 'attack':
        this.handleAttack(playerId, action.data);
        break;
      case 'use_ability':
        this.handleAbility(playerId, action.data);
        break;
      case 'buy_item':
        this.handleBuyItem(playerId, action.data);
        break;
      case 'attack_tower':
        this.handleAttackTower(playerId, action.data);
        break;
      case 'attack_nexus':
        this.handleAttackNexus(playerId, action.data);
        break;
    }
  }

  update(deltaTime: number): void {
    if (this.state.currentPhase !== 'active') return;

    this.gameTime += deltaTime;

    // Spawn minions every 30 seconds
    this.minionSpawnTimer += deltaTime;
    if (this.minionSpawnTimer >= 30000) {
      this.minionSpawnTimer = 0;
      this.spawnMinions();
    }

    // Regenerate health and mana
    for (const hero of this.heroes.values()) {
      if (hero.stats.health > 0) {
        hero.stats.health = Math.min(hero.stats.maxHealth, hero.stats.health + 5);
        hero.stats.mana = Math.min(hero.stats.maxMana, hero.stats.mana + 3);
      }
    }

    // Check win condition
    this.checkWinCondition();
  }

  async end(): Promise<GameResult> {
    this.state.currentPhase = 'completed';

    // Determine winning team
    const blueBase = this.gameMap!.bases.blue;
    const redBase = this.gameMap!.bases.red;

    let winningTeam: string | undefined;
    if (blueBase.health <= 0) winningTeam = 'red';
    if (redBase.health <= 0) winningTeam = 'blue';

    // Calculate scores
    const finalScores: Record<string, number> = {};
    for (const [playerId, hero] of this.heroes.entries()) {
      const kda = hero.kills * 3 + hero.assists - hero.deaths;
      const teamBonus = hero.team === winningTeam ? 100 : 0;
      finalScores[playerId] = Math.max(0, kda * 10 + teamBonus);
    }

    const result: GameResult = {
      winner: winningTeam,
      finalScores,
      statistics: {
        duration: this.gameTime,
        blueTeamKills: this.teams.get('blue')!.kills,
        redTeamKills: this.teams.get('red')!.kills,
        blueTeamTowers: this.teams.get('blue')!.towers,
        redTeamTowers: this.teams.get('red')!.towers,
        totalMinions: this.minions.size,
      },
      duration: Date.now() - this.state.metadata.startTime,
    };

    console.log(`🏆 VICTORY! ${winningTeam?.toUpperCase()} team wins!`);
    this.emit('game:ended', result);

    return result;
  }

  private handleMove(playerId: string, data: any): void {
    const { position } = data;
    const hero = this.heroes.get(playerId);

    if (hero) {
      hero.position = position;
      this.addEvent('hero_moved', playerId, { position });
    }
  }

  private handleAttack(playerId: string, data: any): void {
    const { targetId } = data;
    const attacker = this.heroes.get(playerId);
    const target = this.heroes.get(targetId);

    if (!attacker || !target) return;
    if (attacker.team === target.team) return; // Can't attack teammates

    const damage = Math.max(0, attacker.stats.attack - target.stats.defense);
    target.stats.health -= damage;

    this.addEvent('hero_attacked', playerId, { targetId, damage });

    if (target.stats.health <= 0) {
      this.handleKill(playerId, targetId);
    }
  }

  private handleAbility(playerId: string, data: any): void {
    const { abilityKey, targetId } = data;
    const hero = this.heroes.get(playerId);

    if (!hero || hero.stats.mana < 50) return;

    hero.stats.mana -= 50;

    this.addEvent('ability_used', playerId, { abilityKey, targetId });

    // Simplified ability damage
    if (targetId) {
      const target = this.heroes.get(targetId);
      if (target && target.team !== hero.team) {
        target.stats.health -= 100;
        if (target.stats.health <= 0) {
          this.handleKill(playerId, targetId);
        }
      }
    }
  }

  private handleBuyItem(playerId: string, data: any): void {
    const { itemId, cost } = data;
    const hero = this.heroes.get(playerId);

    if (!hero || hero.gold < cost) return;

    hero.gold -= cost;
    hero.items.push(itemId);

    // Buff stats based on item
    hero.stats.attack += 20;
    hero.stats.defense += 10;

    this.addEvent('item_purchased', playerId, { itemId, cost });
  }

  private handleAttackTower(playerId: string, data: any): void {
    const { towerId } = data;
    const tower = this.towers.get(towerId);
    const hero = this.heroes.get(playerId);

    if (!tower || !hero || tower.team === hero.team) return;

    tower.health -= hero.stats.attack;

    if (tower.health <= 0) {
      this.destroyTower(towerId, hero.team);
    }
  }

  private handleAttackNexus(playerId: string, data: any): void {
    const { team } = data;
    const hero = this.heroes.get(playerId);

    if (!hero || hero.team === team) return;

    const base = team === 'blue' ? this.gameMap!.bases.blue : this.gameMap!.bases.red;
    base.health -= hero.stats.attack;

    if (base.health <= 0) {
      this.end();
    }
  }

  private handleKill(killerId: string, victimId: string): void {
    const killer = this.heroes.get(killerId);
    const victim = this.heroes.get(victimId);

    if (!killer || !victim) return;

    killer.kills++;
    victim.deaths++;
    killer.gold += 300;
    killer.experience += 100;

    const killerTeam = this.teams.get(killer.team)!;
    killerTeam.kills++;

    this.addEvent('hero_killed', killerId, { victimId });

    // Check for level up
    if (killer.experience >= killer.level * 100) {
      this.levelUpHero(killerId);
    }

    // Respawn victim after delay
    setTimeout(() => {
      victim.stats.health = victim.stats.maxHealth;
      victim.stats.mana = victim.stats.maxMana;
      victim.position = victim.team === 'blue' ? { x: 0, y: 0 } : { x: 1000, y: 1000 };
      this.addEvent('hero_respawned', victimId, {});
    }, 15000);
  }

  private levelUpHero(playerId: string): void {
    const hero = this.heroes.get(playerId);
    if (!hero) return;

    hero.level++;
    hero.experience = 0;
    hero.stats.maxHealth += 100;
    hero.stats.health = hero.stats.maxHealth;
    hero.stats.maxMana += 50;
    hero.stats.mana = hero.stats.maxMana;
    hero.stats.attack += 5;
    hero.stats.defense += 3;

    this.addEvent('hero_level_up', playerId, { newLevel: hero.level });
  }

  private destroyTower(towerId: string, team: string): void {
    const tower = this.towers.get(towerId);
    if (!tower) return;

    this.towers.delete(towerId);

    const attackingTeam = this.teams.get(team)!;
    attackingTeam.towers++;
    attackingTeam.gold += 500;

    this.addEvent('tower_destroyed', undefined, { towerId, team });
  }

  private spawnMinions(): void {
    const lanes = ['top', 'mid', 'bot'];

    for (const lane of lanes) {
      for (let i = 0; i < 6; i++) {
        const team = i < 3 ? 'blue' : 'red';
        const minionId = `minion-${Date.now()}-${lane}-${i}`;

        this.minions.set(minionId, {
          id: minionId,
          team,
          lane,
          health: 100,
          attack: 10,
        });
      }
    }

    this.addEvent('minions_spawned', undefined, { count: lanes.length * 6 });
  }

  private initializeTowers(): void {
    const teams = ['blue', 'red'];
    const lanes = ['top', 'mid', 'bot'];

    teams.forEach(team => {
      lanes.forEach(lane => {
        for (let tier = 1; tier <= 3; tier++) {
          const towerId = `${team}-${lane}-t${tier}`;
          this.towers.set(towerId, {
            id: towerId,
            team,
            lane,
            tier,
            health: 1000 * tier,
            attack: 100,
          });
        }
      });
    });
  }

  private selectRandomChampion(): string {
    const champions = [
      'Warrior',
      'Mage',
      'Assassin',
      'Marksman',
      'Tank',
      'Support',
      'Fighter',
      'Mage',
    ];
    return champions[Math.floor(Math.random() * champions.length)];
  }

  private checkWinCondition(): void {
    const blueBase = this.gameMap!.bases.blue;
    const redBase = this.gameMap!.bases.red;

    if (blueBase.health <= 0 || redBase.health <= 0) {
      this.end();
    }
  }
}

interface MOBAMap {
  name: string;
  lanes: string[];
  jungle: {
    camps: JungleCamp[];
    objectives: string[];
  };
  bases: {
    blue: { x: number; y: number; health: number };
    red: { x: number; y: number; health: number };
  };
}

interface JungleCamp {
  id: string;
  position: { x: number; y: number };
  type: string;
  respawnTime: number;
}

interface Team {
  id: string;
  name: string;
  players: string[];
  kills: number;
  towers: number;
  gold: number;
}

interface Hero {
  playerId: string;
  team: string;
  champion: string;
  level: number;
  experience: number;
  stats: {
    health: number;
    maxHealth: number;
    mana: number;
    maxMana: number;
    attack: number;
    defense: number;
    speed: number;
  };
  abilities: string[];
  items: string[];
  gold: number;
  kills: number;
  deaths: number;
  assists: number;
  position: { x: number; y: number };
}

interface Tower {
  id: string;
  team: string;
  lane: string;
  tier: number;
  health: number;
  attack: number;
}

interface Minion {
  id: string;
  team: string;
  lane: string;
  health: number;
  attack: number;
}

function generateJungleCamps(): JungleCamp[] {
  return [
    { id: 'blue-buff', position: { x: 200, y: 200 }, type: 'buff', respawnTime: 300 },
    { id: 'red-buff', position: { x: 800, y: 800 }, type: 'buff', respawnTime: 300 },
  ];
}
