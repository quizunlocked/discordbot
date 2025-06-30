import { execute } from '../../src/commands/admin/dashboard';

jest.mock('@/utils/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
jest.mock('@/services/DatabaseService', () => ({ databaseService: { prisma: { user: { count: jest.fn() }, quiz: { count: jest.fn(), findMany: jest.fn() }, question: { count: jest.fn() }, quizAttempt: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() }, score: { count: jest.fn() }, $queryRaw: jest.fn() } } }));
jest.mock('@/services/QuizService', () => ({ quizService: { getActiveSessionByChannel: jest.fn() } }));
jest.mock('@/services/ButtonCleanupService', () => ({ buttonCleanupService: {} }));

describe('dashboard command', () => {
  let interaction: any;
  beforeEach(() => {
    interaction = {
      isChatInputCommand: jest.fn().mockReturnValue(true),
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      channelId: 'test-channel',
      user: { id: 'user1', tag: 'user#1' },
      guild: { name: 'TestGuild' },
    };
  });

  it('should handle errors gracefully', async () => {
    interaction.deferReply.mockRejectedValue(new Error('fail'));
    await execute(interaction as any);
    expect(interaction.editReply).toHaveBeenCalled();
  });
}); 