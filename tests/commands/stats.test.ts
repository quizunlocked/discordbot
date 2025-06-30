import { execute } from '../../src/commands/leaderboard/stats';

describe('stats command', () => {
  let interaction: any;

  beforeEach(() => {
    interaction = {
      isChatInputCommand: jest.fn().mockReturnValue(true),
      editReply: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
      followUp: jest.fn().mockResolvedValue(undefined),
      deferred: false,
      replied: false,
      isRepliable: jest.fn().mockReturnValue(true),
      user: { id: 'user1', tag: 'user#1', username: 'user1', displayAvatarURL: jest.fn() },
      guild: { name: 'TestGuild' },
      options: { getUser: jest.fn() },
    };
  });

  it('should handle errors gracefully', async () => {
    jest.spyOn(require('@/services/LeaderboardService').leaderboardService, 'getUserStats').mockRejectedValue(new Error('fail'));
    await execute(interaction as any);
    expect(interaction.reply).toHaveBeenCalled();
  });
}); 