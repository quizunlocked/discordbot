import { execute } from '../../src/commands/admin/admin';

jest.mock('@/utils/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
jest.mock('@/utils/permissions', () => ({ requireAdminPrivileges: jest.fn() }));
jest.mock('@/services/DatabaseService', () => ({ databaseService: { prisma: { $queryRaw: jest.fn(), quiz: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() }, score: { findFirst: jest.fn(), update: jest.fn(), create: jest.fn() } } } }));
jest.mock('@/services/QuizService', () => ({ quizService: { getActiveSessionByChannel: jest.fn(), stopQuiz: jest.fn() } }));
jest.mock('@/services/ButtonCleanupService', () => ({ buttonCleanupService: {} }));

describe('admin command', () => {
  let interaction: any;
  let requireAdminPrivileges: jest.MockedFunction<any>;

  beforeEach(() => {
    requireAdminPrivileges = require('@/utils/permissions').requireAdminPrivileges;
    requireAdminPrivileges.mockClear();
    requireAdminPrivileges.mockResolvedValue(true);
    
    interaction = {
      isChatInputCommand: jest.fn().mockReturnValue(true),
      options: { getSubcommand: jest.fn(), getBoolean: jest.fn(), getString: jest.fn(), getUser: jest.fn() },
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
      channelId: 'test-channel',
      channel: {
        isDMBased: jest.fn().mockReturnValue(false),
      },
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

  it('should check admin privileges for clear-user-data subcommand', async () => {
    interaction.options.getSubcommand.mockReturnValue('clear-user-data');
    interaction.options.getUser.mockReturnValue({ id: 'user123', username: 'testuser' });
    await execute(interaction as any);
    expect(requireAdminPrivileges).toHaveBeenCalledWith(interaction);
  });

  it('should not execute clear-user-data when user lacks admin privileges', async () => {
    requireAdminPrivileges.mockResolvedValue(false);
    interaction.options.getSubcommand.mockReturnValue('clear-user-data');
    interaction.options.getUser.mockReturnValue({ id: 'user123', username: 'testuser' });
    await execute(interaction as any);
    // The function should return early without calling any other functions
    expect(requireAdminPrivileges).toHaveBeenCalledWith(interaction);
  });

  it('should reject admin commands in DM channels', async () => {
    // Mock DM channel
    interaction.channel.isDMBased.mockReturnValue(true);
    interaction.guild = null; // DM channels don't have guilds
    interaction.options.getSubcommand.mockReturnValue('status');
    
    await execute(interaction as any);
    
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '❌ Admin commands can only be used in server channels, not in direct messages.',
    });
    // Should not proceed to handle the subcommand
    expect(requireAdminPrivileges).not.toHaveBeenCalled();
  });

  it('should reject admin commands when channel is null', async () => {
    // Mock null channel
    interaction.channel = null;
    interaction.options.getSubcommand.mockReturnValue('status');
    
    await execute(interaction as any);
    
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '❌ Admin commands can only be used in server channels, not in direct messages.',
    });
    // Should not proceed to handle the subcommand
    expect(requireAdminPrivileges).not.toHaveBeenCalled();
  });
}); 