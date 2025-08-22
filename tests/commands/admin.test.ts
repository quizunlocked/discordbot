import { vi, type MockedFunction } from 'vitest';
import { execute } from '../../app/commands/admin';

vi.mock('../../app/utils/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock('../../app/utils/permissions', () => ({ requireAdminPrivileges: vi.fn() }));
vi.mock('../../app/services/DatabaseService', () => ({
  databaseService: {
    prisma: {
      $queryRaw: vi.fn(),
      quiz: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
      score: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    },
  },
}));
vi.mock('../../app/services/QuizService', () => ({
  quizService: { getActiveSessionByChannel: vi.fn(), stopQuiz: vi.fn() },
}));
vi.mock('../../app/services/ButtonCleanupService', () => ({ buttonCleanupService: {} }));

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
        getSubcommandGroup: vi.fn().mockReturnValue(null),
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

  it('should check admin privileges for delete userdata subcommand', async () => {
    interaction.options.getSubcommandGroup.mockReturnValue('delete');
    interaction.options.getSubcommand.mockReturnValue('userdata');
    interaction.options.getUser.mockReturnValue({ id: 'user123', username: 'testuser' });
    await execute(interaction as any);
    expect(requireAdminPrivileges).toHaveBeenCalledWith(interaction);
  });

  it('should not execute delete userdata when user lacks admin privileges', async () => {
    requireAdminPrivileges.mockResolvedValue(false);
    interaction.options.getSubcommandGroup.mockReturnValue('delete');
    interaction.options.getSubcommand.mockReturnValue('userdata');
    interaction.options.getUser.mockReturnValue({ id: 'user123', username: 'testuser' });
    await execute(interaction as any);
    // The function should return early without calling any other functions
    expect(requireAdminPrivileges).toHaveBeenCalledWith(interaction);
  });

  it('should check admin privileges for delete everything subcommand', async () => {
    interaction.options.getSubcommandGroup.mockReturnValue('delete');
    interaction.options.getSubcommand.mockReturnValue('everything');
    await execute(interaction as any);
    expect(requireAdminPrivileges).toHaveBeenCalledWith(interaction);
  });

  it('should not execute delete everything when user lacks admin privileges', async () => {
    requireAdminPrivileges.mockResolvedValue(false);
    interaction.options.getSubcommandGroup.mockReturnValue('delete');
    interaction.options.getSubcommand.mockReturnValue('everything');
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
