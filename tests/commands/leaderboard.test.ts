import { vi } from 'vitest';
import { execute } from '../../app/commands/leaderboard/leaderboard';

vi.mock('../../app/utils/logger', () => ({ logger: { error: vi.fn(), info: vi.fn() } }));
vi.mock('../../app/services/LeaderboardService', () => ({
  leaderboardService: { getLeaderboard: vi.fn(), createLeaderboardEmbed: vi.fn() },
}));
vi.mock('../../app/services/ButtonCleanupService', () => ({
  buttonCleanupService: { scheduleLeaderboardCleanup: vi.fn() },
}));

describe('leaderboard command', () => {
  let interaction: any;
  beforeEach(() => {
    interaction = {
      isChatInputCommand: vi.fn().mockReturnValue(true),
      options: { getString: vi.fn(), getInteger: vi.fn() },
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue({ id: 'reply-id' }),
      followUp: vi.fn().mockResolvedValue(undefined),
      deferred: false,
      replied: false,
      isRepliable: vi.fn().mockReturnValue(true),
      channelId: 'test-channel',
      channel: {
        isDMBased: vi.fn().mockReturnValue(false),
      },
      user: { id: 'user1', tag: 'user#1' },
      guild: { name: 'TestGuild' },
    };
  });

  it('should handle errors gracefully', async () => {
    const { leaderboardService } = await import('../../app/services/LeaderboardService');
    vi.spyOn(leaderboardService, 'getLeaderboard').mockRejectedValue(new Error('fail'));
    await execute(interaction as any);
    expect(interaction.reply).toHaveBeenCalled();
  });

  it('should reject leaderboard commands in DM channels', async () => {
    // Mock DM channel
    interaction.channel.isDMBased.mockReturnValue(true);
    interaction.guild = null; // DM channels don't have guilds

    await execute(interaction as any);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content:
        '❌ Leaderboard commands can only be used in server channels, not in direct messages.',
    });
  });

  it('should reject leaderboard commands when guild is null', async () => {
    // Mock no guild context
    interaction.guild = null;

    await execute(interaction as any);

    expect(interaction.editReply).toHaveBeenCalledWith({
      content:
        '❌ Leaderboard commands can only be used in server channels, not in direct messages.',
    });
  });
});
