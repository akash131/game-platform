import { EventEmitter } from 'eventemitter3';
import * as http from 'http';

/**
 * Game Server SDK - Client library for game servers to integrate with GameLift
 * Similar to AWS GameLift Server SDK
 */

export interface GameSession {
  gameSessionId: string;
  fleetId: string;
  name?: string;
  maxPlayers: number;
  currentPlayers: number;
  status: 'ACTIVATING' | 'ACTIVE' | 'TERMINATING' | 'TERMINATED';
  gameProperties?: Map<string, string>;
  gameSessionData?: string;
  matchmakerData?: string;
  ipAddress: string;
  port: number;
  creationTime: Date;
}

export interface UpdateGameSession {
  gameSessionId: string;
  maximumPlayerSessionCount?: number;
  name?: string;
  playerSessionCreationPolicy?: 'ACCEPT_ALL' | 'DENY_ALL';
  protectionPolicy?: 'NoProtection' | 'FullProtection';
}

export interface PlayerSession {
  playerSessionId: string;
  playerId: string;
  gameSessionId: string;
  fleetId: string;
  status: 'RESERVED' | 'ACTIVE' | 'COMPLETED' | 'TIMEDOUT';
  creationTime: Date;
  terminationTime?: Date;
  ipAddress?: string;
  port?: number;
  playerData?: string;
}

export interface StartGameSessionRequest {
  gameSession: GameSession;
}

export interface ProcessParameters {
  port: number;
  logParameters?: {
    logPaths: string[];
  };
  onStartGameSession: (gameSession: GameSession) => void;
  onProcessTerminate: () => void;
  onHealthCheck?: () => boolean;
  onUpdateGameSession?: (updateGameSession: UpdateGameSession) => void;
}

export interface ServerParameters {
  webSocketUrl?: string;
  processId?: string;
  hostId?: string;
  fleetId?: string;
  authToken?: string;
}

export enum PlayerSessionStatus {
  RESERVED = 'RESERVED',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  TIMEDOUT = 'TIMEDOUT',
}

export interface SDKEvents {
  'gameSessionStarted': (gameSession: GameSession) => void;
  'gameSessionTerminating': () => void;
  'healthCheck': () => void;
  'updateGameSession': (update: UpdateGameSession) => void;
}

export class GameServerSDK extends EventEmitter<SDKEvents> {
  private initialized = false;
  private processReady = false;
  private currentGameSession: GameSession | null = null;
  private serverParameters: ServerParameters | null = null;
  private processParameters: ProcessParameters | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private server: http.Server | null = null;

  constructor() {
    super();
  }

  /**
   * Initialize the SDK
   */
  async initSDK(serverParameters?: ServerParameters): Promise<void> {
    if (this.initialized) {
      throw new Error('SDK already initialized');
    }

    this.serverParameters = serverParameters || {
      webSocketUrl: process.env.GAMELIFT_SDK_URL || 'http://localhost:5757',
      processId: process.env.GAMELIFT_PROCESS_ID,
      hostId: process.env.GAMELIFT_HOST_ID,
      fleetId: process.env.GAMELIFT_FLEET_ID,
      authToken: process.env.GAMELIFT_AUTH_TOKEN,
    };

    this.initialized = true;
  }

