import { SlashCommandBuilder, CommandInteraction, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { requireAdminPrivileges } from '../../utils/permissions.js';
import { handleListQuizzes } from './list-quizzes.js';
import { handleToggleQuiz } from './toggle-quiz.js';
import { handleListCorpora } from './list-corpora.js';
import { handleDeleteUserdata } from './delete-userdata.js';
import { handleDeleteEverything } from './delete-everything.js';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Admin commands for managing the quiz bot')
  .addSubcommand(subcommand =>
    subcommand
      .setName('toggle-quiz')
      .setDescription('Enable or disable a quiz')
      .addStringOption(option =>
        option.setName('quiz_id').setDescription('The ID of the quiz').setRequired(true)
      )
  )
  .addSubcommandGroup(group =>
    group
      .setName('list')
      .setDescription('List various resources')
      .addSubcommand(subcommand =>
        subcommand
          .setName('quizzes')
          .setDescription('List all available quizzes')
          .addBooleanOption(option =>
            option
              .setName('include_inactive')
              .setDescription('Include inactive quizzes')
              .setRequired(false)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('corpora')
          .setDescription('List all available corpora for quiz generation')
      )
  )
  .addSubcommandGroup(group =>
    group
      .setName('delete')
      .setDescription('Delete various resources')
      .addSubcommand(subcommand =>
        subcommand
          .setName('userdata')
          .setDescription('Clear all data for a specific user')
          .addUserOption(option =>
            option.setName('user').setDescription('The user to clear data for').setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand.setName('everything').setDescription('Delete all quizzes (⚠️ DESTRUCTIVE)')
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: CommandInteraction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const subcommandGroup = interaction.options.getSubcommandGroup();
  const subcommand = interaction.options.getSubcommand();

  try {
    await interaction.deferReply({ ephemeral: true });

    // Validate channel type - admin commands must be run in guild channels
    if (!interaction.guild || !interaction.channel || interaction.channel.isDMBased()) {
      await interaction.editReply({
        content: '❌ Admin commands can only be used in server channels, not in direct messages.',
      });
      return;
    }

    if (subcommandGroup === 'list') {
      switch (subcommand) {
        case 'quizzes':
          await handleListQuizzes(interaction);
          break;
        case 'corpora':
          await handleListCorpora(interaction);
          break;
        default:
          await interaction.editReply('Unknown list subcommand.');
      }
    } else if (subcommandGroup === 'delete') {
      switch (subcommand) {
        case 'userdata':
          if (!(await requireAdminPrivileges(interaction))) return;
          await handleDeleteUserdata(interaction);
          break;
        case 'everything':
          if (!(await requireAdminPrivileges(interaction))) return;
          await handleDeleteEverything(interaction);
          break;
        default:
          await interaction.editReply('Unknown delete subcommand.');
      }
    } else {
      switch (subcommand) {
        case 'toggle-quiz':
          await handleToggleQuiz(interaction);
          break;
        default:
          await interaction.editReply('Unknown subcommand.');
      }
    }
  } catch (error) {
    logger.error('Error in admin command:', error);
    await interaction.editReply({
      content: 'There was an error executing the admin command. Please check the logs.',
    });
  }
}
