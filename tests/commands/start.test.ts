import { execute } from '../../src/commands/quiz/start';

jest.mock('@/utils/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
jest.mock('@/services/QuizService', () => ({ quizService: { getActiveSessionByChannel: jest.fn(), startQuiz: jest.fn(), stopQuiz: jest.fn() } }));
jest.mock('@/services/DatabaseService', () => ({ databaseService: { prisma: { quiz: { findFirst: jest.fn() } } } }));

describe('quiz start command', () => {
  let interaction: any;
  beforeEach(() => {
    interaction = {
      isChatInputCommand: jest.fn().mockReturnValue(true),
      options: {
        getSubcommand: jest.fn().mockReturnValue('start'),
        getString: jest.fn(),
        getInteger: jest.fn(),
        getBoolean: jest.fn(),
      },
      reply: jest.fn().mockResolvedValue(undefined),
      channel: {},
      channelId: 'test-channel',
      user: { id: 'user1', tag: 'user#1' },
      guild: { name: 'TestGuild' },
    };
  });

  it('should handle errors gracefully', async () => {
    const quizService = require('@/services/QuizService').quizService;
    quizService.getActiveSessionByChannel.mockImplementation(() => { throw new Error('fail'); });
    await execute(interaction as any);
    expect(interaction.reply).toHaveBeenCalled();
  });
}); 