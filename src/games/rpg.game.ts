import { BaseGame, PlayerAction, GameResult } from './base.game';
import { GameType, GameSettings } from '../types/core.types';

/**
 * Role-Playing Game (RPG)
 * Inspired by World of Warcraft, Final Fantasy, The Witcher
 */
export class RPGGame extends BaseGame {
  private world: GameWorld | null = null;
  private characters: Map<string, RPGCharacter>;
  private quests: Map<string, Quest>;
  private combat: CombatSystem;

  constructor() {
    super(
      GameType.RPG,
      'Legends of Aetheria',
      'Epic role-playing adventure with quests, combat, and character progression'
    );

    this.characters = new Map();
    this.quests = new Map();
    this.combat = new CombatSystem();
  }

  async initialize(settings: GameSettings): Promise<void> {
    this.settings = {
      ...settings,
      maxPlayers: settings.maxPlayers || 4,
      mode: settings.mode || 'cooperative',
      difficulty: settings.difficulty || 'normal',
    };

    this.world = {
      name: settings.map || 'Kingdom of Aetheria',
      regions: this.generateRegions(),
      dungeons: ['Shadow Crypt', 'Crystal Caverns', 'Dragon Lair'],
      level: 1,
    };

    this.initializeQuests();

    this.state.currentPhase = 'ready';
    console.log(`🎮 RPG Game initialized: ${this.world.name}`);
  }

  async start(): Promise<void> {
    this.state.currentPhase = 'active';

    // Create characters for all players
    for (const player of this.players.values()) {
      this.characters.set(player.id, {
        playerId: player.id,
        class: 'Warrior',
        level: 1,
        experience: 0,
        stats: {
          health: 100,
          mana: 50,
          strength: 10,
          agility: 8,
          intelligence: 6,
        },
        equipment: {
          weapon: 'Iron Sword',
          armor: 'Leather Armor',
          accessory: null,
        },
        inventory: [],
        activeQuests: [],
      });
    }

    this.addEvent('adventure_started', undefined, { world: this.world!.name });
    console.log('⚔️ RPG Adventure started!');
    this.emit('game:started');
  }

  async processAction(playerId: string, action: PlayerAction): Promise<void> {
    const player = this.players.get(playerId);
    if (!player) return;

    switch (action.type) {
      case 'attack':
        await this.handleAttack(playerId, action.data);
        break;
      case 'cast_spell':
        await this.handleCastSpell(playerId, action.data);
        break;
      case 'use_item':
        this.handleUseItem(playerId, action.data);
        break;
      case 'accept_quest':
        this.handleAcceptQuest(playerId, action.data);
        break;
      case 'complete_quest':
        this.handleCompleteQuest(playerId, action.data);
        break;
      case 'equip_item':
        this.handleEquipItem(playerId, action.data);
        break;
    }
  }

  update(deltaTime: number): void {
    // Regenerate health and mana
    for (const character of this.characters.values()) {
      if (character.stats.health < 100) {
        character.stats.health = Math.min(100, character.stats.health + 1);
      }
      if (character.stats.mana < 50) {
        character.stats.mana = Math.min(50, character.stats.mana + 2);
      }
    }

    // Check win condition (all quests completed)
    this.checkWinCondition();
  }

  async end(): Promise<GameResult> {
    this.state.currentPhase = 'completed';

    // Calculate scores based on level and quest completion
    for (const [playerId, character] of this.characters.entries()) {
      this.state.score[playerId] =
        character.level * 100 + character.activeQuests.filter(q => q.completed).length * 50;
    }

    const sortedScores = Object.entries(this.state.score).sort((a, b) => b[1] - a[1]);
    const winner = sortedScores[0]?.[0];

    const result: GameResult = {
      winner,
      finalScores: this.state.score,
      statistics: {
        questsCompleted: this.calculateCompletedQuests(),
        totalExperience: this.calculateTotalExperience(),
        highestLevel: this.calculateHighestLevel(),
      },
      duration: Date.now() - this.state.metadata.startTime,
    };

    console.log(`🏆 RPG Adventure ended. Champion: ${winner}`);
    this.emit('game:ended', result);

    return result;
  }

  private async handleAttack(playerId: string, data: any): Promise<void> {
    const { targetId } = data;
    const character = this.characters.get(playerId);

    if (character) {
      const damage = this.combat.calculateDamage(character);
      this.addEvent('player_attack', playerId, { targetId, damage });

      // Award experience
      this.awardExperience(playerId, 10);
    }
  }

  private async handleCastSpell(playerId: string, data: any): Promise<void> {
    const { spellId, targetId } = data;
    const character = this.characters.get(playerId);

    if (character && character.stats.mana >= 10) {
      character.stats.mana -= 10;

      const spellPower = character.stats.intelligence * 2;
      this.addEvent('spell_cast', playerId, { spellId, targetId, power: spellPower });

      this.awardExperience(playerId, 15);
    }
  }

