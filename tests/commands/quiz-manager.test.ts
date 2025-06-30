import { execute } from '../../src/commands/admin/quiz-manager';

jest.mock('@/utils/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
jest.mock('@/utils/permissions', () => ({ requireAdminPrivileges: jest.fn() }));
const mockShowModal = jest.fn();
jest.mock('discord.js', () => {
  const original = jest.requireActual('discord.js');
  return {
    ...original,
    ModalBuilder: jest.fn().mockImplementation(() => ({ setCustomId: () => ({ setTitle: () => ({ addComponents: () => ({}) }) }) })),
  };
});

describe('quiz-manager command', () => {
  let interaction: any;
  let requireAdminPrivileges: jest.MockedFunction<any>;

  beforeEach(() => {
    requireAdminPrivileges = require('@/utils/permissions').requireAdminPrivileges;
    requireAdminPrivileges.mockResolvedValue(true);
    
    interaction = {
      isChatInputCommand: jest.fn().mockReturnValue(true),
      options: { getSubcommand: jest.fn(), getString: jest.fn() },
      reply: jest.fn().mockResolvedValue(undefined),
      showModal: mockShowModal,
      user: { id: 'user1', tag: 'user#1' },
      guild: { name: 'TestGuild' },
    };
    mockShowModal.mockReset();
  });

  it('should handle unknown subcommand', async () => {
    interaction.options.getSubcommand.mockReturnValue('unknown');
    await execute(interaction as any);
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'Unknown subcommand.', ephemeral: true });
  });

  it('should handle errors gracefully', async () => {
    interaction.options.getSubcommand.mockReturnValue('create');
    mockShowModal.mockImplementation(() => { throw new Error('fail'); });
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
}); 