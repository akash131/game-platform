import { EventEmitter } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

/**
 * FlexMatch - Advanced matchmaking system like AWS GameLift FlexMatch
 * Provides rule-based matchmaking with team balancing, latency optimization, and backfill
 */

export interface PlayerAttribute {
  name: string;
  value: number | string | string[];
}

export interface PlayerLatency {
  regionName: string;
  latencyMs: number;
}

export interface FlexMatchPlayer {
  playerId: string;
  attributes: PlayerAttribute[];
  latencyMap?: PlayerLatency[];
  team?: string;
}

export interface RuleSetProperty {
  propertyType: 'player' | 'team';
  key: string;
  operation: 'min' | 'max' | 'avg' | 'sum' | 'count';
  referenceValue?: number;
  minDistance?: number;
  maxDistance?: number;
}

export interface MatchmakingRule {
  name: string;
  description?: string;
  type: 'distance' | 'comparison' | 'collection' | 'latency' | 'batch';
  measurements?: string[];
  referenceValue?: number;
  minDistance?: number;
  maxDistance?: number;
  operation?: 'min' | 'max' | 'avg' | 'median' | 'stddev';
  properties?: RuleSetProperty[];
  batchingPreference?: 'sorted' | 'random' | 'fastest';
  maxLatency?: number;
}

export interface TeamConfiguration {
  name: string;
  minPlayers: number;
  maxPlayers: number;
  quantity?: number; // Number of teams (default 2)
}

export interface MatchmakingRuleSet {
  ruleSetName: string;
  ruleSetBody: {
    name: string;
    ruleLanguageVersion: string;
    playerAttributes?: Array<{
      name: string;
      type: 'string' | 'number' | 'string_list';
      default?: any;
    }>;
    teams: TeamConfiguration[];
    rules: MatchmakingRule[];
    expansions?: Array<{
      target: string;
      steps: Array<{
        waitTimeSeconds: number;
        value: number;
      }>;
    }>;
  };
}

export interface MatchmakingConfiguration {
  name: string;
  configurationArn?: string;
  description?: string;
  ruleSetName: string;
  ruleSet: MatchmakingRuleSet;
  requestTimeoutSeconds: number;
  acceptanceTimeoutSeconds: number;
  acceptanceRequired: boolean;
  backfillMode: 'AUTOMATIC' | 'MANUAL';
  gameSessionQueueArns?: string[];
  additionalPlayerCount?: number;
  customEventData?: string;
  notificationTarget?: string;
}

export interface MatchmakingTicket {
  ticketId: string;
  configurationName: string;
  configurationArn: string;
  status: 'QUEUED' | 'SEARCHING' | 'REQUIRES_ACCEPTANCE' | 'PLACING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT';
  statusReason?: string;
  statusMessage?: string;
  startTime: Date;
  endTime?: Date;
  players: FlexMatchPlayer[];
  gameSessionConnectionInfo?: {
    gameSessionArn: string;
    ipAddress: string;
    port: number;
    matchedPlayerSessions?: Array<{
      playerId: string;
      playerSessionId: string;
    }>;
  };
  estimatedWaitTime?: number;
}

export interface PotentialMatch {
  matchId: string;
  ticketIds: string[];
  players: FlexMatchPlayer[];
  teams: Map<string, FlexMatchPlayer[]>;
  averageSkill: number;
  skillVariance: number;
  averageLatency?: number;
  createdAt: Date;
}

export interface BackfillRequest {
  ticketId: string;
  gameSessionArn: string;
  matchmakingConfigurationArn: string;
  players: FlexMatchPlayer[];
}

export interface MatchmakingEvents {
  'MatchmakingSearching': (ticket: MatchmakingTicket) => void;
  'PotentialMatchCreated': (match: PotentialMatch) => void;
  'AcceptMatch': (ticketId: string, playerId: string, acceptance: 'ACCEPT' | 'REJECT') => void;
  'AcceptMatchCompleted': (ticketId: string, players: FlexMatchPlayer[], accepted: boolean) => void;
  'MatchmakingSucceeded': (ticket: MatchmakingTicket) => void;
  'MatchmakingTimedOut': (ticket: MatchmakingTicket) => void;
  'MatchmakingCancelled': (ticket: MatchmakingTicket) => void;
  'MatchmakingFailed': (ticket: MatchmakingTicket, reason: string) => void;
}

