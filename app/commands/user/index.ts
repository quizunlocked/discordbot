import { SlashCommandBuilder, CommandInteraction } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleStats } from './stats.js';

export const data = new SlashCommandBuilder()
  .setName('user')
  .setDescription('User statistics and information commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('stats')
      .setDescription('Get detailed statistics for a user')
      .addUserOption(option =>
        option.setName('user').setDescription('The user to get stats for').setRequired(true)
      )
  );

export async function execute(interaction: CommandInteraction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const subcommand = interaction.options.getSubcommand();

  try {
    await interaction.deferReply({ ephemeral: true });

    // Validate channel type - user commands must be run in guild channels
    if (!interaction.guild || !interaction.channel || interaction.channel.isDMBased()) {
      await interaction.editReply({
        content: '❌ User commands can only be used in server channels, not in direct messages.',
      });
      return;
    }

    switch (subcommand) {
      case 'stats':
        await handleStats(interaction);
        break;
      default:
        await interaction.editReply('Unknown subcommand.');
    }
  } catch (error) {
    logger.error('Error in user command:', error);
    await interaction.editReply({
      content: 'There was an error executing the user command. Please check the logs.',
    });
  }
}
