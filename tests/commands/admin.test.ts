import { execute } from '../../src/commands/admin/admin';

jest.mock('@/utils/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
jest.mock('@/services/DatabaseService', () => ({ databaseService: { prisma: { $queryRaw: jest.fn(), quiz: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() }, score: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() } } } }));
jest.mock('@/services/QuizService', () => ({ quizService: { getActiveSessionByChannel: jest.fn(), stopQuiz: jest.fn() } }));
jest.mock('@/services/ButtonCleanupService', () => ({ buttonCleanupService: {} }));

describe('admin command', () => {
  let interaction: any;
  beforeEach(() => {
    interaction = {
      isChatInputCommand: jest.fn().mockReturnValue(true),
      options: { getSubcommand: jest.fn(), getBoolean: jest.fn(), getString: jest.fn(), getUser: jest.fn() },
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
      channelId: 'test-channel',
      user: { id: 'user1', tag: 'user#1' },
      guild: { name: 'TestGuild' },
    };
  });

  it('should handle unknown subcommand', async () => {
    interaction.options.getSubcommand.mockReturnValue('unknown');
    await execute(interaction as any);
    expect(interaction.editReply).toHaveBeenCalledWith('Unknown subcommand.');
  });

  it('should handle errors gracefully', async () => {
    interaction.options.getSubcommand.mockReturnValue('status');
    interaction.deferReply.mockRejectedValue(new Error('fail'));
    await execute(interaction as any);
    expect(interaction.editReply).toHaveBeenCalled();
  });
}); 