export class FlexMatch extends EventEmitter<MatchmakingEvents> {
  private configurations: Map<string, MatchmakingConfiguration> = new Map();
  private ruleSets: Map<string, MatchmakingRuleSet> = new Map();
  private tickets: Map<string, MatchmakingTicket> = new Map();
  private activeSearches: Map<string, NodeJS.Timeout> = new Map();
  private potentialMatches: Map<string, PotentialMatch> = new Map();
  private playerAcceptances: Map<string, Map<string, 'ACCEPT' | 'REJECT'>> = new Map();

  constructor() {
    super();
  }

  /**
   * Create a matchmaking rule set
   */
  createMatchmakingRuleSet(ruleSet: MatchmakingRuleSet): MatchmakingRuleSet {
    this.validateRuleSet(ruleSet);
    this.ruleSets.set(ruleSet.ruleSetName, ruleSet);
    return ruleSet;
  }

  /**
   * Create a matchmaking configuration
   */
  createMatchmakingConfiguration(config: Omit<MatchmakingConfiguration, 'configurationArn'>): MatchmakingConfiguration {
    const ruleSet = this.ruleSets.get(config.ruleSetName);
    if (!ruleSet) {
      throw new Error(`Rule set not found: ${config.ruleSetName}`);
    }

    const configuration: MatchmakingConfiguration = {
      ...config,
      configurationArn: `arn:aws:gamelift:region:account:matchmakingconfiguration/${config.name}`,
      ruleSet,
    };

    this.configurations.set(config.name, configuration);
    return configuration;
  }

  /**
   * Start matchmaking
   */
  startMatchmaking(
    configurationName: string,
    players: FlexMatchPlayer[]
  ): MatchmakingTicket {
    const configuration = this.configurations.get(configurationName);
    if (!configuration) {
      throw new Error(`Configuration not found: ${configurationName}`);
    }

    const ticket: MatchmakingTicket = {
      ticketId: uuidv4(),
      configurationName,
      configurationArn: configuration.configurationArn!,
      status: 'QUEUED',
      startTime: new Date(),
      players,
      estimatedWaitTime: 30000, // 30 seconds initial estimate
    };

    this.tickets.set(ticket.ticketId, ticket);

    // Start searching
    setTimeout(() => {
      this.searchForMatch(ticket.ticketId);
    }, 100);

    return ticket;
  }

  /**
   * Accept match
   */
  acceptMatch(ticketId: string, playerId: string, acceptance: 'ACCEPT' | 'REJECT'): void {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      throw new Error(`Ticket not found: ${ticketId}`);
    }

    if (ticket.status !== 'REQUIRES_ACCEPTANCE') {
      throw new Error(`Ticket is not awaiting acceptance: ${ticket.status}`);
    }

    // Record acceptance
    if (!this.playerAcceptances.has(ticketId)) {
      this.playerAcceptances.set(ticketId, new Map());
    }
    this.playerAcceptances.get(ticketId)!.set(playerId, acceptance);

    this.emit('AcceptMatch', ticketId, playerId, acceptance);

    // Check if all players have responded
    const acceptances = this.playerAcceptances.get(ticketId)!;
    const allPlayers = ticket.players;

