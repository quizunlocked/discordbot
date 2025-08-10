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

  // REGRESSION TESTS FOR FIXES MADE ON 2025-08-10
  describe('Pagination and Ranking Regression Tests', () => {
    describe('should handle pagination correctly with more than 10 users', () => {
      it('should show correct ranks across pages (pagination fix)', async () => {
        // Create 15 mock users with different scores
        const mockAttempts = Array.from({ length: 15 }, (_, i) => ({
          userId: `user${i + 1}`,
          totalScore: 150 - (i * 5), // Descending scores: 150, 145, 140, ..., 85
          totalTime: 60 + (i * 2),   // Ascending times: 60, 62, 64, ..., 88
          user: { username: `User${i + 1}` },
          questionAttempts: [],
        }));
        
        // Mock for both calls to getLeaderboard
        mockPrisma.quizAttempt.findMany.mockResolvedValueOnce(mockAttempts);
        mockPrisma.quizAttempt.findMany.mockResolvedValueOnce(mockAttempts);

        // Test first page (limit 10)
        const page1 = await leaderboardService.getLeaderboard('weekly', 10);
        expect(page1).toHaveLength(10);
        expect(page1[0]?.rank).toBe(1);   // First place
        expect(page1[0]?.userId).toBe('user1');
        expect(page1[0]?.totalScore).toBe(150);
        expect(page1[9]?.rank).toBe(10);  // 10th place
        expect(page1[9]?.userId).toBe('user10');
        expect(page1[9]?.totalScore).toBe(105);

        // Test second page (limit 15 to get all, but we'll simulate page 2)
        const allUsers = await leaderboardService.getLeaderboard('weekly', 15);
        expect(allUsers).toHaveLength(15);
        
        // Simulate page 2 (items 11-15)
        const page2 = allUsers.slice(10);
        expect(page2).toHaveLength(5);
        expect(page2[0]?.rank).toBe(11);  // 11th place (not rank 1!)
        expect(page2[0]?.userId).toBe('user11');
        expect(page2[0]?.totalScore).toBe(100);
        expect(page2[4]?.rank).toBe(15);  // 15th place
        expect(page2[4]?.userId).toBe('user15');
        expect(page2[4]?.totalScore).toBe(80);
      });

      it('should maintain correct ranking order with tied scores', async () => {
        const mockAttempts = [
          // Three users with same score - order will be preserved as-is since no secondary sorting
          { userId: 'user1', totalScore: 100, totalTime: 60, user: { username: 'User1' }, questionAttempts: [] },
          { userId: 'user2', totalScore: 100, totalTime: 50, user: { username: 'User2' }, questionAttempts: [] },
          { userId: 'user3', totalScore: 100, totalTime: 70, user: { username: 'User3' }, questionAttempts: [] },
          { userId: 'user4', totalScore: 90,  totalTime: 40, user: { username: 'User4' }, questionAttempts: [] },
        ];
        
        mockPrisma.quizAttempt.findMany.mockResolvedValueOnce(mockAttempts);

        const result = await leaderboardService.getLeaderboard('weekly', 10);
        
        expect(result).toHaveLength(4);
        // All users with score 100 should be ranked 1-3, user with 90 should be ranked 4
        expect(result[0]?.totalScore).toBe(100);
        expect(result[0]?.rank).toBe(1);
        expect(result[1]?.totalScore).toBe(100);
        expect(result[1]?.rank).toBe(2);
        expect(result[2]?.totalScore).toBe(100);
        expect(result[2]?.rank).toBe(3);
        expect(result[3]?.totalScore).toBe(90);
        expect(result[3]?.rank).toBe(4);
        expect(result[3]?.userId).toBe('user4'); // Lower score user
      });
    });

    describe('should show correct count with less than 10 users', () => {
      it('should return all users when less than limit', async () => {
        const mockAttempts = Array.from({ length: 7 }, (_, i) => ({
          userId: `user${i + 1}`,
          totalScore: 100 - (i * 10), // 100, 90, 80, 70, 60, 50, 40
          totalTime: 60,
          user: { username: `User${i + 1}` },
          questionAttempts: [],
        }));
        
        mockPrisma.quizAttempt.findMany.mockResolvedValueOnce(mockAttempts);

        const result = await leaderboardService.getLeaderboard('weekly', 10);
        
        expect(result).toHaveLength(7); // Should return exactly 7 users, not 10
        expect(result[0]?.rank).toBe(1);
        expect(result[0]?.totalScore).toBe(100);
        expect(result[6]?.rank).toBe(7);
        expect(result[6]?.totalScore).toBe(40);
      });

      it('should handle single user correctly', async () => {
        const mockAttempts = [{
          userId: 'user1',
          totalScore: 100,
          totalTime: 60,
          user: { username: 'SingleUser' },
          questionAttempts: [],
        }];
        
        mockPrisma.quizAttempt.findMany.mockResolvedValueOnce(mockAttempts);

        const result = await leaderboardService.getLeaderboard('weekly', 10);
        
        expect(result).toHaveLength(1);
        expect(result[0]?.rank).toBe(1);
        expect(result[0]?.username).toBe('SingleUser');
        expect(result[0]?.totalScore).toBe(100);
      });
    });

    describe('should handle edge cases that could cause regressions', () => {
      it('should handle users with multiple quiz attempts correctly', async () => {
        // User1 has 3 attempts, User2 has 2 attempts, User3 has 1 attempt
        const mockAttempts = [
          { userId: 'user1', totalScore: 50,  totalTime: 30, user: { username: 'User1' }, questionAttempts: [] },
          { userId: 'user1', totalScore: 60,  totalTime: 25, user: { username: 'User1' }, questionAttempts: [] },
          { userId: 'user1', totalScore: 40,  totalTime: 35, user: { username: 'User1' }, questionAttempts: [] },
          { userId: 'user2', totalScore: 80,  totalTime: 45, user: { username: 'User2' }, questionAttempts: [] },
          { userId: 'user2', totalScore: 70,  totalTime: 40, user: { username: 'User2' }, questionAttempts: [] },
          { userId: 'user3', totalScore: 100, totalTime: 60, user: { username: 'User3' }, questionAttempts: [] },
        ];
        
        mockPrisma.quizAttempt.findMany.mockResolvedValueOnce(mockAttempts);

        const result = await leaderboardService.getLeaderboard('weekly', 10);
        
        expect(result).toHaveLength(3);
        
        // Check aggregation and ranking
        expect(result[0]?.rank).toBe(1);
        expect(result[0]?.userId).toBe('user1');
        expect(result[0]?.totalScore).toBe(150); // 50 + 60 + 40
        expect(result[0]?.totalQuizzes).toBe(3);
        expect(result[0]?.averageScore).toBe(50); // 150 / 3
        expect(result[0]?.bestTime).toBe(25); // Best of 30, 25, 35
        
        expect(result[1]?.rank).toBe(2);
        expect(result[1]?.userId).toBe('user2');
        expect(result[1]?.totalScore).toBe(150); // 80 + 70
        expect(result[1]?.totalQuizzes).toBe(2);
        expect(result[1]?.averageScore).toBe(75); // 150 / 2
        expect(result[1]?.bestTime).toBe(40); // Best of 45, 40
        
        expect(result[2]?.rank).toBe(3);
        expect(result[2]?.userId).toBe('user3');
        expect(result[2]?.totalScore).toBe(100);
        expect(result[2]?.totalQuizzes).toBe(1);
        expect(result[2]?.averageScore).toBe(100);
        expect(result[2]?.bestTime).toBe(60);
      });

      it('should handle limit boundaries correctly', async () => {
        // Test with exactly 10 users
        const mockAttempts = Array.from({ length: 10 }, (_, i) => ({
          userId: `user${i + 1}`,
          totalScore: 100 - i,
          totalTime: 60,
          user: { username: `User${i + 1}` },
          questionAttempts: [],
        }));
        
        mockPrisma.quizAttempt.findMany.mockResolvedValueOnce(mockAttempts);

        const result = await leaderboardService.getLeaderboard('weekly', 10);
        
        expect(result).toHaveLength(10);
        expect(result[0]?.rank).toBe(1);
        expect(result[0]?.totalScore).toBe(100);
        expect(result[9]?.rank).toBe(10);
        expect(result[9]?.totalScore).toBe(91);
      });
    });
  });
}); 