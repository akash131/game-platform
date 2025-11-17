import { PlayerManager } from '../src/core/player-manager';
import { Player } from '../src/types/core.types';

describe('PlayerManager', () => {
  let playerManager: PlayerManager;

  beforeEach(() => {
    playerManager = new PlayerManager();
  });

  describe('createPlayer', () => {
    it('should create a new player', () => {
      const player = playerManager.createPlayer('TestPlayer');

      expect(player).toBeDefined();
      expect(player.username).toBe('TestPlayer');
      expect(player.level).toBe(1);
      expect(player.experience).toBe(0);
      expect(player.stats.gamesPlayed).toBe(0);
    });

    it('should throw error for duplicate username', () => {
      playerManager.createPlayer('TestPlayer');

      expect(() => {
        playerManager.createPlayer('TestPlayer');
      }).toThrow('Username TestPlayer already exists');
    });

    it('should emit player:created event', (done) => {
      playerManager.on('player:created', (player: Player) => {
        expect(player.username).toBe('TestPlayer');
        done();
      });

      playerManager.createPlayer('TestPlayer');
    });
  });

  describe('getPlayer', () => {
    it('should get player by ID', () => {
      const created = playerManager.createPlayer('TestPlayer');
      const retrieved = playerManager.getPlayer(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return undefined for non-existent player', () => {
      const player = playerManager.getPlayer('non-existent-id');
      expect(player).toBeUndefined();
    });
  });

  describe('getPlayerByUsername', () => {
    it('should get player by username', () => {
      playerManager.createPlayer('TestPlayer');
      const player = playerManager.getPlayerByUsername('TestPlayer');

      expect(player).toBeDefined();
      expect(player?.username).toBe('TestPlayer');
    });

    it('should return undefined for non-existent username', () => {
      const player = playerManager.getPlayerByUsername('NonExistent');
      expect(player).toBeUndefined();
    });
  });

  describe('awardExperience', () => {
    it('should award experience to player', () => {
      const player = playerManager.createPlayer('TestPlayer');
      playerManager.awardExperience(player.id, 50);

      const updated = playerManager.getPlayer(player.id);
      expect(updated?.experience).toBe(50);
    });

    it('should level up player when experience threshold reached', (done) => {
      const player = playerManager.createPlayer('TestPlayer');

      playerManager.on('player:level:up', (data) => {
        expect(data.newLevel).toBe(2);
        done();
      });

      playerManager.awardExperience(player.id, 100);
    });

    it('should reset experience after level up', () => {
      const player = playerManager.createPlayer('TestPlayer');
      playerManager.awardExperience(player.id, 150);

      const updated = playerManager.getPlayer(player.id);
      expect(updated?.level).toBe(2);
      expect(updated?.experience).toBe(50); // 150 - 100 (level 1 requirement)
    });
  });

  describe('recordGameResult', () => {
    it('should record a win', () => {
      const player = playerManager.createPlayer('TestPlayer');
      playerManager.recordGameResult(player.id, true, 100);

      const updated = playerManager.getPlayer(player.id);
      expect(updated?.stats.gamesPlayed).toBe(1);
      expect(updated?.stats.wins).toBe(1);
      expect(updated?.stats.losses).toBe(0);
    });

    it('should record a loss', () => {
      const player = playerManager.createPlayer('TestPlayer');
      playerManager.recordGameResult(player.id, false, 50);

      const updated = playerManager.getPlayer(player.id);
      expect(updated?.stats.gamesPlayed).toBe(1);
      expect(updated?.stats.wins).toBe(0);
      expect(updated?.stats.losses).toBe(1);
    });

    it('should update average score', () => {
      const player = playerManager.createPlayer('TestPlayer');
      playerManager.recordGameResult(player.id, true, 100);
      playerManager.recordGameResult(player.id, true, 200);

      const updated = playerManager.getPlayer(player.id);
      expect(updated?.stats.averageScore).toBe(150);
    });
  });

  describe('getTopPlayers', () => {
    it('should return top players by level', () => {
      const player1 = playerManager.createPlayer('Player1');
      const player2 = playerManager.createPlayer('Player2');
      const player3 = playerManager.createPlayer('Player3');

      playerManager.awardExperience(player1.id, 100); // Level 2
      playerManager.awardExperience(player2.id, 300); // Level 4
      playerManager.awardExperience(player3.id, 200); // Level 3

      const topPlayers = playerManager.getTopPlayers(3);

      expect(topPlayers).toHaveLength(3);
      expect(topPlayers[0].username).toBe('Player2');
      expect(topPlayers[1].username).toBe('Player3');
      expect(topPlayers[2].username).toBe('Player1');
    });

    it('should limit results to specified count', () => {
      playerManager.createPlayer('Player1');
      playerManager.createPlayer('Player2');
      playerManager.createPlayer('Player3');

      const topPlayers = playerManager.getTopPlayers(2);
      expect(topPlayers).toHaveLength(2);
    });
  });

  describe('achievements', () => {
    it('should award first win achievement', (done) => {
      const player = playerManager.createPlayer('TestPlayer');

      playerManager.on('player:achievement:unlocked', (data) => {
        expect(data.achievement.id).toBe('first_win');
        expect(data.achievement.name).toBe('First Victory');
        done();
      });

      playerManager.recordGameResult(player.id, true, 100);
    });

    it('should not award duplicate achievements', () => {
      const player = playerManager.createPlayer('TestPlayer');
      let achievementCount = 0;

      playerManager.on('player:achievement:unlocked', () => {
        achievementCount++;
      });

      playerManager.recordGameResult(player.id, true, 100);
      playerManager.recordGameResult(player.id, true, 100);

      expect(achievementCount).toBe(1); // Only first win should trigger achievement
    });
  });
});
