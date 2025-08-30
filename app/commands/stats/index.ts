import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../../types/index.js';
import { leaderboardService } from '../../services/LeaderboardService.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('View your quiz statistics')
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('User to view stats for (defaults to yourself)')
      .setRequired(false)
  );

export const execute: Command['execute'] = async (interaction: CommandInteraction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    await interaction.deferReply();

    // Validate channel type - leaderboard commands must be run in guild channels
    if (!interaction.guild || !interaction.channel || interaction.channel.isDMBased()) {
      await interaction.editReply({
        content:
          '❌ Leaderboard commands can only be used in server channels, not in direct messages.',
      });
      return;
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const stats = await leaderboardService.getUserStats(targetUser.id);

    if (!stats) {
      const embed = new EmbedBuilder()
        .setTitle('📊 Quiz Statistics')
        .setDescription(`**${targetUser.username}** hasn't taken any quizzes yet.`)
        .setColor('#ff9900')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Calculate success rate based on actual question attempts
    const successRate =
      stats.totalAnswers > 0 ? Math.round((stats.correctAnswers / stats.totalAnswers) * 100) : 0;

    const embed = new EmbedBuilder()
      .setTitle('📊 Quiz Statistics')
      .setDescription(`Statistics for **${targetUser.username}**`)
      .setColor('#00ff00')
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp()
      .addFields(
        { name: '🏆 Total Score', value: stats.totalScore.toString(), inline: true },
        { name: '📝 Quizzes Taken', value: stats.totalQuizzes.toString(), inline: true },
        { name: '📊 Average Score', value: stats.averageScore.toString(), inline: true },
        { name: '🥇 Overall Rank', value: `#${stats.rank}`, inline: true },
        {
          name: '⏱️ Best Time',
          value: stats.bestTime
            ? `${Math.floor(stats.bestTime / 60)}m ${stats.bestTime % 60}s`
            : 'N/A',
          inline: true,
        },
        {
          name: '⚡ Avg Response Time',
          value: stats.averageResponseTime > 0 ? `${stats.averageResponseTime}s` : 'N/A',
          inline: true,
        },
        { name: '📈 Success Rate', value: `${successRate}%`, inline: true },
        {
          name: '✅ Correct Answers',
          value: `${stats.correctAnswers}/${stats.totalAnswers}`,
          inline: true,
        }
      );

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error executing stats command:', error);

    // Check if interaction is still valid before trying to reply
    if (interaction.isRepliable()) {
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: '❌ An error occurred while fetching your statistics. Please try again later.',
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: '❌ An error occurred while fetching your statistics. Please try again later.',
            ephemeral: true,
          });
        }
      } catch (replyError) {
        logger.error('Error sending error response:', replyError);
      }
    }
  }
};
