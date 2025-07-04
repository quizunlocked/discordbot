import { execute } from '../../src/commands/leaderboard/stats';

describe('stats command', () => {
  let interaction: any;

  beforeEach(() => {
    interaction = {
      isChatInputCommand: jest.fn().mockReturnValue(true),
      deferReply: jest.fn().mockResolvedValue(undefined),
      editReply: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue(undefined),
      followUp: jest.fn().mockResolvedValue(undefined),
      deferred: false,
      replied: false,
      isRepliable: jest.fn().mockReturnValue(true),
      channel: {
        isDMBased: jest.fn().mockReturnValue(false),
      },
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

  it('should reject stats commands in DM channels', async () => {
    // Mock DM channel
    interaction.channel.isDMBased.mockReturnValue(true);
    interaction.guild = null; // DM channels don't have guilds
    
    await execute(interaction as any);
    
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '❌ Leaderboard commands can only be used in server channels, not in direct messages.',
    });
  });

  it('should reject stats commands when channel is null', async () => {
    // Mock null channel
    interaction.channel = null;
    
    await execute(interaction as any);
    
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '❌ Leaderboard commands can only be used in server channels, not in direct messages.',
    });
  });
}); 