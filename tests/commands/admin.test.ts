import { vi, type MockedFunction } from 'vitest';
import { execute } from '../../app/commands/admin/admin';

vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/utils/permissions', () => ({ requireAdminPrivileges: vi.fn() }));
vi.mock('@/services/DatabaseService', () => ({
  databaseService: {
    prisma: {
      $queryRaw: vi.fn(),
      quiz: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      score: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    },
  },
}));
vi.mock('@/services/QuizService', () => ({
  quizService: { getActiveSessionByChannel: vi.fn(), stopQuiz: vi.fn() },
}));
vi.mock('@/services/ButtonCleanupService', () => ({ buttonCleanupService: {} }));

describe('admin command', () => {
  let interaction: any;
  let requireAdminPrivileges: MockedFunction<any>;

  beforeEach(async () => {
    const { requireAdminPrivileges: mockRequireAdminPrivileges } = await import(
      '../../app/utils/permissions'
    );
    requireAdminPrivileges = mockRequireAdminPrivileges as MockedFunction<any>;
    requireAdminPrivileges.mockClear();
    requireAdminPrivileges.mockResolvedValue(true);

    interaction = {
      isChatInputCommand: vi.fn().mockReturnValue(true),
      options: {
        getSubcommand: vi.fn(),
        getBoolean: vi.fn(),
        getString: vi.fn(),
        getUser: vi.fn(),
      },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      channelId: 'test-channel',
      channel: {
        isDMBased: vi.fn().mockReturnValue(false),
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
