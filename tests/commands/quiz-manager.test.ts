import { execute } from '../../src/commands/admin/quiz-manager';

jest.mock('@/utils/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
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
  beforeEach(() => {
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
}); 