  private handleUseItem(playerId: string, data: any): void {
    const { itemId } = data;
    const character = this.characters.get(playerId);

    if (character) {
      // Simulate item effect (health potion)
      character.stats.health = Math.min(100, character.stats.health + 50);
      this.addEvent('item_used', playerId, { itemId });
    }
  }

  private handleAcceptQuest(playerId: string, data: any): void {
    const { questId } = data;
    const quest = this.quests.get(questId);
    const character = this.characters.get(playerId);

    if (quest && character) {
      character.activeQuests.push({
        questId,
        progress: 0,
        completed: false,
      });

      this.addEvent('quest_accepted', playerId, { questId, questName: quest.name });
    }
  }

  private handleCompleteQuest(playerId: string, data: any): void {
    const { questId } = data;
    const quest = this.quests.get(questId);
    const character = this.characters.get(playerId);

    if (quest && character) {
      const activeQuest = character.activeQuests.find(q => q.questId === questId);
      if (activeQuest) {
        activeQuest.completed = true;

        // Award rewards
        this.awardExperience(playerId, quest.experienceReward);
        this.state.score[playerId] = (this.state.score[playerId] || 0) + 50;

        this.addEvent('quest_completed', playerId, { questId, questName: quest.name });
      }
    }
  }

  private handleEquipItem(playerId: string, data: any): void {
    const { itemId, slot } = data;
    const character = this.characters.get(playerId);

    if (character) {
      character.equipment[slot as keyof typeof character.equipment] = itemId;
      this.addEvent('item_equipped', playerId, { itemId, slot });
    }
  }

  private awardExperience(playerId: string, amount: number): void {
    const character = this.characters.get(playerId);
    if (character) {
      character.experience += amount;

      // Check for level up
      const experienceForNextLevel = character.level * 100;
      if (character.experience >= experienceForNextLevel) {
        character.level++;
        character.experience = 0;

        // Increase stats
        character.stats.health += 10;
        character.stats.mana += 5;
        character.stats.strength += 2;
        character.stats.agility += 1;
        character.stats.intelligence += 1;

        this.addEvent('level_up', playerId, { newLevel: character.level });
      }
    }
  }

  private initializeQuests(): void {
    this.quests.set('quest-1', {
      id: 'quest-1',
      name: 'The Lost Artifact',
      description: 'Find the ancient artifact in the Shadow Crypt',
      experienceReward: 100,
      itemReward: 'Legendary Sword',
    });

    this.quests.set('quest-2', {
      id: 'quest-2',
      name: 'Dragon Slayer',
      description: 'Defeat the dragon in its lair',
      experienceReward: 500,
      itemReward: 'Dragon Scale Armor',
    });
  }

  private generateRegions(): Region[] {
    return [
      { name: 'Grasslands', level: 1, enemies: ['Goblin', 'Wolf'] },
      { name: 'Dark Forest', level: 5, enemies: ['Orc', 'Spider'] },
      { name: 'Mountain Pass', level: 10, enemies: ['Troll', 'Giant'] },
      { name: 'Volcanic Wasteland', level: 15, enemies: ['Demon', 'Fire Elemental'] },
    ];
  }

  private checkWinCondition(): void {
    // Check if main quest is completed
    for (const character of this.characters.values()) {
      const mainQuest = character.activeQuests.find(q => q.questId === 'quest-2');
      if (mainQuest && mainQuest.completed) {
        this.end();
      }
    }
  }

  private calculateCompletedQuests(): number {
    let total = 0;
    for (const character of this.characters.values()) {
      total += character.activeQuests.filter(q => q.completed).length;
    }
    return total;
  }

  private calculateTotalExperience(): number {
    let total = 0;
    for (const character of this.characters.values()) {
      total += character.experience + (character.level - 1) * 100;
    }
    return total;
  }

  private calculateHighestLevel(): number {
    let highest = 1;
    for (const character of this.characters.values()) {
      if (character.level > highest) highest = character.level;
    }
    return highest;
  }
}

interface GameWorld {
  name: string;
  regions: Region[];
  dungeons: string[];
  level: number;
}

interface Region {
  name: string;
  level: number;
  enemies: string[];
}

interface RPGCharacter {
  playerId: string;
  class: string;
  level: number;
  experience: number;
  stats: {
    health: number;
    mana: number;
    strength: number;
    agility: number;
    intelligence: number;
  };
  equipment: {
    weapon: string | null;
    armor: string | null;
    accessory: string | null;
  };
  inventory: string[];
  activeQuests: ActiveQuest[];
}

interface ActiveQuest {
  questId: string;
  progress: number;
  completed: boolean;
}

interface Quest {
  id: string;
  name: string;
  description: string;
  experienceReward: number;
  itemReward: string;
}

class CombatSystem {
  calculateDamage(character: RPGCharacter): number {
    return character.stats.strength * 2 + Math.floor(Math.random() * 10);
  }
}
