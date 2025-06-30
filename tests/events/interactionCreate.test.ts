import { execute } from '../../src/events/interactionCreate';

jest.mock('@/utils/logger', () => ({ logger: { error: jest.fn() } }));
jest.mock('@/services/QuizService', () => ({ quizService: { handleButtonInteraction: jest.fn() } }));

describe('interactionCreate event', () => {
  it('should handle button interaction', async () => {
    const interaction = {
      isButton: jest.fn().mockReturnValue(true),
      isModalSubmit: jest.fn().mockReturnValue(false),
      isRepliable: jest.fn().mockReturnValue(false),
    };
    await execute(interaction as any);
    expect(interaction.isButton).toHaveBeenCalled();
  });

  it('should handle modal submit interaction', async () => {
    const interaction = {
      isButton: jest.fn().mockReturnValue(false),
      isModalSubmit: jest.fn().mockReturnValue(true),
      isRepliable: jest.fn().mockReturnValue(false),
    };
    await execute(interaction as any);
    expect(interaction.isModalSubmit).toHaveBeenCalled();
  });

  it('should handle errors and reply if repliable', async () => {
    const interaction = {
      isButton: jest.fn().mockImplementation(() => { throw new Error('fail'); }),
      isModalSubmit: jest.fn().mockReturnValue(false),
      isRepliable: jest.fn().mockReturnValue(true),
      replied: false,
      deferred: false,
      reply: jest.fn().mockResolvedValue(undefined),
      followUp: jest.fn().mockResolvedValue(undefined),
    };
    await execute(interaction as any);
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'There was an error while processing your request.', ephemeral: true });
  });
}); 