import { SessionManager } from '../src/core/session-manager';
import { NvidiaGeForceProvider } from '../src/providers/nvidia.provider';
import { GameType, SessionStatus } from '../src/types/core.types';

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let provider: NvidiaGeForceProvider;

  beforeEach(async () => {
    sessionManager = new SessionManager();
    provider = new NvidiaGeForceProvider();
    await provider.initialize();
    sessionManager.registerProvider(provider);
  });

  describe('registerProvider', () => {
    it('should register a provider', () => {
      const stats = sessionManager.getStatistics();
      expect(stats).toBeDefined();
    });
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      const session = await sessionManager.createSession(
        GameType.FPS,
        ['player1', 'player2'],
        {
          maxPlayers: 10,
          difficulty: 'normal',
          mode: 'deathmatch',
        }
      );

      expect(session).toBeDefined();
      expect(session.gameType).toBe(GameType.FPS);
      expect(session.players).toHaveLength(2);
      expect(session.status).toBe(SessionStatus.ACTIVE);
    });

    it('should emit session:created event', (done) => {
      sessionManager.on('session:created', (session) => {
        expect(session.gameType).toBe(GameType.FPS);
        done();
      });

      sessionManager.createSession(
        GameType.FPS,
        ['player1'],
        {
          maxPlayers: 10,
          difficulty: 'normal',
          mode: 'deathmatch',
        }
      );
    });

    it('should throw error if no provider supports game type', async () => {
      // MOBA not supported by NvidiaGeForceProvider
      await expect(
        sessionManager.createSession(
          GameType.MOBA,
          ['player1', 'player2'],
          {
            maxPlayers: 10,
            difficulty: 'normal',
            mode: '5v5',
          }
        )
      ).rejects.toThrow('No suitable provider found');
    });
  });

  describe('getSession', () => {
    it('should get session by ID', async () => {
      const created = await sessionManager.createSession(
        GameType.FPS,
        ['player1'],
        {
          maxPlayers: 10,
          difficulty: 'normal',
          mode: 'deathmatch',
        }
      );

      const retrieved = sessionManager.getSession(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return undefined for non-existent session', () => {
      const session = sessionManager.getSession('non-existent-id');
      expect(session).toBeUndefined();
    });
  });

  describe('endSession', () => {
    it('should end a session', async () => {
      const session = await sessionManager.createSession(
        GameType.FPS,
        ['player1'],
        {
          maxPlayers: 10,
          difficulty: 'normal',
          mode: 'deathmatch',
        }
      );

      await sessionManager.endSession(session.id);

      const updated = sessionManager.getSession(session.id);
      expect(updated?.status).toBe(SessionStatus.COMPLETED);
      expect(updated?.endTime).toBeDefined();
    });

    it('should emit session:ended event', (done) => {
      sessionManager.createSession(
        GameType.FPS,
        ['player1'],
        {
          maxPlayers: 10,
          difficulty: 'normal',
          mode: 'deathmatch',
        }
      ).then((session) => {
        sessionManager.on('session:ended', (endedSession) => {
          expect(endedSession.id).toBe(session.id);
          done();
        });

        sessionManager.endSession(session.id);
      });
    });
  });

  describe('getActiveSessions', () => {
    it('should return only active sessions', async () => {
      const session1 = await sessionManager.createSession(
        GameType.FPS,
        ['player1'],
        {
          maxPlayers: 10,
          difficulty: 'normal',
          mode: 'deathmatch',
        }
      );

      const session2 = await sessionManager.createSession(
        GameType.RACING,
        ['player2'],
        {
          maxPlayers: 10,
          difficulty: 'normal',
          mode: 'circuit',
        }
      );

      await sessionManager.endSession(session1.id);

      const activeSessions = sessionManager.getActiveSessions();
      expect(activeSessions).toHaveLength(1);
      expect(activeSessions[0].id).toBe(session2.id);
    });
  });

  describe('getStatistics', () => {
    it('should return platform statistics', async () => {
      await sessionManager.createSession(
        GameType.FPS,
        ['player1', 'player2'],
        {
          maxPlayers: 10,
          difficulty: 'normal',
          mode: 'deathmatch',
        }
      );

      const stats = sessionManager.getStatistics();

      expect(stats.totalSessions).toBe(1);
      expect(stats.activeSessions).toBe(1);
      expect(stats.totalPlayers).toBe(2);
    });
  });
});
