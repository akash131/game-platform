import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import { GameType } from '../types/core.types';

/**
 * Tournament System
 * Competitive tournaments with brackets, prize pools, and rankings
 * Similar to esports tournaments in League of Legends, Fortnite, CS:GO
 */
export class TournamentSystem extends EventEmitter {
  private tournaments: Map<string, Tournament>;
  private registrations: Map<string, TournamentRegistration[]>; // tournamentId -> registrations
  private matches: Map<string, TournamentMatch[]>; // tournamentId -> matches
  private brackets: Map<string, TournamentBracket>; // tournamentId -> bracket

  constructor() {
    super();
    this.tournaments = new Map();
    this.registrations = new Map();
    this.matches = new Map();
    this.brackets = new Map();
  }

  /**
   * Create a new tournament
   */
  createTournament(config: TournamentConfig): Tournament {
    const tournament: Tournament = {
      id: uuidv4(),
      name: config.name,
      description: config.description,
      gameType: config.gameType,
      format: config.format,
      maxParticipants: config.maxParticipants,
      prizePool: config.prizePool,
      entryFee: config.entryFee,
      startTime: config.startTime,
      endTime: config.endTime,
      status: 'registration',
      createdAt: Date.now(),
      settings: config.settings || {},
    };

    this.tournaments.set(tournament.id, tournament);
    this.registrations.set(tournament.id, []);
    this.matches.set(tournament.id, []);

    console.log(`🏆 Tournament created: ${tournament.name}`);
    this.emit('tournament:created', tournament);

    return tournament;
  }

  /**
   * Register for tournament
   */
  registerForTournament(
    tournamentId: string,
    playerId: string,
    teamId?: string
  ): TournamentRegistration {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    if (tournament.status !== 'registration') {
      throw new Error('Tournament registration is closed');
    }

    const registrations = this.registrations.get(tournamentId)!;

    // Check if already registered
    const existing = registrations.find(
      r => r.playerId === playerId || r.teamId === teamId
    );
    if (existing) {
      throw new Error('Already registered for this tournament');
    }

    // Check capacity
    if (registrations.length >= tournament.maxParticipants) {
      throw new Error('Tournament is full');
    }

    const registration: TournamentRegistration = {
      id: uuidv4(),
      tournamentId,
      playerId,
      teamId,
      registeredAt: Date.now(),
      seed: registrations.length + 1,
    };

    registrations.push(registration);

    console.log(`✅ Registered for tournament: ${tournament.name}`);
    this.emit('tournament:registered', registration);

    return registration;
  }

  /**
   * Start tournament
   */
  startTournament(tournamentId: string): void {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    if (tournament.status !== 'registration') {
      throw new Error('Tournament has already started');
    }

    const registrations = this.registrations.get(tournamentId)!;

    if (registrations.length < 2) {
      throw new Error('Not enough participants');
    }

    // Generate bracket
    const bracket = this.generateBracket(tournamentId, tournament.format, registrations);
    this.brackets.set(tournamentId, bracket);

    // Generate first round matches
    this.generateMatches(tournamentId, bracket, 1);

    tournament.status = 'in_progress';

    console.log(`🎮 Tournament started: ${tournament.name}`);
    this.emit('tournament:started', tournament);
  }

  /**
   * Report match result
   */
  reportMatchResult(
    tournamentId: string,
    matchId: string,
    winnerId: string,
    score?: Record<string, number>
  ): void {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    const matches = this.matches.get(tournamentId)!;
    const match = matches.find(m => m.id === matchId);

    if (!match) {
      throw new Error('Match not found');
    }

    if (match.status !== 'scheduled') {
      throw new Error('Match is not in scheduled state');
    }

    match.winnerId = winnerId;
    match.loserId = match.participant1Id === winnerId ? match.participant2Id : match.participant1Id;
    match.score = score;
    match.status = 'completed';
    match.completedAt = Date.now();

    console.log(`✅ Match result reported`);
    this.emit('match:completed', match);

    // Check if round is complete
    this.checkRoundComplete(tournamentId, match.round);
  }

