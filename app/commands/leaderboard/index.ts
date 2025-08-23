import {
  SlashCommandBuilder,
  CommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { Command } from '../../types/index.js';
import { leaderboardService } from '../../services/LeaderboardService.js';
import { buttonCleanupService } from '../../services/ButtonCleanupService.js';
import { logger } from '../../utils/logger.js';

const PERIODS = ['weekly', 'monthly', 'yearly', 'overall'] as const;
const ENTRIES_PER_PAGE = 10;

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('View quiz leaderboards')
  .addStringOption(option =>
    option
      .setName('period')
      .setDescription('Time period for the leaderboard')
      .setRequired(false)
      .addChoices(
        { name: '📅 Weekly', value: 'weekly' },
        { name: '📆 Monthly', value: 'monthly' },
        { name: '📊 Yearly', value: 'yearly' },
        { name: '🏆 Overall', value: 'overall' }
      )
  )
  .addIntegerOption(option =>
    option
      .setName('page')
      .setDescription('Page number (default: 1)')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(10)
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

    const period = (interaction.options.getString('period') || 'weekly') as
      | 'weekly'
      | 'monthly'
      | 'yearly'
      | 'overall';
    const page = interaction.options.getInteger('page') || 1;

    // Get leaderboard data
    const entries = await leaderboardService.getLeaderboard(period, 50); // Get more entries for pagination
    const totalPages = Math.ceil(entries.length / ENTRIES_PER_PAGE);
    const startIndex = (page - 1) * ENTRIES_PER_PAGE;
    const pageEntries = entries.slice(startIndex, startIndex + ENTRIES_PER_PAGE);

    // Create embed
    const embed = leaderboardService.createLeaderboardEmbed(period, pageEntries, page, totalPages);

    // Create navigation buttons
    const row = new ActionRowBuilder<ButtonBuilder>();

    if (totalPages > 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`leaderboard_nav_${period}_${Math.max(1, page - 1)}`)
          .setLabel('◀️ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId(`leaderboard_nav_${period}_${Math.min(totalPages, page + 1)}`)
          .setLabel('Next ▶️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages)
      );
    }

    // Add period selection buttons
    const periodRow = new ActionRowBuilder<ButtonBuilder>();
    PERIODS.forEach(p => {
      periodRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`leaderboard_period_${p}_1`)
          .setLabel(p.charAt(0).toUpperCase() + p.slice(1))
          .setStyle(p === period ? ButtonStyle.Primary : ButtonStyle.Secondary)
      );
    });

    const components = totalPages > 1 ? [row, periodRow] : [periodRow];

    const reply = await interaction.editReply({
      embeds: [embed],
      components,
    });

    // Schedule button cleanup for leaderboard (30 seconds)
    buttonCleanupService.scheduleLeaderboardCleanup(reply.id, interaction.channelId, 30);
  } catch (error) {
    logger.error('Error executing leaderboard command:', error);

    // Check if interaction is still valid before trying to reply
    if (interaction.isRepliable()) {
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: '❌ An error occurred while fetching the leaderboard. Please try again later.',
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: '❌ An error occurred while fetching the leaderboard. Please try again later.',
            ephemeral: true,
          });
        }
      } catch (replyError) {
        logger.error('Error sending error response:', replyError);
      }
    }
  }
};
