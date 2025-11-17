/**
 * Core types for the Game Platform
 * Inspired by cloud provider architectures (AWS, Azure, Google Cloud)
 */

export enum GameType {
  FPS = 'fps',
  STRATEGY = 'strategy',
  RACING = 'racing',
  RPG = 'rpg',
  MOBA = 'moba',
  BATTLE_ROYALE = 'battle_royale',
}

export enum ProviderType {
  NVIDIA_GEFORCE = 'nvidia_geforce',
  UNITY_CLOUD = 'unity_cloud',
  UNREAL_CLOUD = 'unreal_cloud',
  CUSTOM = 'custom',
}

export enum SessionStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  TERMINATED = 'terminated',
}

export interface Player {
  id: string;
  username: string;
  level: number;
  experience: number;
  stats: PlayerStats;
  inventory: InventoryItem[];
  achievements: Achievement[];
}

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  assists: number;
  totalPlayTime: number;
  averageScore: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  type: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  attributes: Record<string, any>;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlockedAt: Date;
  rarity: string;
}

export interface GameSession {
  id: string;
  gameId: string;
  gameType: GameType;
  provider: ProviderType;
  players: string[];
  status: SessionStatus;
  startTime: Date;
  endTime?: Date;
  settings: GameSettings;
  state: GameState;
}

export interface GameSettings {
  maxPlayers: number;
  difficulty: 'easy' | 'normal' | 'hard' | 'expert';
  mode: string;
  map?: string;
  timeLimit?: number;
  scoreLimit?: number;
  customRules?: Record<string, any>;
}

export interface GameState {
  currentPhase: string;
  score: Record<string, number>;
  events: GameEvent[];
  metadata: Record<string, any>;
}

export interface GameEvent {
  id: string;
  type: string;
  timestamp: Date;
  playerId?: string;
  data: Record<string, any>;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  score: number;
  metadata?: Record<string, any>;
}

export interface Analytics {
  sessionId: string;
  playerId: string;
  metrics: {
    fps: number;
    latency: number;
    bandwidth: number;
    cpuUsage: number;
    gpuUsage: number;
  };
  events: AnalyticsEvent[];
}

export interface AnalyticsEvent {
  type: string;
  timestamp: Date;
  data: Record<string, any>;
}
