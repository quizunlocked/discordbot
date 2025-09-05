import { vi } from 'vitest';
import { execute } from '../../app/commands/stats';
import { leaderboardService } from '../../app/services/LeaderboardService';

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

  it('should display success rate correctly for various scenarios', async () => {
    // Test perfect score scenario
    vi.spyOn(leaderboardService, 'getUserStats').mockResolvedValue({
      totalScore: 100,
      totalQuizzes: 2,
      averageScore: 50,
      bestTime: 120,
      averageResponseTime: 15.5,
      rank: 1,
      correctAnswers: 10,
      totalAnswers: 10,
    });

    interaction.options.getUser.mockReturnValue(null);
    await execute(interaction as any);

    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          data: expect.objectContaining({
            fields: expect.arrayContaining([
              expect.objectContaining({
                name: '📈 Success Rate',
                value: '100%',
              }),
              expect.objectContaining({
                name: '✅ Correct Answers',
                value: '10/10',
              }),
            ]),
          }),
        }),
      ],
    });
  });

  it('should handle partial success rate correctly', async () => {
    // Test 75% success rate scenario
    vi.spyOn(leaderboardService, 'getUserStats').mockResolvedValue({
      totalScore: 75,
      totalQuizzes: 1,
      averageScore: 75,
      bestTime: 180,
      averageResponseTime: 20.0,
      rank: 2,
      correctAnswers: 6,
      totalAnswers: 8,
    });

    interaction.options.getUser.mockReturnValue(null);
    await execute(interaction as any);

    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          data: expect.objectContaining({
            fields: expect.arrayContaining([
              expect.objectContaining({
                name: '📈 Success Rate',
                value: '75%',
              }),
              expect.objectContaining({
                name: '✅ Correct Answers',
                value: '6/8',
              }),
            ]),
          }),
        }),
      ],
    });
  });

  it('should handle zero answers scenario', async () => {
    // Test zero answers scenario (quiz started but no questions answered)
    vi.spyOn(leaderboardService, 'getUserStats').mockResolvedValue({
      totalScore: 0,
      totalQuizzes: 1,
      averageScore: 0,
      bestTime: undefined,
      averageResponseTime: 0,
      rank: 10,
      correctAnswers: 0,
      totalAnswers: 0,
    });

    interaction.options.getUser.mockReturnValue(null);
    await execute(interaction as any);

    expect(interaction.editReply).toHaveBeenCalledWith({
      embeds: [
        expect.objectContaining({
          data: expect.objectContaining({
            fields: expect.arrayContaining([
              expect.objectContaining({
                name: '📈 Success Rate',
                value: '0%',
              }),
              expect.objectContaining({
                name: '✅ Correct Answers',
                value: '0/0',
              }),
            ]),
          }),
        }),
      ],
    });
  });
});
