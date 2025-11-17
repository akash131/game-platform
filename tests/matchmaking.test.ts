import { MatchmakingSystem } from '../src/core/matchmaking';
import { PlayerManager } from '../src/core/player-manager';
import { GameType } from '../src/types/core.types';

describe('MatchmakingSystem', () => {
  let matchmaking: MatchmakingSystem;
  let playerManager: PlayerManager;

  beforeEach(() => {
    matchmaking = new MatchmakingSystem();
    playerManager = new PlayerManager();
  });

  describe('joinQueue', () => {
    it('should add player to queue', () => {
      const player = playerManager.createPlayer('TestPlayer');

      const ticket = matchmaking.joinQueue(player, GameType.FPS, {
        mode: 'deathmatch',
      });

      expect(ticket).toBeDefined();
      expect(ticket.playerId).toBe(player.id);
      expect(ticket.gameType).toBe(GameType.FPS);
    });

    it('should emit player:joined:queue event', (done) => {
      const player = playerManager.createPlayer('TestPlayer');

      matchmaking.on('player:joined:queue', (data) => {
        expect(data.player.id).toBe(player.id);
        done();
      });

      matchmaking.joinQueue(player, GameType.FPS);
    });

    it('should throw error if player already in queue', () => {
      const player = playerManager.createPlayer('TestPlayer');

      matchmaking.joinQueue(player, GameType.FPS);

      expect(() => {
        matchmaking.joinQueue(player, GameType.RACING);
      }).toThrow('Player is already in a queue');
    });
  });

  describe('leaveQueue', () => {
    it('should remove player from queue', () => {
      const player = playerManager.createPlayer('TestPlayer');

      const ticket = matchmaking.joinQueue(player, GameType.FPS);
      matchmaking.leaveQueue(player.id);

      const status = matchmaking.getQueueStatus(ticket.queueId);
      expect(status?.playersInQueue).toBe(0);
    });

    it('should emit player:left:queue event', (done) => {
      const player = playerManager.createPlayer('TestPlayer');

      matchmaking.joinQueue(player, GameType.FPS);

      matchmaking.on('player:left:queue', (data) => {
        expect(data.playerId).toBe(player.id);
        done();
      });

      matchmaking.leaveQueue(player.id);
    });
  });

  describe('getQueueStatus', () => {
    it('should return queue status', () => {
      const player = playerManager.createPlayer('TestPlayer');
      const ticket = matchmaking.joinQueue(player, GameType.FPS, { mode: 'deathmatch' });

      const status = matchmaking.getQueueStatus(ticket.queueId);

      expect(status).toBeDefined();
      expect(status?.gameType).toBe(GameType.FPS);
      expect(status?.playersInQueue).toBe(1);
    });

    it('should return undefined for non-existent queue', () => {
      const status = matchmaking.getQueueStatus('non-existent');
      expect(status).toBeUndefined();
    });
  });

  describe('matchmaking', () => {
    it('should create match when enough players join', (done) => {
      const players = [];
      for (let i = 0; i < 2; i++) {
        players.push(playerManager.createPlayer(`Player${i}`));
      }

      matchmaking.on('match:found', (lobby) => {
        expect(lobby.players).toHaveLength(2);
        expect(lobby.gameType).toBe(GameType.STRATEGY);
        done();
      });

      // Strategy games require 2 players
      players.forEach(player => {
        matchmaking.joinQueue(player, GameType.STRATEGY);
      });
    });
  });

  describe('acceptMatch', () => {
    it('should mark player as accepted', (done) => {
      const players = [];
      for (let i = 0; i < 2; i++) {
        players.push(playerManager.createPlayer(`Player${i}`));
      }

      matchmaking.on('match:found', (lobby) => {
        matchmaking.acceptMatch(lobby.id, players[0].id);

        const updatedLobby = matchmaking.getLobby(lobby.id);
        expect(updatedLobby?.acceptedPlayers).toContain(players[0].id);
        done();
      });

      players.forEach(player => {
        matchmaking.joinQueue(player, GameType.STRATEGY);
      });
    });

    it('should emit match:ready when all players accept', (done) => {
      const players = [];
      for (let i = 0; i < 2; i++) {
        players.push(playerManager.createPlayer(`Player${i}`));
      }

      matchmaking.on('match:found', (lobby) => {
        matchmaking.on('match:ready', (readyLobby) => {
          expect(readyLobby.status).toBe('ready');
          done();
        });

        matchmaking.acceptMatch(lobby.id, players[0].id);
        matchmaking.acceptMatch(lobby.id, players[1].id);
      });

      players.forEach(player => {
        matchmaking.joinQueue(player, GameType.STRATEGY);
      });
    });
  });

  describe('declineMatch', () => {
    it('should cancel match when player declines', (done) => {
      const players = [];
      for (let i = 0; i < 2; i++) {
        players.push(playerManager.createPlayer(`Player${i}`));
      }

      matchmaking.on('match:found', (lobby) => {
        matchmaking.on('match:cancelled', (data) => {
          expect(data.lobbyId).toBe(lobby.id);
          done();
        });

        matchmaking.declineMatch(lobby.id, players[0].id);
      });

      players.forEach(player => {
        matchmaking.joinQueue(player, GameType.STRATEGY);
      });
    });
  });
});
