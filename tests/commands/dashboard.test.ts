import { execute } from '../../app/commands/admin/dashboard';

vi.mock('../../app/utils/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock('../../app/services/DatabaseService', () => ({
  databaseService: {
    prisma: {
      user: { count: vi.fn() },
      quiz: { count: vi.fn(), findMany: vi.fn() },
      question: { count: vi.fn() },
      quizAttempt: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
      score: { count: vi.fn() },
      $queryRaw: vi.fn(),
    },
  },
}));
vi.mock('../../app/services/QuizService', () => ({
  quizService: { getActiveSessionByChannel: vi.fn() },
}));
vi.mock('../../app/services/ButtonCleanupService', () => ({ buttonCleanupService: {} }));

describe('dashboard command', () => {
  let interaction: any;
  beforeEach(() => {
    interaction = {
      isChatInputCommand: vi.fn().mockReturnValue(true),
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
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
