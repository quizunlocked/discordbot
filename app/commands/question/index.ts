import { SlashCommandBuilder, CommandInteraction, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { handleHintAdd } from './hint-add.js';

export const data = new SlashCommandBuilder()
  .setName('question')
  .setDescription('Question management commands')
  .addSubcommandGroup(group =>
    group
      .setName('hint')
      .setDescription('Manage question hints')
      .addSubcommand(subcommand =>
        subcommand
          .setName('add')
          .setDescription('Add a hint to a specific question in a quiz')
          .addStringOption(option =>
            option
              .setName('quiz-id')
              .setDescription('ID of the quiz containing the question')
              .setRequired(true)
          )
          .addIntegerOption(option =>
            option
              .setName('question-number')
              .setDescription('Question number in the quiz (1-based index)')
              .setRequired(true)
              .setMinValue(1)
          )
          .addStringOption(option =>
            option
              .setName('hint-title')
              .setDescription('Title for the hint button (e.g., "Example", "Grammar tip")')
              .setRequired(true)
              .setMaxLength(80)
          )
          .addStringOption(option =>
            option
              .setName('hint-text')
              .setDescription('The hint content shown when clicked')
              .setRequired(true)
              .setMaxLength(2000)
          )
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction: CommandInteraction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  await interaction.deferReply({ ephemeral: true });

  const subcommandGroup = interaction.options.getSubcommandGroup();
  const subcommand = interaction.options.getSubcommand();

  try {
    // Validate channel type - question commands must be run in guild channels
    if (!interaction.guild || !interaction.channel || interaction.channel.isDMBased()) {
      await interaction.editReply(
        '❌ Question commands can only be used in server channels, not in direct messages.'
      );
      return;
    }

    if (subcommandGroup === 'hint') {
      switch (subcommand) {
        case 'add':
          await handleHintAdd(interaction);
          break;
        default:
          await interaction.editReply('Unknown hint subcommand.');
      }
    } else {
      await interaction.editReply('Unknown subcommand group.');
    }
  } catch (error) {
    logger.error('Error in question command:', error);
    await interaction.editReply(
      'There was an error executing the question command. Please check the logs.'
    );
  }
}
