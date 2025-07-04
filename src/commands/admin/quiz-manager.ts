import { 
  SlashCommandBuilder, 
  CommandInteraction, 
  PermissionFlagsBits, 
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { logger } from '@/utils/logger';
import { databaseService } from '@/services/DatabaseService';
import { requireAdminPrivileges } from '@/utils/permissions';
import { canManageQuiz, hasAdminPrivileges } from '@/utils/permissions';

export const data = new SlashCommandBuilder()
  .setName('quiz-manager')
  .setDescription('Advanced quiz management commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('create')
      .setDescription('Create a new quiz with interactive form')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('edit')
      .setDescription('Edit an existing quiz')
      .addStringOption(option =>
        option
          .setName('quiz_id')
          .setDescription('The ID of the quiz to edit')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('delete')
      .setDescription('Delete a quiz')
      .addStringOption(option =>
        option
          .setName('quiz_id')
          .setDescription('The ID of the quiz to delete')
          .setRequired(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('delete-all')
      .setDescription('Delete all quizzes (⚠️ DESTRUCTIVE)')
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: CommandInteraction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const subcommand = interaction.options.getSubcommand();
  
  // Validate channel type - admin commands must be run in guild channels
  if (!interaction.guild || !interaction.channel || interaction.channel.isDMBased()) {
    await interaction.reply({
      content: '❌ Admin commands can only be used in server channels, not in direct messages.',
      ephemeral: true,
    });
    return;
  }
  
  try {
    switch (subcommand) {
      case 'create':
        await handleCreateQuiz(interaction);
        break;
      case 'edit':
        await handleEditQuiz(interaction);
        break;
      case 'delete':
        if (!(await requireAdminPrivileges(interaction))) return;
        await handleDeleteQuiz(interaction);
        break;
      case 'delete-all':
        if (!(await requireAdminPrivileges(interaction))) return;
        await handleDeleteAllQuizzes(interaction);
        break;
      default:
        await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
    }
    
  } catch (error) {
    logger.error('Error in quiz-manager command:', error);
    await interaction.reply({
      content: 'There was an error executing the quiz-manager command. Please check the logs.',
      ephemeral: true,
    });
  }
}

async function handleCreateQuiz(interaction: CommandInteraction): Promise<void> {
  try {
    // Create modal for quiz creation
    const modal = new ModalBuilder()
      .setCustomId('quiz_create_modal')
      .setTitle('Create New Quiz');

    const titleInput = new TextInputBuilder()
      .setCustomId('quiz_title')
      .setLabel('Quiz Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter the quiz title')
      .setRequired(true)
      .setMaxLength(100);

    const descriptionInput = new TextInputBuilder()
      .setCustomId('quiz_description')
      .setLabel('Quiz Description')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter a description for the quiz')
      .setRequired(false)
      .setMaxLength(1000);

    const timeLimitInput = new TextInputBuilder()
      .setCustomId('quiz_time_limit')
      .setLabel('Total Time Limit (seconds)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('300 (optional)')
      .setRequired(false)
      .setMaxLength(10);

    const questionCountInput = new TextInputBuilder()
      .setCustomId('quiz_question_count')
      .setLabel('Number of Questions')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('5')
      .setRequired(true)
      .setMaxLength(2);

    const firstRow = new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput);
    const secondRow = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);
    const thirdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(timeLimitInput);
    const fourthRow = new ActionRowBuilder<TextInputBuilder>().addComponents(questionCountInput);

    modal.addComponents(firstRow, secondRow, thirdRow, fourthRow);

    await interaction.showModal(modal);
    
  } catch (error) {
    logger.error('Error creating quiz modal:', error);
    await interaction.reply({ content: '❌ Error creating quiz form.', ephemeral: true });
  }
}

async function handleEditQuiz(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;
    
    const quizId = interaction.options.getString('quiz_id', true);
    
    const quiz = await databaseService.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: true }
    });

    if (!quiz) {
      await interaction.reply({ content: '❌ Quiz not found.', ephemeral: true });
      return;
    }

    // Check if user can manage this quiz
    const userCanManage = canManageQuiz(
      interaction.user.id, 
      (quiz as any).quizOwnerId, 
      hasAdminPrivileges(interaction)
    );

    if (!userCanManage) {
      await interaction.reply({ 
        content: '❌ You can only edit quizzes you own or have admin privileges for.', 
        ephemeral: true 
      });
      return;
    }

    const isPrivate = (quiz as any).private || false;
    const privacyStatus = isPrivate ? '🔒 Private' : '🌐 Public';

    const embed = new EmbedBuilder()
      .setTitle(`📝 Edit Quiz: ${quiz.title}`)
      .setDescription(quiz.description || 'No description')
      .addFields(
        { name: 'Questions', value: quiz.questions.length.toString(), inline: true },
        { name: 'Status', value: quiz.isActive ? '🟢 Active' : '🔴 Inactive', inline: true },
        { name: 'Privacy', value: privacyStatus, inline: true },
        { name: 'Time Limit', value: (quiz as any).timeLimit ? `${(quiz as any).timeLimit}s` : 'None', inline: true }
      )
      .setColor('#0099ff')
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`quiz_edit_title_${quizId}`)
          .setLabel('Edit Title')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`quiz_edit_description_${quizId}`)
          .setLabel('Edit Description')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`quiz_edit_time_limit_${quizId}`)
          .setLabel('Edit Time Limit')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`quiz_toggle_status_${quizId}`)
          .setLabel(quiz.isActive ? 'Disable' : 'Enable')
          .setStyle(quiz.isActive ? ButtonStyle.Danger : ButtonStyle.Success)
      );

    // Add private toggle button if user owns the quiz or is admin
    const privateToggleButton = new ButtonBuilder()
      .setCustomId(`quiz_toggle_private_${quizId}`)
      .setLabel(isPrivate ? 'Make Public' : 'Make Private')
      .setStyle(isPrivate ? ButtonStyle.Success : ButtonStyle.Secondary);

    const components = [row];
    
    // Only show private toggle if user owns the quiz or is admin
    if (userCanManage) {
      const privateRow = new ActionRowBuilder<ButtonBuilder>().addComponents(privateToggleButton);
      components.push(privateRow);
    }

    await interaction.reply({ embeds: [embed], components, ephemeral: true });
    
  } catch (error) {
    logger.error('Error editing quiz:', error);
    await interaction.reply({ content: '❌ Error editing quiz.', ephemeral: true });
  }
}

