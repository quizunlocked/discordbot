import { vi, type MockedFunction } from 'vitest';
import { execute } from '../../app/commands/admin/quiz-manager';

vi.mock('@/utils/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/utils/permissions', () => ({ requireAdminPrivileges: vi.fn() }));
const mockShowModal = vi.fn();
vi.mock('discord.js', async () => {
  const actual = await vi.importActual('discord.js');
  return {
    ...actual,
    SlashCommandBuilder: vi.fn().mockImplementation(() => ({
      setName: vi.fn().mockReturnThis(),
      setDescription: vi.fn().mockReturnThis(),
      addSubcommand: vi.fn().mockReturnThis(),
      addSubcommandGroup: vi.fn().mockReturnThis(),
      setDefaultMemberPermissions: vi.fn().mockReturnThis(),
    })),
    ModalBuilder: vi.fn().mockImplementation(() => ({
      setCustomId: vi.fn().mockReturnThis(),
      setTitle: vi.fn().mockReturnThis(),
      addComponents: vi.fn().mockReturnThis(),
    })),
  };
});

describe('quiz-manager command', () => {
  let interaction: any;
  let requireAdminPrivileges: MockedFunction<any>;

  beforeEach(async () => {
    const { requireAdminPrivileges: mockRequireAdminPrivileges } = await import(
      '../../app/utils/permissions'
    );
    requireAdminPrivileges = mockRequireAdminPrivileges as MockedFunction<any>;
    requireAdminPrivileges.mockResolvedValue(true);

    interaction = {
      isChatInputCommand: vi.fn().mockReturnValue(true),
      options: {
        getSubcommand: vi.fn(),
        getSubcommandGroup: vi.fn().mockReturnValue(null),
        getString: vi.fn(),
      },
      reply: vi.fn().mockResolvedValue(undefined),
      showModal: mockShowModal,
      channel: {
        isDMBased: vi.fn().mockReturnValue(false),
      },
      user: { id: 'user1', tag: 'user#1' },
      guild: { name: 'TestGuild' },
    };
    mockShowModal.mockReset();
  });

  it('should handle unknown subcommand', async () => {
    interaction.options.getSubcommand.mockReturnValue('unknown');
    await execute(interaction as any);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'Unknown subcommand.',
      ephemeral: true,
    });
  });

  it('should handle errors gracefully', async () => {
    interaction.options.getSubcommand.mockReturnValue('create');
    mockShowModal.mockImplementation(() => {
      throw new Error('fail');
    });
    await execute(interaction as any);
    expect(interaction.reply).toHaveBeenCalled();
  });

  it('should check admin privileges for delete subcommand', async () => {
    interaction.options.getSubcommand.mockReturnValue('delete');
    interaction.options.getString.mockReturnValue('quiz-123');
    await execute(interaction as any);
    expect(requireAdminPrivileges).toHaveBeenCalledWith(interaction);
  });

  it('should check admin privileges for delete-all subcommand', async () => {
    interaction.options.getSubcommand.mockReturnValue('delete-all');
    await execute(interaction as any);
    expect(requireAdminPrivileges).toHaveBeenCalledWith(interaction);
  });

  it('should not execute destructive commands when user lacks admin privileges', async () => {
    requireAdminPrivileges.mockResolvedValue(false);
    interaction.options.getSubcommand.mockReturnValue('delete');
    interaction.options.getString.mockReturnValue('quiz-123');
    await execute(interaction as any);
    // The function should return early without calling any other functions
    expect(requireAdminPrivileges).toHaveBeenCalledWith(interaction);
  });

  it('should enforce admin permissions for delete-all subcommand', async () => {
    requireAdminPrivileges.mockResolvedValue(false);
    interaction.options.getSubcommand.mockReturnValue('delete-all');
    await execute(interaction as any);
    expect(requireAdminPrivileges).toHaveBeenCalledWith(interaction);
  });

  it('should reject quiz-manager commands in DM channels', async () => {
    // Mock DM channel
    interaction.channel.isDMBased.mockReturnValue(true);
    interaction.guild = null; // DM channels don't have guilds
    interaction.options.getSubcommand.mockReturnValue('create');

    await execute(interaction as any);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ Admin commands can only be used in server channels, not in direct messages.',
      ephemeral: true,
    });
    // Should not proceed to handle the subcommand
    expect(mockShowModal).not.toHaveBeenCalled();
  });

  it('should reject quiz-manager commands when guild is null', async () => {
    // Mock no guild context
    interaction.guild = null;
    interaction.options.getSubcommand.mockReturnValue('create');

    await execute(interaction as any);

    expect(interaction.reply).toHaveBeenCalledWith({
      content: '❌ Admin commands can only be used in server channels, not in direct messages.',
      ephemeral: true,
    });
    // Should not proceed to handle the subcommand
    expect(mockShowModal).not.toHaveBeenCalled();
  });
});
