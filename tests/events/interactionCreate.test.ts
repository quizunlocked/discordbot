import { execute } from '../../app/events/interactionCreate';

vi.mock('../../app/utils/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('../../app/services/QuizService', () => ({
  quizService: { handleButtonInteraction: vi.fn() },
}));

describe('interactionCreate event', () => {
  it('should handle button interaction', async () => {
    const interaction = {
      isAutocomplete: vi.fn().mockReturnValue(false),
      isButton: vi.fn().mockReturnValue(true),
      isModalSubmit: vi.fn().mockReturnValue(false),
      isRepliable: vi.fn().mockReturnValue(false),
    };
    await execute(interaction as any);
    expect(interaction.isButton).toHaveBeenCalled();
  });

  it('should handle modal submit interaction', async () => {
    const interaction = {
      isAutocomplete: vi.fn().mockReturnValue(false),
      isButton: vi.fn().mockReturnValue(false),
      isModalSubmit: vi.fn().mockReturnValue(true),
      isRepliable: vi.fn().mockReturnValue(false),
    };
    await execute(interaction as any);
    expect(interaction.isModalSubmit).toHaveBeenCalled();
  });

  it('should handle errors and reply if repliable', async () => {
    const interaction = {
      isAutocomplete: vi.fn().mockReturnValue(false),
      isButton: vi.fn().mockImplementation(() => {
        throw new Error('fail');
      }),
      isModalSubmit: vi.fn().mockReturnValue(false),
      isRepliable: vi.fn().mockReturnValue(true),
      replied: false,
      deferred: false,
      reply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
    };
    await execute(interaction as any);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'There was an error while processing your request.',
      ephemeral: true,
    });
  });
});
