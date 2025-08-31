import { SlashCommandBuilder, CommandInteraction, PermissionFlagsBits } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { requireAdminPrivileges } from '../../utils/permissions.js';
import { handleStart, handleStartAutocomplete } from './start.js';
import { handleStop } from './stop.js';
import { handleCreate } from './create.js';
import { handleEdit } from './edit.js';
import { handleDelete } from './delete.js';
import { handleQuestionAdd } from './question-add.js';
import { handleGet } from './get.js';
import { handleGenerate } from './generate.js';
import { handleTemplate } from './template.js';
import { handleUpload } from './upload.js';

export const data = new SlashCommandBuilder()
  .setName('quiz')
  .setDescription('Quiz management and interaction commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('start')
      .setDescription('Start a new quiz')
      .addStringOption(option =>
        option
          .setName('quiz_id')
          .setDescription('The quiz to start (type to search)')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addIntegerOption(option =>
        option
          .setName('wait_time')
          .setDescription('Time to wait for participants to join (seconds)')
          .setRequired(false)
          .setMinValue(10)
          .setMaxValue(3600)
      )
      .addIntegerOption(option =>
        option
          .setName('total_time_limit')
          .setDescription('Total time limit for the entire quiz (seconds)')
          .setRequired(false)
          .setMinValue(60)
          .setMaxValue(3600)
      )
      .addBooleanOption(option =>
        option
          .setName('private')
          .setDescription('Start this quiz as private (only you can participate)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand.setName('stop').setDescription('Stop the current quiz session')
  )
  .addSubcommand(subcommand =>
    subcommand.setName('create').setDescription('Create a new quiz with interactive form')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('edit')
      .setDescription('Edit an existing quiz')
      .addStringOption(option =>
        option.setName('quiz_id').setDescription('The ID of the quiz to edit').setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('delete')
      .setDescription('Delete a quiz')
      .addStringOption(option =>
        option.setName('quiz_id').setDescription('The ID of the quiz to delete').setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('get')
      .setDescription('Get detailed information about a quiz')
      .addStringOption(option =>
        option.setName('quiz_id').setDescription('The ID of the quiz').setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('generate')
      .setDescription('Generate a quiz from a corpus')
      .addStringOption(option =>
        option
          .setName('from-corpus')
          .setDescription('Title of the corpus to generate from')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('quiz-title')
          .setDescription('Title for the generated quiz')
          .setRequired(true)
          .setMaxLength(100)
      )
      .addIntegerOption(option =>
        option
          .setName('num-questions')
          .setDescription('Number of questions to generate')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(50)
      )
      .addIntegerOption(option =>
        option
          .setName('num-choices')
          .setDescription('Number of answer choices per question')
          .setRequired(false)
          .setMinValue(2)
          .setMaxValue(6)
      )
      .addBooleanOption(option =>
        option
          .setName('show-hints')
          .setDescription('Include hints in the generated quiz')
          .setRequired(false)
      )
      .addBooleanOption(option =>
        option
          .setName('private')
          .setDescription('Make the quiz private (only you can take it)')
          .setRequired(false)
      )
      .addIntegerOption(option =>
        option
          .setName('question_time_limit')
          .setDescription('Time limit for each question (5-30 seconds)')
          .setRequired(false)
          .setMinValue(5)
          .setMaxValue(30)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('upload')
      .setDescription('Upload a CSV file to create a custom quiz')
      .addAttachmentOption(option =>
        option.setName('file').setDescription('CSV file with quiz questions').setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('title')
          .setDescription('Optional quiz title (defaults to filename)')
          .setRequired(false)
      )
  )
  .addSubcommand(subcommand =>
    subcommand.setName('template').setDescription('Get a CSV template for creating custom quizzes')
  )
  .addSubcommandGroup(group =>
    group
      .setName('question')
      .setDescription('Manage questions in quizzes')
      .addSubcommand(subcommand =>
        subcommand
          .setName('add')
          .setDescription('Add a new question to an existing quiz')
          .addStringOption(option =>
            option
              .setName('quiz_id')
              .setDescription('The ID of the quiz to add the question to')
              .setRequired(true)
          )
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction: CommandInteraction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const subcommandGroup = interaction.options.getSubcommandGroup();
  const subcommand = interaction.options.getSubcommand();

  try {
    // Special handling for commands that don't defer reply 
    // (start command defers on its own, create/question-add commands show modal immediately)
    const modalCommands = ['create', 'edit'];
    const questionModalCommands = subcommandGroup === 'question' && subcommand === 'add';
    
    if (subcommand !== 'start' && !modalCommands.includes(subcommand) && !questionModalCommands) {
      await interaction.deferReply({ ephemeral: true });
    }

    // Validate channel type - quiz commands must be run in guild channels
    if (!interaction.guild || !interaction.channel || interaction.channel.isDMBased()) {
      if (subcommand === 'start' || modalCommands.includes(subcommand) || (subcommandGroup === 'question' && subcommand === 'add')) {
        await interaction.reply({
          content: '❌ Quiz commands can only be used in server channels, not in direct messages.',
          ephemeral: true,
        });
      } else {
        await interaction.editReply(
          '❌ Quiz commands can only be used in server channels, not in direct messages.'
        );
      }
      return;
    }

    if (subcommandGroup === 'question') {
      switch (subcommand) {
        case 'add':
          await handleQuestionAdd(interaction);
          break;
        default:
          await interaction.editReply('Unknown question subcommand.');
      }
    } else {
      switch (subcommand) {
        case 'start':
          await handleStart(interaction);
          break;
        case 'stop':
          await handleStop(interaction);
          break;
        case 'create':
          await handleCreate(interaction);
          break;
        case 'edit':
          await handleEdit(interaction);
          break;
        case 'delete':
          if (!(await requireAdminPrivileges(interaction))) return;
          await handleDelete(interaction);
          break;
        case 'get':
          await handleGet(interaction);
          break;
        case 'generate':
          await handleGenerate(interaction);
          break;
        case 'template':
          await handleTemplate(interaction);
          break;
        case 'upload':
          await handleUpload(interaction);
          break;
        default:
          await interaction.editReply('Unknown subcommand.');
      }
    }
  } catch (error) {
    logger.error('Error in quiz command:', error);
    if (subcommand === 'start' || modalCommands.includes(subcommand) || (subcommandGroup === 'question' && subcommand === 'add')) {
      await interaction.reply({
        content: 'There was an error executing the quiz command. Please check the logs.',
        ephemeral: true,
      });
    } else {
      await interaction.editReply(
        'There was an error executing the quiz command. Please check the logs.'
      );
    }
  }
}

/**
 * Autocomplete handler for quiz_id
 */
export async function autocomplete(interaction: any) {
  // For quiz start subcommand, use the start handler's autocomplete
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'start') {
    return handleStartAutocomplete(interaction);
  }

  // For other subcommands, provide generic response
  await interaction.respond([{ name: 'Autocomplete coming soon...', value: 'placeholder' }]);
}
