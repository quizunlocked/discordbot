import { leaderboardService } from '../../src/services/LeaderboardService';
import { databaseService } from '../../src/services/DatabaseService';

// Mock the database service
jest.mock('../../src/services/DatabaseService', () => ({
  databaseService: {
    prisma: {
      score: {
        findMany: jest.fn(),
        upsert: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
      quizAttempt: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        groupBy: jest.fn(),
      },
    },
  },
}));

describe('LeaderboardService', () => {
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = (databaseService as any).prisma;
  });

  describe('updateScore', () => {
    it('should update existing score record', async () => {
      const existingScore = {
        id: 'score1',
        totalScore: 100,
        totalQuizzes: 2,
        bestTime: 60,
      };
      mockPrisma.score.findFirst.mockResolvedValueOnce(existingScore);
      mockPrisma.score.update.mockResolvedValueOnce({ id: 'score1' });

      await leaderboardService.updateScore('user123', 'weekly', 50, 30);

      expect(mockPrisma.score.findFirst).toHaveBeenCalled();
      expect(mockPrisma.score.update).toHaveBeenCalledWith({
        where: { id: 'score1' },
        data: {
          totalScore: 150,
          totalQuizzes: 3,
          averageScore: 50,
          bestTime: 30,
        },
      });
    });

    it('should create new score record when none exists', async () => {
      mockPrisma.score.findFirst.mockResolvedValueOnce(null);
      mockPrisma.score.create.mockResolvedValueOnce({ id: 'score1' });

      await leaderboardService.updateScore('user123', 'weekly', 100, 60);

      expect(mockPrisma.score.findFirst).toHaveBeenCalled();
      expect(mockPrisma.score.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user123',
          period: 'weekly',
          totalScore: 100,
          totalQuizzes: 1,
          averageScore: 100,
          bestTime: 60,
        }),
      });
    });
  });

  describe('getLeaderboard', () => {
    it('should get weekly leaderboard from quiz attempts', async () => {
      const mockAttempts = [
        {
          userId: 'user1',
          totalScore: 100,
          totalTime: 60,
          user: { username: 'User1' },
          questionAttempts: [],
        },
        {
          userId: 'user2',
          totalScore: 80,
          totalTime: 90,
          user: { username: 'User2' },
          questionAttempts: [],
        },
      ];
      mockPrisma.quizAttempt.findMany.mockResolvedValueOnce(mockAttempts);

      const result = await leaderboardService.getLeaderboard('weekly', 10);

      expect(result).toHaveLength(2);
      expect(result[0]?.userId).toBe('user1');
      expect(result[0]?.rank).toBe(1);
      expect(result[0]?.totalScore).toBe(100);
      expect(result[1]?.userId).toBe('user2');
      expect(result[1]?.rank).toBe(2);
      expect(result[1]?.totalScore).toBe(80);
    });

    it('should handle empty leaderboard', async () => {
      mockPrisma.quizAttempt.findMany.mockResolvedValueOnce([]);

      const result = await leaderboardService.getLeaderboard('weekly', 10);

      expect(result).toHaveLength(0);
    });

    it('should aggregate multiple attempts from same user', async () => {
      const mockAttempts = [
        {
          userId: 'user1',
          totalScore: 50,
          totalTime: 30,
          user: { username: 'User1' },
          questionAttempts: [],
        },
        {
          userId: 'user1',
          totalScore: 50,
          totalTime: 40,
          user: { username: 'User1' },
          questionAttempts: [],
        },
      ];
      mockPrisma.quizAttempt.findMany.mockResolvedValueOnce(mockAttempts);

      const result = await leaderboardService.getLeaderboard('weekly', 10);

      expect(result).toHaveLength(1);
      expect(result[0]?.userId).toBe('user1');
      expect(result[0]?.totalScore).toBe(100);
      expect(result[0]?.totalQuizzes).toBe(2);
      expect(result[0]?.averageScore).toBe(50);
      expect(result[0]?.bestTime).toBe(30); // Should be the better time
    });
  });

  describe('createLeaderboardEmbed', () => {
    it('should create weekly leaderboard embed', () => {
      const entries = [
        { userId: 'user1', username: 'User1', totalScore: 100, averageScore: 100, bestTime: 60, rank: 1, totalQuizzes: 1 },
        { userId: 'user2', username: 'User2', totalScore: 80, averageScore: 80, bestTime: 90, rank: 2, totalQuizzes: 1 },
      ];

      const embed = leaderboardService.createLeaderboardEmbed('weekly', entries, 1, 1);
      const embedData = embed.data;

      expect(embedData.title).toContain('📊 Quiz Leaderboard - Weekly');
      expect(embedData.fields?.[0]?.value).toContain('User1');
      expect(embedData.fields?.[0]?.value).toContain('User2');
    });

    it('should handle empty entries', () => {
      const embed = leaderboardService.createLeaderboardEmbed('weekly', [], 1, 1);
      const embedData = embed.data;

      expect(embedData.title).toContain('📊 Quiz Leaderboard - Weekly');
      expect(embedData.description).toContain('No quiz data available for this period.');
    });
  });

  describe('getUserStats', () => {
    it('should get user stats', async () => {
      const mockAttempts = [
        {
          userId: 'user1',
          totalScore: 100,
          totalTime: 60,
          user: { username: 'User1' },
          questionAttempts: [],
        },
      ];
      const mockGroupByResult = [
        { userId: 'user1', _sum: { totalScore: 100 } },
        { userId: 'user2', _sum: { totalScore: 80 } },
      ];
      
      mockPrisma.quizAttempt.findMany.mockResolvedValueOnce(mockAttempts);
      mockPrisma.quizAttempt.groupBy.mockResolvedValueOnce(mockGroupByResult);

      const result = await leaderboardService.getUserStats('user1');

      expect(result).not.toBeNull();
      if (result) {
        expect(result.totalScore).toBe(100);
        expect(result.totalQuizzes).toBe(1);
        expect(result.averageScore).toBe(100);
        expect(result.bestTime).toBe(60);
        expect(result.rank).toBe(1);
      }
    });

    it('should handle user with no stats', async () => {
      mockPrisma.quizAttempt.findMany.mockResolvedValueOnce([]);
      mockPrisma.quizAttempt.groupBy.mockResolvedValueOnce([]);

      const result = await leaderboardService.getUserStats('user1');

      expect(result).toBeNull();
    });
  });
}); 