async function handleDeleteQuiz(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;
    
    const quizId = interaction.options.getString('quiz_id', true);
    
    const quiz = await databaseService.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        _count: {
          select: {
            attempts: true,
            questions: true
          }
        }
      }
    });

    if (!quiz) {
      await interaction.reply({ content: '❌ Quiz not found.', ephemeral: true });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Confirm Quiz Deletion')
      .setDescription(`Are you sure you want to delete **${quiz.title}**?\n\nThis will permanently delete:\n• ${quiz._count.questions} questions\n• ${quiz._count.attempts} quiz attempts\n• All related data\n\n**This action cannot be undone!**`)
      .setColor('#ff0000')
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`quiz_delete_confirm_${quizId}`)
          .setLabel('✅ Delete Quiz')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`quiz_delete_cancel_${quizId}`)
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    
  } catch (error) {
    logger.error('Error deleting quiz:', error);
    await interaction.reply({ content: '❌ Error deleting quiz.', ephemeral: true });
  }
}

async function handleDeleteAllQuizzes(interaction: CommandInteraction): Promise<void> {
  try {
    if (!interaction.isChatInputCommand()) return;
    
    // Get quiz statistics before deletion
    const quizStats = await databaseService.prisma.quiz.findMany({
      include: {
        _count: {
          select: {
            attempts: true,
            questions: true
          }
        }
      }
    });

    if (quizStats.length === 0) {
      await interaction.reply({ content: '❌ No quizzes found to delete.', ephemeral: true });
      return;
    }

    const totalQuizzes = quizStats.length;
    const totalQuestions = quizStats.reduce((sum, quiz) => sum + quiz._count.questions, 0);
    const totalAttempts = quizStats.reduce((sum, quiz) => sum + quiz._count.attempts, 0);

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Confirm Delete ALL Quizzes')
      .setDescription(`Are you sure you want to delete **ALL ${totalQuizzes} quizzes**?\n\nThis will permanently delete:\n• ${totalQuizzes} quizzes\n• ${totalQuestions} questions\n• ${totalAttempts} quiz attempts\n• All related data\n\n**⚠️ THIS ACTION CANNOT BE UNDONE! ⚠️**`)
      .setColor('#ff0000')
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`quiz_delete_all_confirm`)
          .setLabel('✅ Delete ALL Quizzes')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`quiz_delete_all_cancel`)
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    
  } catch (error) {
    logger.error('Error preparing delete all quizzes:', error);
    await interaction.reply({ content: '❌ Error preparing delete all quizzes.', ephemeral: true });
  }
} 