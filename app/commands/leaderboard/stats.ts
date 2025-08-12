import { SlashCommandBuilder, CommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '@/types';
import { leaderboardService } from '@/services/LeaderboardService';
import { logger } from '@/utils/logger';
import { config } from '@/utils/config';

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
        content: '❌ Leaderboard commands can only be used in server channels, not in direct messages.',
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

    // Configurable max possible score per quiz
    // TODO: Make this dynamic based on actual quiz data if needed
    const questionsPerQuiz = 5; // Default/fallback value
    const pointsPerQuestion = config.quiz?.pointsPerCorrectAnswer ?? 10;
    const maxPossibleScorePerQuiz = questionsPerQuiz * pointsPerQuestion;
    let successRate = 0;
    if (maxPossibleScorePerQuiz > 0) {
      successRate = Math.round((stats.averageScore / maxPossibleScorePerQuiz) * 100);
    }
    // Clamp to 0-100%
    successRate = Math.max(0, Math.min(100, successRate));

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
        { name: '⏱️ Best Time', value: stats.bestTime ? `${Math.floor(stats.bestTime / 60)}m ${stats.bestTime % 60}s` : 'N/A', inline: true },
        { name: '📈 Success Rate', value: `${successRate}%`, inline: true }
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