import { execute } from '../../src/commands/leaderboard/leaderboard';

jest.mock('@/utils/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
jest.mock('@/services/LeaderboardService', () => ({ leaderboardService: { getLeaderboard: jest.fn(), createLeaderboardEmbed: jest.fn() } }));
jest.mock('@/services/ButtonCleanupService', () => ({ buttonCleanupService: { scheduleLeaderboardCleanup: jest.fn() } }));

describe('leaderboard command', () => {
  let interaction: any;
  beforeEach(() => {
    interaction = {
      isChatInputCommand: jest.fn().mockReturnValue(true),
      options: { getString: jest.fn(), getInteger: jest.fn() },
      reply: jest.fn().mockResolvedValue({ id: 'reply-id' }),
      followUp: jest.fn().mockResolvedValue(undefined),
      deferred: false,
      replied: false,
      isRepliable: jest.fn().mockReturnValue(true),
      channelId: 'test-channel',
      user: { id: 'user1', tag: 'user#1' },
      guild: { name: 'TestGuild' },
    };
  });

  it('should handle errors gracefully', async () => {
    jest.spyOn(require('@/services/LeaderboardService').leaderboardService, 'getLeaderboard').mockRejectedValue(new Error('fail'));
    await execute(interaction as any);
    expect(interaction.reply).toHaveBeenCalled();
  });
}); 