  /**
   * Get tournament
   */
  getTournament(tournamentId: string): Tournament | undefined {
    return this.tournaments.get(tournamentId);
  }

  /**
   * Get tournament bracket
   */
  getBracket(tournamentId: string): TournamentBracket | undefined {
    return this.brackets.get(tournamentId);
  }

  /**
   * Get tournament matches
   */
  getMatches(tournamentId: string, round?: number): TournamentMatch[] {
    const matches = this.matches.get(tournamentId) || [];
    return round ? matches.filter(m => m.round === round) : matches;
  }

  /**
   * Get tournament standings
   */
  getStandings(tournamentId: string): TournamentStanding[] {
    const bracket = this.brackets.get(tournamentId);
    if (!bracket) return [];

    const standings: TournamentStanding[] = [];

    // Winner
    if (bracket.winner) {
      standings.push({
        rank: 1,
        participantId: bracket.winner,
        wins: this.getWinCount(tournamentId, bracket.winner),
        losses: this.getLossCount(tournamentId, bracket.winner),
      });
    }

    // Finalists
    if (bracket.finalist) {
      standings.push({
        rank: 2,
        participantId: bracket.finalist,
        wins: this.getWinCount(tournamentId, bracket.finalist),
        losses: this.getLossCount(tournamentId, bracket.finalist),
      });
    }

    return standings;
  }

  /**
   * Get active tournaments
   */
  getActiveTournaments(): Tournament[] {
    return Array.from(this.tournaments.values()).filter(
      t => t.status === 'registration' || t.status === 'in_progress'
    );
  }

  /**
   * Get upcoming tournaments
   */
  getUpcomingTournaments(): Tournament[] {
    const now = Date.now();
    return Array.from(this.tournaments.values()).filter(
      t => t.status === 'registration' && t.startTime > now
    );
  }

  /**
   * End tournament
   */
  endTournament(tournamentId: string): void {
    const tournament = this.tournaments.get(tournamentId);
    if (!tournament) {
      throw new Error('Tournament not found');
    }

    tournament.status = 'completed';
    tournament.endTime = Date.now();

    const bracket = this.brackets.get(tournamentId);
    if (bracket?.winner) {
      console.log(`👑 Tournament winner: ${bracket.winner}`);
    }

    console.log(`🏁 Tournament ended: ${tournament.name}`);
    this.emit('tournament:ended', tournament);
  }

  /**
   * Get statistics
   */
  getStatistics(): TournamentStatistics {
    return {
      totalTournaments: this.tournaments.size,
      activeTournaments: Array.from(this.tournaments.values()).filter(
        t => t.status === 'in_progress'
      ).length,
      totalMatches: Array.from(this.matches.values()).reduce(
        (sum, matches) => sum + matches.length,
        0
      ),
      totalParticipants: Array.from(this.registrations.values()).reduce(
        (sum, regs) => sum + regs.length,
        0
      ),
    };
  }

  private generateBracket(
    tournamentId: string,
    format: TournamentFormat,
    registrations: TournamentRegistration[]
  ): TournamentBracket {
    const bracket: TournamentBracket = {
      tournamentId,
      format,
      rounds: this.calculateRounds(registrations.length),
      participants: registrations.map(r => r.teamId || r.playerId),
    };

    return bracket;
  }

  private generateMatches(
    tournamentId: string,
    bracket: TournamentBracket,
    round: number
  ): void {
    const matches = this.matches.get(tournamentId)!;
    const participants = bracket.participants;

    // For first round, pair participants
    if (round === 1) {
      for (let i = 0; i < participants.length; i += 2) {
        if (i + 1 < participants.length) {
          const match: TournamentMatch = {
            id: uuidv4(),
            tournamentId,
            round,
            matchNumber: Math.floor(i / 2) + 1,
            participant1Id: participants[i],
            participant2Id: participants[i + 1],
            status: 'scheduled',
            createdAt: Date.now(),
          };

          matches.push(match);
        }
      }

      console.log(`📋 Generated ${matches.length} matches for round ${round}`);
    }
  }

