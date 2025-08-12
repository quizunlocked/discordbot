import { vi, type MockedFunction } from 'vitest';
import { execute } from '../../src/commands/quiz/start';

vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/services/QuizService', () => ({
  quizService: { getActiveSessionByChannel: vi.fn(), startQuiz: vi.fn(), stopQuiz: vi.fn() },
}));
vi.mock('@/services/DatabaseService', () => ({
  databaseService: { prisma: { quiz: { findFirst: vi.fn() } } },
}));

describe('quiz start command', () => {
  let interaction: any;
  beforeEach(() => {
    interaction = {
      isChatInputCommand: vi.fn().mockReturnValue(true),
      options: {
        getSubcommand: vi.fn().mockReturnValue('start'),
        getString: vi.fn(),
        getInteger: vi.fn(),
        getBoolean: vi.fn(),
      },
      reply: vi.fn().mockResolvedValue(undefined),
      channel: {
        isDMBased: vi.fn().mockReturnValue(false),
      },
      channelId: 'test-channel',
      user: { id: 'user1', tag: 'user#1' },
      guild: { name: 'TestGuild' },
    };
  });

  it('should handle errors gracefully', async () => {
    const { quizService } = await import('../../src/services/QuizService');
    (quizService.getActiveSessionByChannel as MockedFunction<any>).mockImplementation(() => {
      throw new Error('fail');
    });
    await execute(interaction as any);
    expect(interaction.reply).toHaveBeenCalled();
  });
});
