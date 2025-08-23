import { SlashCommandBuilder, CommandInteraction, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { requireAdminPrivileges } from '../../utils/permissions.js';
import { handleStatus } from './status.js';
import { handleDb } from './db.js';
import { handleDashboard } from './dashboard.js';

export const data = new SlashCommandBuilder()
  .setName('botowner')
  .setDescription('Bot owner and infrastructure management commands')
  .addSubcommand(subcommand =>
    subcommand.setName('status').setDescription('Check bot status and database connection')
  )
  .addSubcommand(subcommand =>
    subcommand.setName('db').setDescription('Get database statistics and health information')
  )
  .addSubcommand(subcommand =>
    subcommand.setName('dashboard').setDescription('View administrative dashboard')
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: CommandInteraction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const subcommand = interaction.options.getSubcommand();

  try {
    await interaction.deferReply({ ephemeral: true });

    // Validate channel type - botowner commands must be run in guild channels
    if (!interaction.guild || !interaction.channel || interaction.channel.isDMBased()) {
      await interaction.editReply({
        content:
          '❌ Bot owner commands can only be used in server channels, not in direct messages.',
      });
      return;
    }

    // Require admin privileges for all botowner commands
    if (!(await requireAdminPrivileges(interaction))) return;

    switch (subcommand) {
      case 'status':
        await handleStatus(interaction);
        break;
      case 'db':
        await handleDb(interaction);
        break;
      case 'dashboard':
        await handleDashboard(interaction);
        break;
      default:
        await interaction.editReply('Unknown subcommand.');
    }
  } catch (error) {
    logger.error('Error in botowner command:', error);
    await interaction.editReply({
      content: 'There was an error executing the botowner command. Please check the logs.',
    });
  }
}