  /**
   * Notify GameLift that the server process is ready
   */
  async processReady(parameters: ProcessParameters): Promise<void> {
    if (!this.initialized) {
      throw new Error('SDK not initialized. Call initSDK() first.');
    }

    if (this.processReady) {
      throw new Error('Process already ready');
    }

    this.processParameters = parameters;

    // Start HTTP server for receiving commands
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(parameters.port, () => {
        console.log(`Game server SDK listening on port ${parameters.port}`);
        resolve();
      });

      this.server!.on('error', reject);
    });

    // Start health check
    if (parameters.onHealthCheck) {
      this.healthCheckInterval = setInterval(() => {
        if (parameters.onHealthCheck) {
          const healthy = parameters.onHealthCheck();
          this.emit('healthCheck');

          if (!healthy) {
            console.warn('Health check failed');
          }
        }
      }, 60000); // Every minute
    }

    this.processReady = true;

    // Notify GameLift
    await this.sendToGameLift('ProcessReady', {
      port: parameters.port,
      logPaths: parameters.logParameters?.logPaths || [],
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body);

        switch (req.url) {
          case '/startGameSession':
            this.handleStartGameSession(data);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
            break;

          case '/terminateProcess':
            this.handleTerminateProcess();
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
            break;

          case '/healthCheck':
            const healthy = this.processParameters?.onHealthCheck?.() ?? true;
            res.writeHead(200);
            res.end(JSON.stringify({ healthy }));
            break;

          case '/updateGameSession':
            this.handleUpdateGameSession(data);
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
            break;

          default:
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
        }
      } catch (error: any) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  }

  /**
   * Handle start game session
   */
  private handleStartGameSession(data: StartGameSessionRequest): void {
    this.currentGameSession = data.gameSession;

    if (this.processParameters?.onStartGameSession) {
      this.processParameters.onStartGameSession(data.gameSession);
    }

    this.emit('gameSessionStarted', data.gameSession);
  }

  /**
   * Handle terminate process
   */
  private handleTerminateProcess(): void {
    if (this.processParameters?.onProcessTerminate) {
      this.processParameters.onProcessTerminate();
    }

    this.emit('gameSessionTerminating');

    // Cleanup
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.server) {
      this.server.close();
    }
  }

  /**
   * Handle update game session
   */
  private handleUpdateGameSession(data: UpdateGameSession): void {
    if (this.processParameters?.onUpdateGameSession) {
      this.processParameters.onUpdateGameSession(data);
    }

    this.emit('updateGameSession', data);
  }

  /**
   * Activate game session
   */
  async activateGameSession(): Promise<void> {
    if (!this.currentGameSession) {
      throw new Error('No active game session');
    }

    this.currentGameSession.status = 'ACTIVE';

    await this.sendToGameLift('ActivateGameSession', {
      gameSessionId: this.currentGameSession.gameSessionId,
    });
  }

  /**
   * Terminate game session
   */
  async terminateGameSession(): Promise<void> {
    if (!this.currentGameSession) {
      throw new Error('No active game session');
    }

    this.currentGameSession.status = 'TERMINATED';

    await this.sendToGameLift('TerminateGameSession', {
      gameSessionId: this.currentGameSession.gameSessionId,
    });

    this.currentGameSession = null;
  }

  /**
   * Accept player session
   */
  async acceptPlayerSession(playerSessionId: string): Promise<void> {
    await this.sendToGameLift('AcceptPlayerSession', {
      playerSessionId,
      gameSessionId: this.currentGameSession?.gameSessionId,
    });
  }

  /**
   * Remove player session
   */
  async removePlayerSession(playerSessionId: string): Promise<void> {
    await this.sendToGameLift('RemovePlayerSession', {
      playerSessionId,
      gameSessionId: this.currentGameSession?.gameSessionId,
    });
  }

  /**
   * Update player session creation policy
   */
  async updatePlayerSessionCreationPolicy(
    policy: 'ACCEPT_ALL' | 'DENY_ALL'
  ): Promise<void> {
    if (!this.currentGameSession) {
      throw new Error('No active game session');
    }

    await this.sendToGameLift('UpdatePlayerSessionCreationPolicy', {
      gameSessionId: this.currentGameSession.gameSessionId,
      newPlayerSessionCreationPolicy: policy,
    });
  }

  /**
   * Report player session status
   */
  async updatePlayerSessionStatus(
    playerSessionId: string,
    status: PlayerSessionStatus
  ): Promise<void> {
    await this.sendToGameLift('UpdatePlayerSessionStatus', {
      playerSessionId,
      status,
    });
  }

  /**
   * Get current game session
   */
  getGameSession(): GameSession | null {
    return this.currentGameSession;
  }

  /**
   * Process ending
   */
  async processEnding(): Promise<void> {
    if (this.currentGameSession) {
      await this.terminateGameSession();
    }

    await this.sendToGameLift('ProcessEnding', {});

    // Cleanup
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.server) {
      this.server.close();
    }

    this.processReady = false;
  }

  /**
   * Report health
   */
  reportHealth(healthy: boolean): void {
    // In a real implementation, this would send health status to GameLift
    if (!healthy) {
      console.warn('Server reporting unhealthy status');
    }
  }

  /**
   * Get SDK version
   */
  getSDKVersion(): string {
    return '5.1.2'; // Mimic AWS SDK version format
  }

  /**
   * Get instance certificate
   */
  async getInstanceCertificate(): Promise<string> {
    // In real implementation, would fetch TLS certificate for secure connections
    return 'MOCK_CERTIFICATE';
  }

  /**
   * Send message to GameLift service
   */
  private async sendToGameLift(action: string, data: any): Promise<void> {
    if (!this.serverParameters?.webSocketUrl) {
      console.log(`[SDK] ${action}:`, data);
      return;
    }

    // In real implementation, would send via WebSocket or HTTP to GameLift service
    try {
      const response = await fetch(`${this.serverParameters.webSocketUrl}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.serverParameters.authToken}`,
        },
        body: JSON.stringify({
          ...data,
          processId: this.serverParameters.processId,
          hostId: this.serverParameters.hostId,
          fleetId: this.serverParameters.fleetId,
        }),
      });

      if (!response.ok) {
        throw new Error(`GameLift request failed: ${response.statusText}`);
      }
    } catch (error: any) {
      console.error(`Failed to send ${action} to GameLift:`, error.message);
      // In development, continue without failing
    }
  }

  /**
   * Destroy the SDK
   */
  async destroy(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    this.processReady = false;
    this.initialized = false;
    this.currentGameSession = null;
  }
}

/**
 * Singleton instance for easy access
 */
export const ServerSDK = new GameServerSDK();

/**
 * Helper function to get server SDK
 */
export function getServerSDK(): GameServerSDK {
  return ServerSDK;
}