  private checkRoundComplete(tournamentId: string, round: number): void {
    const matches = this.matches.get(tournamentId)!;
    const roundMatches = matches.filter(m => m.round === round);

    const allCompleted = roundMatches.every(m => m.status === 'completed');

    if (allCompleted) {
      console.log(`✅ Round ${round} complete`);
      this.emit('round:completed', { tournamentId, round });

      const bracket = this.brackets.get(tournamentId)!;

      // Check if tournament is complete
      if (round === bracket.rounds) {
        const finalMatch = roundMatches[0];
        if (finalMatch) {
          bracket.winner = finalMatch.winnerId;
          bracket.finalist = finalMatch.loserId;
        }
        this.endTournament(tournamentId);
      } else {
        // Generate next round
        this.generateNextRound(tournamentId, round);
      }
    }
  }

  private generateNextRound(tournamentId: string, completedRound: number): void {
    const matches = this.matches.get(tournamentId)!;
    const completedMatches = matches.filter(m => m.round === completedRound);

    const winners = completedMatches.map(m => m.winnerId!);

    // Create matches for next round
    for (let i = 0; i < winners.length; i += 2) {
      if (i + 1 < winners.length) {
        const match: TournamentMatch = {
          id: uuidv4(),
          tournamentId,
          round: completedRound + 1,
          matchNumber: Math.floor(i / 2) + 1,
          participant1Id: winners[i],
          participant2Id: winners[i + 1],
          status: 'scheduled',
          createdAt: Date.now(),
        };

        matches.push(match);
      }
    }

    console.log(`📋 Generated round ${completedRound + 1} matches`);
    this.emit('round:generated', { tournamentId, round: completedRound + 1 });
  }

  private calculateRounds(participantCount: number): number {
    return Math.ceil(Math.log2(participantCount));
  }

  private getWinCount(tournamentId: string, participantId: string): number {
    const matches = this.matches.get(tournamentId) || [];
    return matches.filter(m => m.winnerId === participantId).length;
  }

  private getLossCount(tournamentId: string, participantId: string): number {
    const matches = this.matches.get(tournamentId) || [];
    return matches.filter(m => m.loserId === participantId).length;
  }
}

export interface Tournament {
  id: string;
  name: string;
  description: string;
  gameType: GameType;
  format: TournamentFormat;
  maxParticipants: number;
  prizePool?: PrizePool;
  entryFee?: number;
  startTime: number;
  endTime?: number;
  status: TournamentStatus;
  createdAt: number;
  settings: Record<string, any>;
}

export interface TournamentConfig {
  name: string;
  description: string;
  gameType: GameType;
  format: TournamentFormat;
  maxParticipants: number;
  prizePool?: PrizePool;
  entryFee?: number;
  startTime: number;
  endTime?: number;
  settings?: Record<string, any>;
}

export type TournamentFormat = 'single_elimination' | 'double_elimination' | 'round_robin' | 'swiss';
export type TournamentStatus = 'registration' | 'in_progress' | 'completed' | 'cancelled';

export interface PrizePool {
  total: number;
  distribution: Record<number, number>; // rank -> prize
  currency: 'soft' | 'hard' | 'real';
}

export interface TournamentRegistration {
  id: string;
  tournamentId: string;
  playerId: string;
  teamId?: string;
  registeredAt: number;
  seed?: number;
}

export interface TournamentBracket {
  tournamentId: string;
  format: TournamentFormat;
  rounds: number;
  participants: string[];
  winner?: string;
  finalist?: string;
}

export interface TournamentMatch {
  id: string;
  tournamentId: string;
  round: number;
  matchNumber: number;
  participant1Id: string;
  participant2Id: string;
  winnerId?: string;
  loserId?: string;
  score?: Record<string, number>;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: number;
  completedAt?: number;
}

export interface TournamentStanding {
  rank: number;
  participantId: string;
  wins: number;
  losses: number;
  points?: number;
}

export interface TournamentStatistics {
  totalTournaments: number;
  activeTournaments: number;
  totalMatches: number;
  totalParticipants: number;
}
