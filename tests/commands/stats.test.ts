import { vi } from 'vitest';
import { execute } from '../../src/commands/leaderboard/stats';

describe('stats command', () => {
  let interaction: any;

  beforeEach(() => {
    interaction = {
      isChatInputCommand: vi.fn().mockReturnValue(true),
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      deferred: false,
      replied: false,
      isRepliable: vi.fn().mockReturnValue(true),
      channel: {
        isDMBased: vi.fn().mockReturnValue(false),
      },
      user: { id: 'user1', tag: 'user#1', username: 'user1', displayAvatarURL: vi.fn() },
      guild: { name: 'TestGuild' },
      options: { getUser: vi.fn() },
    };
  });

  it('should handle errors gracefully', async () => {
    const { leaderboardService } = await import('../../src/services/LeaderboardService');
    vi.spyOn(leaderboardService, 'getUserStats').mockRejectedValue(new Error('fail'));
    await execute(interaction as any);
    expect(interaction.reply).toHaveBeenCalled();
  });

  it('should reject stats commands in DM channels', async () => {
    // Mock DM channel
    interaction.channel.isDMBased.mockReturnValue(true);
    interaction.guild = null; // DM channels don't have guilds

    await execute(interaction as any);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content:
        '❌ Leaderboard commands can only be used in server channels, not in direct messages.',
    });
  });

  it('should reject stats commands when channel is null', async () => {
    // Mock null channel
    interaction.channel = null;

    await execute(interaction as any);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content:
        '❌ Leaderboard commands can only be used in server channels, not in direct messages.',
    });
  });
});