    if (acceptances.size === allPlayers.length) {
      const allAccepted = Array.from(acceptances.values()).every(a => a === 'ACCEPT');

      this.emit('AcceptMatchCompleted', ticketId, allPlayers, allAccepted);

      if (allAccepted) {
        // All players accepted - proceed to placement
        ticket.status = 'PLACING';
        this.placeGameSession(ticket);
      } else {
        // At least one player rejected - cancel match
        ticket.status = 'CANCELLED';
        ticket.statusReason = 'PlayerRejected';
        ticket.statusMessage = 'One or more players rejected the match';
        ticket.endTime = new Date();
        this.emit('MatchmakingCancelled', ticket);
      }

      this.playerAcceptances.delete(ticketId);
    }
  }

  /**
   * Stop matchmaking
   */
  stopMatchmaking(ticketId: string): void {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      throw new Error(`Ticket not found: ${ticketId}`);
    }

    if (ticket.status === 'COMPLETED' || ticket.status === 'FAILED' || ticket.status === 'CANCELLED') {
      return; // Already finished
    }

    ticket.status = 'CANCELLED';
    ticket.endTime = new Date();

    const timeout = this.activeSearches.get(ticketId);
    if (timeout) {
      clearTimeout(timeout);
      this.activeSearches.delete(ticketId);
    }

    this.emit('MatchmakingCancelled', ticket);
  }

  /**
   * Start backfill matchmaking
   */
  startMatchBackfill(request: BackfillRequest): MatchmakingTicket {
    const configName = this.getConfigNameFromArn(request.matchmakingConfigurationArn);
    const configuration = this.configurations.get(configName);

    if (!configuration) {
      throw new Error(`Configuration not found: ${configName}`);
    }

    const ticket: MatchmakingTicket = {
      ticketId: request.ticketId || uuidv4(),
      configurationName: configName,
      configurationArn: request.matchmakingConfigurationArn,
      status: 'QUEUED',
      startTime: new Date(),
      players: request.players,
      gameSessionConnectionInfo: {
        gameSessionArn: request.gameSessionArn,
        ipAddress: '', // Would be filled from actual game session
        port: 0,
      },
    };

    this.tickets.set(ticket.ticketId, ticket);

    // Start backfill search
    setTimeout(() => {
      this.searchForBackfill(ticket.ticketId);
    }, 100);

    return ticket;
  }

  /**
   * Get matchmaking ticket
   */
  getMatchmakingTicket(ticketId: string): MatchmakingTicket | undefined {
    return this.tickets.get(ticketId);
  }

  /**
   * Search for match
   */
  private searchForMatch(ticketId: string): void {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return;

    const configuration = this.configurations.get(ticket.configurationName);
    if (!configuration) return;

    // Update status
    ticket.status = 'SEARCHING';
    this.emit('MatchmakingSearching', ticket);

    // Find compatible tickets
    const compatibleTickets = this.findCompatibleTickets(ticket, configuration);

    if (compatibleTickets.length > 0) {
      // Try to form a match
      const match = this.formMatch(ticket, compatibleTickets, configuration);

      if (match) {
        this.handlePotentialMatch(match, configuration);
        return;
      }
    }

    // Check for timeout
    const elapsed = Date.now() - ticket.startTime.getTime();
    if (elapsed >= configuration.requestTimeoutSeconds * 1000) {
      ticket.status = 'TIMED_OUT';
      ticket.endTime = new Date();
      this.emit('MatchmakingTimedOut', ticket);
      return;
    }

    // Continue searching
    const timeout = setTimeout(() => {
      this.searchForMatch(ticketId);
    }, 2000); // Search every 2 seconds

    this.activeSearches.set(ticketId, timeout);
  }

  /**
   * Find compatible tickets for matching
   */
  private findCompatibleTickets(
    ticket: MatchmakingTicket,
    configuration: MatchmakingConfiguration
  ): MatchmakingTicket[] {
    const compatible: MatchmakingTicket[] = [];

    for (const [otherId, otherTicket] of this.tickets) {
      if (otherId === ticket.ticketId) continue;
      if (otherTicket.status !== 'SEARCHING' && otherTicket.status !== 'QUEUED') continue;
      if (otherTicket.configurationName !== ticket.configurationName) continue;

      compatible.push(otherTicket);
    }

    return compatible;
  }

  /**
   * Form a match from tickets
   */
  private formMatch(
    primaryTicket: MatchmakingTicket,
    otherTickets: MatchmakingTicket[],
    configuration: MatchmakingConfiguration
  ): PotentialMatch | null {
    const ruleSet = configuration.ruleSet.ruleSetBody;
    const allPlayers: FlexMatchPlayer[] = [...primaryTicket.players];

    // Calculate required player count
    let requiredPlayers = 0;
    for (const team of ruleSet.teams) {
      requiredPlayers += team.minPlayers * (team.quantity || 1);
    }

    // Add players from other tickets
    for (const ticket of otherTickets) {
      allPlayers.push(...ticket.players);
      if (allPlayers.length >= requiredPlayers) break;
    }

    if (allPlayers.length < requiredPlayers) {
      return null; // Not enough players
    }

    // Assign players to teams
    const teams = this.assignPlayersToTeams(allPlayers, ruleSet.teams);

    // Validate rules
    if (!this.validateMatchRules(teams, ruleSet.rules, allPlayers)) {
      return null; // Rules not satisfied
    }

    // Calculate match metrics
    const skills = allPlayers
      .map(p => p.attributes.find(a => a.name === 'skill')?.value as number)
      .filter(s => s !== undefined);

    const averageSkill = skills.reduce((a, b) => a + b, 0) / skills.length;
    const skillVariance = skills.reduce((sum, skill) => sum + Math.pow(skill - averageSkill, 2), 0) / skills.length;

    const match: PotentialMatch = {
      matchId: uuidv4(),
      ticketIds: [primaryTicket.ticketId, ...otherTickets.map(t => t.ticketId)],
      players: allPlayers,
      teams,
      averageSkill,
      skillVariance,
      createdAt: new Date(),
    };

    return match;
  }

  /**
   * Assign players to teams
   */
  private assignPlayersToTeams(
    players: FlexMatchPlayer[],
    teamConfigs: TeamConfiguration[]
  ): Map<string, FlexMatchPlayer[]> {
    const teams = new Map<string, FlexMatchPlayer[]>();

    // Initialize teams
    for (const config of teamConfigs) {
      const quantity = config.quantity || 1;
      for (let i = 0; i < quantity; i++) {
        const teamName = quantity > 1 ? `${config.name}_${i + 1}` : config.name;
        teams.set(teamName, []);
      }
    }

    // Sort players by skill for balanced teams
    const sortedPlayers = [...players].sort((a, b) => {
      const skillA = a.attributes.find(attr => attr.name === 'skill')?.value as number || 0;
      const skillB = b.attributes.find(attr => attr.name === 'skill')?.value as number || 0;
      return skillB - skillA;
    });

    // Distribute players in snake draft order
    const teamNames = Array.from(teams.keys());
    let teamIndex = 0;
    let direction = 1;

    for (const player of sortedPlayers) {
      const teamName = teamNames[teamIndex];
      teams.get(teamName)!.push(player);
      player.team = teamName;

      teamIndex += direction;
      if (teamIndex >= teamNames.length) {
        teamIndex = teamNames.length - 1;
        direction = -1;
      } else if (teamIndex < 0) {
        teamIndex = 0;
        direction = 1;
      }
    }

    return teams;
  }

  /**
   * Validate match rules
   */
  private validateMatchRules(
    teams: Map<string, FlexMatchPlayer[]>,
    rules: MatchmakingRule[],
    allPlayers: FlexMatchPlayer[]
  ): boolean {
    for (const rule of rules) {
      switch (rule.type) {
        case 'distance':
          if (!this.validateDistanceRule(rule, allPlayers)) return false;
          break;
        case 'comparison':
          if (!this.validateComparisonRule(rule, allPlayers)) return false;
          break;
        case 'latency':
          if (!this.validateLatencyRule(rule, allPlayers)) return false;
          break;
      }
    }

    return true;
  }

  /**
   * Validate distance rule
   */
  private validateDistanceRule(rule: MatchmakingRule, players: FlexMatchPlayer[]): boolean {
    if (!rule.measurements || rule.measurements.length === 0) return true;

    for (const measurement of rule.measurements) {
      const values = players
        .map(p => p.attributes.find(a => a.name === measurement)?.value as number)
        .filter(v => v !== undefined);

      if (values.length === 0) continue;

      const max = Math.max(...values);
      const min = Math.min(...values);
      const distance = max - min;

      if (rule.maxDistance !== undefined && distance > rule.maxDistance) {
        return false;
      }

      if (rule.minDistance !== undefined && distance < rule.minDistance) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate comparison rule
   */
  private validateComparisonRule(rule: MatchmakingRule, players: FlexMatchPlayer[]): boolean {
    if (!rule.measurements || rule.measurements.length === 0) return true;

    for (const measurement of rule.measurements) {
      const values = players
        .map(p => p.attributes.find(a => a.name === measurement)?.value as number)
        .filter(v => v !== undefined);

      if (values.length === 0) continue;

      let calculatedValue: number;

      switch (rule.operation) {
        case 'min':
          calculatedValue = Math.min(...values);
          break;
        case 'max':
          calculatedValue = Math.max(...values);
          break;
        case 'avg':
          calculatedValue = values.reduce((a, b) => a + b, 0) / values.length;
          break;
        default:
          continue;
      }

      if (rule.referenceValue !== undefined) {
        if (Math.abs(calculatedValue - rule.referenceValue) > (rule.maxDistance || 0)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Validate latency rule
   */
  private validateLatencyRule(rule: MatchmakingRule, players: FlexMatchPlayer[]): boolean {
    if (!rule.maxLatency) return true;

    for (const player of players) {
      if (!player.latencyMap || player.latencyMap.length === 0) continue;

      const minLatency = Math.min(...player.latencyMap.map(l => l.latencyMs));

      if (minLatency > rule.maxLatency) {
        return false;
      }
    }

    return true;
  }

  /**
   * Handle potential match
   */
  private handlePotentialMatch(match: PotentialMatch, configuration: MatchmakingConfiguration): void {
    this.potentialMatches.set(match.matchId, match);
    this.emit('PotentialMatchCreated', match);

    // Update all tickets
    for (const ticketId of match.ticketIds) {
      const ticket = this.tickets.get(ticketId);
      if (!ticket) continue;

      if (configuration.acceptanceRequired) {
        ticket.status = 'REQUIRES_ACCEPTANCE';
      } else {
        ticket.status = 'PLACING';
        this.placeGameSession(ticket);
      }
    }
  }

  /**
   * Place game session
   */
  private placeGameSession(ticket: MatchmakingTicket): void {
    // Simulate game session placement
    setTimeout(() => {
      ticket.status = 'COMPLETED';
      ticket.endTime = new Date();
      ticket.gameSessionConnectionInfo = {
        gameSessionArn: `arn:aws:gamelift:region:account:gamesession/${uuidv4()}`,
        ipAddress: '192.168.1.100',
        port: 7777,
        matchedPlayerSessions: ticket.players.map(p => ({
          playerId: p.playerId,
          playerSessionId: uuidv4(),
        })),
      };

      this.emit('MatchmakingSucceeded', ticket);
    }, 2000); // Simulate 2 second placement
  }

  /**
   * Search for backfill
   */
  private searchForBackfill(ticketId: string): void {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return;

    ticket.status = 'SEARCHING';
    this.emit('MatchmakingSearching', ticket);

    // Find compatible players
    const compatibleTickets = this.findCompatibleTickets(
      ticket,
      this.configurations.get(ticket.configurationName)!
    );

    if (compatibleTickets.length > 0) {
      // Add players to existing session
      ticket.status = 'COMPLETED';
      ticket.endTime = new Date();

      if (!ticket.gameSessionConnectionInfo!.matchedPlayerSessions) {
        ticket.gameSessionConnectionInfo!.matchedPlayerSessions = [];
      }

      for (const player of compatibleTickets[0].players) {
        ticket.gameSessionConnectionInfo!.matchedPlayerSessions!.push({
          playerId: player.playerId,
          playerSessionId: uuidv4(),
        });
      }

      this.emit('MatchmakingSucceeded', ticket);
      return;
    }

    // Continue searching
    const timeout = setTimeout(() => {
      this.searchForBackfill(ticketId);
    }, 3000); // Search every 3 seconds for backfill

    this.activeSearches.set(ticketId, timeout);
  }

  /**
   * Validate rule set
   */
  private validateRuleSet(ruleSet: MatchmakingRuleSet): void {
    if (!ruleSet.ruleSetBody.teams || ruleSet.ruleSetBody.teams.length === 0) {
      throw new Error('Rule set must define at least one team');
    }

    if (!ruleSet.ruleSetBody.rules || ruleSet.ruleSetBody.rules.length === 0) {
      throw new Error('Rule set must define at least one rule');
    }
  }

  /**
   * Get configuration name from ARN
   */
  private getConfigNameFromArn(arn: string): string {
    const parts = arn.split('/');
    return parts[parts.length - 1];
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    activeTickets: number;
    searchingTickets: number;
    completedMatches: number;
    averageWaitTime: number;
  } {
    let activeTickets = 0;
    let searchingTickets = 0;
    let completedMatches = 0;
    let totalWaitTime = 0;

    for (const ticket of this.tickets.values()) {
      if (ticket.status === 'QUEUED' || ticket.status === 'SEARCHING' || ticket.status === 'REQUIRES_ACCEPTANCE') {
        activeTickets++;
        if (ticket.status === 'SEARCHING') {
          searchingTickets++;
        }
      }

      if (ticket.status === 'COMPLETED') {
        completedMatches++;
        if (ticket.endTime) {
          totalWaitTime += ticket.endTime.getTime() - ticket.startTime.getTime();
        }
      }
    }

    return {
      activeTickets,
      searchingTickets,
      completedMatches,
      averageWaitTime: completedMatches > 0 ? totalWaitTime / completedMatches : 0,
    };
  }
}
