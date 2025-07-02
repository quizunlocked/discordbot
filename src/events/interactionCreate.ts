import { Events, Interaction, ButtonInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalSubmitInteraction } from 'discord.js';
import { logger } from '@/utils/logger';
import { quizService } from '@/services/QuizService';
import { leaderboardService } from '@/services/LeaderboardService';
import { buttonCleanupService } from '@/services/ButtonCleanupService';
import { databaseService } from '@/services/DatabaseService';
import { requireAdminPrivileges, canManageQuiz, hasAdminPrivileges } from '@/utils/permissions';
import { autocomplete as quizAutocomplete } from '@/commands/quiz/start';

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction: Interaction): Promise<void> {
  try {
    // Handle different types of interactions
    if (interaction.isAutocomplete()) {
      // Quiz command autocomplete
      if (interaction.commandName === 'quiz') {
        await quizAutocomplete(interaction);
        return;
      }
    }
    if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    }
  } catch (error) {
    logger.error('Error handling interaction:', error);
    
    if (interaction.isRepliable()) {
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: 'There was an error while processing your request.', ephemeral: true });
        } else {
          await interaction.reply({ content: 'There was an error while processing your request.', ephemeral: true });
        }
      } catch (replyError) {
        logger.error('Error sending error response:', replyError);
      }
    }
  }
}

async function handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
  const { customId } = interaction;

  try {
    // Handle quiz management buttons (delete, edit, toggle status)
    if (customId.startsWith('quiz_delete_') || customId.startsWith('quiz_edit_') || customId.startsWith('quiz_toggle_')) {
      await handleQuizManagementButton(interaction);
      return;
    }

    // Handle quiz session buttons (join, start, answer)
    if (customId.startsWith('quiz_')) {
      await quizService.handleButtonInteraction(interaction);
      return;
    }

    // Handle leaderboard buttons
    if (customId.startsWith('leaderboard_')) {
      await handleLeaderboardButton(interaction);
      return;
    }

    // Handle admin buttons
    if (customId.startsWith('admin_')) {
      await handleAdminButton(interaction);
      return;
    }

    // Handle dashboard buttons
    if (customId.startsWith('dashboard_')) {
      await handleDashboardButton(interaction);
      return;
    }

    logger.warn(`Unknown button interaction: ${customId}`);
  } catch (error) {
    logger.error('Error handling button interaction:', error);
    await interaction.reply({ 
      content: '❌ An error occurred while processing your request.', 
      ephemeral: true 
    });
  }
}

async function handleLeaderboardButton(interaction: ButtonInteraction): Promise<void> {
  try {
    const parts = interaction.customId.split('_');
    if (parts.length !== 3) {
      await interaction.reply({ content: '❌ Invalid leaderboard button.', ephemeral: true });
      return;
    }

    const [, period, pageStr] = parts;
    if (!period || !pageStr) {
      await interaction.reply({ content: '❌ Invalid leaderboard button.', ephemeral: true });
      return;
    }
    
    const page = parseInt(pageStr, 10);
    
    if (isNaN(page) || page < 1) {
      await interaction.reply({ content: '❌ Invalid page number.', ephemeral: true });
      return;
    }

    await interaction.deferUpdate();

    // Get leaderboard data
    const entries = await leaderboardService.getLeaderboard(period as any, 50);
    const ENTRIES_PER_PAGE = 10;
    const totalPages = Math.ceil(entries.length / ENTRIES_PER_PAGE);
    const startIndex = (page - 1) * ENTRIES_PER_PAGE;
    const pageEntries = entries.slice(startIndex, startIndex + ENTRIES_PER_PAGE);

    // Create embed
    const embed = leaderboardService.createLeaderboardEmbed(period as any, pageEntries, page, totalPages);

    // Create navigation buttons
    const row = new ActionRowBuilder<ButtonBuilder>();
    
    if (totalPages > 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`leaderboard_${period}_${Math.max(1, page - 1)}`)
          .setLabel('◀️ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId(`leaderboard_${period}_${Math.min(totalPages, page + 1)}`)
          .setLabel('Next ▶️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages)
      );
    }

    // Add period selection buttons
    const PERIODS = ['weekly', 'monthly', 'yearly', 'overall'] as const;
    const periodRow = new ActionRowBuilder<ButtonBuilder>();
    PERIODS.forEach(p => {
      periodRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`leaderboard_${p}_1`)
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
    logger.error('Error handling leaderboard button:', error);
    await interaction.followUp({ 
      content: '❌ An error occurred while updating the leaderboard.', 
      ephemeral: true 
    });
  }
}

async function handleAdminButton(interaction: ButtonInteraction): Promise<void> {
  try {
    const parts = interaction.customId.split('_');
    if (parts.length < 4) {
      await interaction.reply({ content: '❌ Invalid admin button.', ephemeral: true });
      return;
    }

    const [, action, target, userId] = parts;
    
    if (action === 'clear' && target === 'user' && userId) {
      await handleUserDataDeletion(interaction, userId, parts[3] === 'confirm');
      return;
    }

    await interaction.reply({ content: '❌ Unknown admin action.', ephemeral: true });
  } catch (error) {
    logger.error('Error handling admin button:', error);
    await interaction.reply({ 
      content: '❌ An error occurred while processing the admin action.', 
      ephemeral: true 
    });
  }
}

async function handleUserDataDeletion(interaction: ButtonInteraction, userId: string, confirmed: boolean): Promise<void> {
  try {
    // Check admin privileges for destructive action
    if (!(await requireAdminPrivileges(interaction))) return;
    
    if (!confirmed) {
      const embed = new EmbedBuilder()
        .setTitle('❌ User Data Deletion Cancelled')
        .setDescription('User data deletion has been cancelled.')
        .setColor('#ff9900')
        .setTimestamp();

      await interaction.update({ 
        embeds: [embed], 
        components: [] 
      });
      return;
    }

    // Get user info before deletion
    const user = await interaction.client.users.fetch(userId).catch(() => null);
    const username = user?.username || 'Unknown User';

    // Delete user data
    await databaseService.prisma.$transaction(async (tx) => {
      // Delete question attempts first (due to foreign key constraints)
      await tx.questionAttempt.deleteMany({
        where: {
          quizAttempt: {
            userId: userId
          }
        }
      });

      // Delete quiz attempts
      await tx.quizAttempt.deleteMany({
        where: { userId: userId }
      });

      // Delete scores
      await tx.score.deleteMany({
        where: { userId: userId }
      });

      // Delete user
      await tx.user.delete({
        where: { id: userId }
      });
    });

    const embed = new EmbedBuilder()
      .setTitle('✅ User Data Deleted')
      .setDescription(`All data for **${username}** has been permanently deleted.`)
      .setColor('#00ff00')
      .setTimestamp();

    await interaction.update({ 
      embeds: [embed], 
      components: [] 
    });

    logger.info(`User data deleted for ${username} (${userId}) by ${interaction.user.tag}`);

  } catch (error) {
    logger.error('Error deleting user data:', error);
    await interaction.update({ 
      content: '❌ Error deleting user data. Please try again.',
      embeds: [],
      components: []
    });
  }
}

async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  try {
    const { customId } = interaction;

    if (customId === 'quiz_create_modal') {
      await handleQuizCreationModal(interaction);
      return;
    }

    await interaction.reply({ content: '❌ Unknown modal submission.', ephemeral: true });
  } catch (error) {
    logger.error('Error handling modal submit:', error);
    await interaction.reply({ 
      content: '❌ An error occurred while processing the form.', 
      ephemeral: true 
    });
  }
}

async function handleQuizCreationModal(interaction: ModalSubmitInteraction): Promise<void> {
  try {
    const title = interaction.fields.getTextInputValue('quiz_title');
    const description = interaction.fields.getTextInputValue('quiz_description') || null;
    const timeLimitStr = interaction.fields.getTextInputValue('quiz_time_limit');
    const questionCountStr = interaction.fields.getTextInputValue('quiz_question_count');

    const timeLimit = timeLimitStr ? parseInt(timeLimitStr, 10) : null;
    const questionCount = parseInt(questionCountStr, 10);

    if (isNaN(questionCount) || questionCount < 1 || questionCount > 50) {
      await interaction.reply({ 
        content: '❌ Invalid question count. Please enter a number between 1 and 50.', 
        ephemeral: true 
      });
      return;
    }

    if (timeLimit && (isNaN(timeLimit) || timeLimit < 60 || timeLimit > 3600)) {
      await interaction.reply({ 
        content: '❌ Invalid time limit. Please enter a number between 60 and 3600 seconds.', 
        ephemeral: true 
      });
      return;
    }

    // Create the quiz in database
    const quizId = `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await databaseService.prisma.quiz.create({
      data: {
        id: quizId,
        title,
        description,
        timeLimit: timeLimit || null,
        isActive: false, // Start as inactive until questions are added
      },
    });

    const embed = new EmbedBuilder()
      .setTitle('✅ Quiz Created Successfully')
      .setDescription(`**${title}** has been created!`)
      .addFields(
        { name: 'Quiz ID', value: quizId, inline: true },
        { name: 'Questions', value: '0 (needs to be added)', inline: true },
        { name: 'Status', value: '🔴 Inactive (needs questions)', inline: true }
      )
      .setColor('#00ff00')
      .setTimestamp();

    if (description) {
      embed.addFields({ name: 'Description', value: description, inline: false });
    }

    if (timeLimit) {
      embed.addFields({ name: 'Time Limit', value: `${timeLimit}s`, inline: false });
    }

    await interaction.reply({ 
      embeds: [embed], 
      content: `Next step: Add ${questionCount} questions to your quiz using \`/admin add-questions ${quizId}\``,
      ephemeral: true 
    });

    logger.info(`Quiz "${title}" created by ${interaction.user.tag} with ID ${quizId}`);

  } catch (error) {
    logger.error('Error creating quiz from modal:', error);
    await interaction.reply({ 
      content: '❌ Error creating quiz. Please try again.', 
      ephemeral: true 
    });
  }
}

async function handleDashboardButton(interaction: ButtonInteraction): Promise<void> {
  try {
    const action = interaction.customId.replace('dashboard_', '');
    
    switch (action) {
      case 'status':
        await handleDashboardStatus(interaction);
        break;
      case 'quizzes':
        await handleDashboardQuizzes(interaction);
        break;
      case 'users':
        await handleDashboardUsers(interaction);
        break;
      case 'database':
        await handleDashboardDatabase(interaction);
        break;
      case 'create_quiz':
        await handleDashboardCreateQuiz(interaction);
        break;
      case 'stop_quiz':
        await handleDashboardStopQuiz(interaction);
        break;
      default:
        await interaction.reply({ content: '❌ Unknown dashboard action.', ephemeral: true });
    }
  } catch (error) {
    logger.error('Error handling dashboard button:', error);
    await interaction.reply({ 
      content: '❌ An error occurred while processing the dashboard action.', 
      ephemeral: true 
    });
  }
}

async function handleDashboardStatus(interaction: ButtonInteraction): Promise<void> {
  try {
    await interaction.deferUpdate();

    // Test database connection
    const dbTest = await databaseService.prisma.$queryRaw`SELECT 1 as test`;
    const dbStatus = dbTest ? '✅ Connected' : '❌ Disconnected';

    // Get bot uptime
    const uptime = process.uptime();
    const uptimeFormatted = formatUptime(uptime);

    // Get memory usage
    const memoryUsage = process.memoryUsage();
    const memoryFormatted = `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`;

    const embed = new EmbedBuilder()
      .setTitle('🤖 System Status')
      .setColor('#00ff00')
      .addFields(
        { name: 'Database', value: dbStatus, inline: true },
        { name: 'Uptime', value: uptimeFormatted, inline: true },
        { name: 'Memory Usage', value: memoryFormatted, inline: true },
        { name: 'Node.js Version', value: process.version, inline: true },
        { name: 'Environment', value: process.env['NODE_ENV'] || 'development', inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    logger.error('Error checking status:', error);
    await interaction.editReply('❌ Error checking bot status.');
  }
}

async function handleDashboardQuizzes(interaction: ButtonInteraction): Promise<void> {
  try {
    await interaction.deferUpdate();

    const quizzes = await databaseService.prisma.quiz.findMany({
      include: {
        _count: {
          select: {
            questions: true,
            attempts: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (quizzes.length === 0) {
      await interaction.editReply('No quizzes found.');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('📚 Quiz Management')
      .setColor('#0099ff')
      .setDescription(quizzes.map(quiz => {
        const status = quiz.isActive ? '🟢 Active' : '🔴 Inactive';
        return `**${quiz.title}** (${quiz.id})\n${status} • ${quiz._count.questions} questions • ${quiz._count.attempts} attempts`;
      }).join('\n\n'))
      .setFooter({ text: 'Showing all quizzes (active and inactive)' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    logger.error('Error listing quizzes:', error);
    await interaction.editReply('❌ Error listing quizzes.');
  }
}

async function handleDashboardUsers(interaction: ButtonInteraction): Promise<void> {
  try {
    await interaction.deferUpdate();

    const users = await databaseService.prisma.user.findMany({
      include: {
        _count: {
          select: {
            quizAttempts: true,
            scores: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    if (users.length === 0) {
      await interaction.editReply('No users found.');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('👥 User Management')
      .setColor('#0099ff')
      .setDescription(users.map(user => 
        `**${user.username}**\n${user._count.quizAttempts} attempts • ${user._count.scores} score records`
      ).join('\n\n'))
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    logger.error('Error listing users:', error);
    await interaction.editReply('❌ Error listing users.');
  }
}

async function handleDashboardDatabase(interaction: ButtonInteraction): Promise<void> {
  try {
    await interaction.deferUpdate();

    // Get database statistics
    const [
      userCount,
      quizCount,
      questionCount,
      attemptCount,
      scoreCount
    ] = await Promise.all([
      databaseService.prisma.user.count(),
      databaseService.prisma.quiz.count(),
      databaseService.prisma.question.count(),
      databaseService.prisma.quizAttempt.count(),
      databaseService.prisma.score.count()
    ]);

    // Get recent activity
    const recentAttempts = await databaseService.prisma.quizAttempt.findMany({
      take: 5,
      orderBy: { startedAt: 'desc' },
      include: {
        user: true,
        quiz: true
      }
    });

    const embed = new EmbedBuilder()
      .setTitle('🗄️ Database Statistics')
      .setColor('#0099ff')
      .addFields(
        { name: 'Users', value: userCount.toString(), inline: true },
        { name: 'Quizzes', value: quizCount.toString(), inline: true },
        { name: 'Questions', value: questionCount.toString(), inline: true },
        { name: 'Quiz Attempts', value: attemptCount.toString(), inline: true },
        { name: 'Score Records', value: scoreCount.toString(), inline: true }
      )
      .setTimestamp();

    if (recentAttempts.length > 0) {
      const recentActivity = recentAttempts.map(a => 
        `${a.user.username}: ${a.quiz.title} (${a.totalScore} pts)`
      ).join('\n');
      
      embed.addFields({ 
        name: 'Recent Activity', 
        value: recentActivity,
        inline: false 
      });
    }

    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    logger.error('Error getting database stats:', error);
    await interaction.editReply('❌ Error getting database statistics.');
  }
}

async function handleDashboardCreateQuiz(interaction: ButtonInteraction): Promise<void> {
  try {
    await interaction.reply({ 
      content: 'Use `/quiz-manager create` to create a new quiz with an interactive form.', 
      ephemeral: true 
    });
  } catch (error) {
    logger.error('Error handling create quiz:', error);
    await interaction.reply({ content: '❌ Error creating quiz.', ephemeral: true });
  }
}

async function handleDashboardStopQuiz(interaction: ButtonInteraction): Promise<void> {
  try {
    const activeSession = quizService.getActiveSessionByChannel(interaction.channelId);
    
    if (!activeSession) {
      await interaction.reply({ content: '❌ No active quiz found in this channel.', ephemeral: true });
      return;
    }

    await quizService.stopQuiz(activeSession.id);

    const embed = new EmbedBuilder()
      .setTitle('🛑 Quiz Stopped')
      .setDescription('The active quiz has been stopped by an administrator.')
      .setColor('#ff0000')
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    
  } catch (error) {
    logger.error('Error stopping active quiz:', error);
    await interaction.reply({ content: '❌ Error stopping active quiz.', ephemeral: true });
  }
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${secs}s`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

async function handleQuizManagementButton(interaction: ButtonInteraction): Promise<void> {
  try {
    const { customId } = interaction;
    
    if (customId.startsWith('quiz_delete_confirm_')) {
      await handleQuizDeleteConfirm(interaction);
    } else if (customId.startsWith('quiz_delete_all_confirm')) {
      await handleQuizDeleteAllConfirm(interaction);
    } else if (customId.startsWith('quiz_delete_cancel_') || customId.startsWith('quiz_delete_all_cancel')) {
      await handleQuizDeleteCancel(interaction);
    } else if (customId.startsWith('quiz_toggle_status_')) {
      await handleQuizToggleStatus(interaction);
    } else if (customId.startsWith('quiz_toggle_private_')) {
      await handleQuizTogglePrivate(interaction);
    } else if (customId.startsWith('quiz_edit_')) {
      await handleQuizEdit(interaction);
    } else {
      await interaction.reply({ content: '❌ Unknown quiz management action.', ephemeral: true });
    }
  } catch (error) {
    logger.error('Error handling quiz management button:', error);
    await interaction.reply({ 
      content: '❌ An error occurred while processing the quiz management action.', 
      ephemeral: true 
    });
  }
}

async function handleQuizDeleteConfirm(interaction: ButtonInteraction): Promise<void> {
  try {
    // Check admin privileges for destructive action
    if (!(await requireAdminPrivileges(interaction))) return;
    
    const quizId = interaction.customId.replace('quiz_delete_confirm_', '');
    
    // Get quiz info before deletion
    const quiz = await databaseService.prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        _count: {
          select: {
            questions: true,
            attempts: true
          }
        }
      }
    });

    if (!quiz) {
      await interaction.reply({ content: '❌ Quiz not found.', ephemeral: true });
      return;
    }

    // Delete the quiz and all related data
    await databaseService.prisma.$transaction(async (tx) => {
      // Delete question attempts first (due to foreign key constraints)
      await tx.questionAttempt.deleteMany({
        where: {
          question: {
            quizId: quizId
          }
        }
      });

      // Delete quiz attempts
      await tx.quizAttempt.deleteMany({
        where: { quizId: quizId }
      });

      // Delete questions
      await tx.question.deleteMany({
        where: { quizId: quizId }
      });

      // Delete the quiz
      await tx.quiz.delete({
        where: { id: quizId }
      });
    });

    const embed = new EmbedBuilder()
      .setTitle('✅ Quiz Deleted Successfully')
      .setDescription(`**${quiz.title}** has been permanently deleted.`)
      .addFields(
        { name: 'Questions Deleted', value: quiz._count.questions.toString(), inline: true },
        { name: 'Attempts Deleted', value: quiz._count.attempts.toString(), inline: true }
      )
      .setColor('#00ff00')
      .setTimestamp();

    await interaction.update({ 
      embeds: [embed], 
      components: [] 
    });

    logger.info(`Quiz "${quiz.title}" (${quizId}) deleted by ${interaction.user.tag}`);

  } catch (error) {
    logger.error('Error deleting quiz:', error);
    try {
      await interaction.followUp({ 
        content: '❌ Error deleting quiz. Please try again.', 
        ephemeral: true 
      });
    } catch (followUpError) {
      logger.error('Error sending followUp message:', followUpError);
    }
  }
}

async function handleQuizDeleteCancel(interaction: ButtonInteraction): Promise<void> {
  try {
    const embed = new EmbedBuilder()
      .setTitle('❌ Quiz Deletion Cancelled')
      .setDescription('Quiz deletion has been cancelled.')
      .setColor('#ff9900')
      .setTimestamp();

    await interaction.update({ 
      embeds: [embed], 
      components: [] 
    });

  } catch (error) {
    logger.error('Error cancelling quiz deletion:', error);
    // For button interactions, we should use followUp if the interaction was already responded to
    try {
      await interaction.followUp({ 
        content: '❌ Error cancelling quiz deletion.', 
        ephemeral: true 
      });
    } catch (followUpError) {
      logger.error('Error sending followUp message:', followUpError);
    }
  }
}

async function handleQuizDeleteAllConfirm(interaction: ButtonInteraction): Promise<void> {
  try {
    // Check admin privileges for destructive action
    if (!(await requireAdminPrivileges(interaction))) return;
    
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

    // Delete all quizzes and related data
    await databaseService.prisma.$transaction(async (tx) => {
      // Delete question attempts first (due to foreign key constraints)
      await tx.questionAttempt.deleteMany();

      // Delete quiz attempts
      await tx.quizAttempt.deleteMany();

      // Delete questions
      await tx.question.deleteMany();

      // Delete all quizzes
      await tx.quiz.deleteMany();
    });

    const embed = new EmbedBuilder()
      .setTitle('✅ All Quizzes Deleted Successfully')
      .setDescription(`**All ${totalQuizzes} quizzes** have been permanently deleted.`)
      .addFields(
        { name: 'Quizzes Deleted', value: totalQuizzes.toString(), inline: true },
        { name: 'Questions Deleted', value: totalQuestions.toString(), inline: true },
        { name: 'Attempts Deleted', value: totalAttempts.toString(), inline: true }
      )
      .setColor('#00ff00')
      .setTimestamp();

    await interaction.update({ 
      embeds: [embed], 
      components: [] 
    });

    logger.info(`All ${totalQuizzes} quizzes deleted by ${interaction.user.tag}`);

  } catch (error) {
    logger.error('Error deleting all quizzes:', error);
    try {
      await interaction.followUp({ 
        content: '❌ Error deleting all quizzes. Please try again.', 
        ephemeral: true 
      });
    } catch (followUpError) {
      logger.error('Error sending followUp message:', followUpError);
    }
  }
}

async function handleQuizToggleStatus(interaction: ButtonInteraction): Promise<void> {
  try {
    const quizId = interaction.customId.replace('quiz_toggle_status_', '');
    
    const quiz = await databaseService.prisma.quiz.findUnique({
      where: { id: quizId },
      include: { questions: true }
    });

    if (!quiz) {
      await interaction.reply({ content: '❌ Quiz not found.', ephemeral: true });
      return;
    }

    // Toggle the status
    const newStatus = !quiz.isActive;
    
    await databaseService.prisma.quiz.update({
      where: { id: quizId },
      data: { isActive: newStatus }
    });

    const embed = new EmbedBuilder()
      .setTitle(`📝 Quiz Status Updated`)
      .setDescription(`**${quiz.title}** is now ${newStatus ? '🟢 Active' : '🔴 Inactive'}`)
      .addFields(
        { name: 'Questions', value: quiz.questions.length.toString(), inline: true },
        { name: 'Status', value: newStatus ? '🟢 Active' : '🔴 Inactive', inline: true }
      )
      .setColor(newStatus ? '#00ff00' : '#ff0000')
      .setTimestamp();

    await interaction.update({ 
      embeds: [embed], 
      components: [] 
    });

    logger.info(`Quiz "${quiz.title}" (${quizId}) ${newStatus ? 'activated' : 'deactivated'} by ${interaction.user.tag}`);

  } catch (error) {
    logger.error('Error toggling quiz status:', error);
    try {
      await interaction.followUp({ 
        content: '❌ Error updating quiz status. Please try again.', 
        ephemeral: true 
      });
    } catch (followUpError) {
      logger.error('Error sending followUp message:', followUpError);
    }
  }
}

async function handleQuizTogglePrivate(interaction: ButtonInteraction): Promise<void> {
  try {
    const quizId = interaction.customId.replace('quiz_toggle_private_', '');
    
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
        content: '❌ You can only modify quizzes you own or have admin privileges for.', 
        ephemeral: true 
      });
      return;
    }

    // Toggle the private status
    const currentPrivate = (quiz as any).private || false;
    const newPrivate = !currentPrivate;
    
    await databaseService.prisma.quiz.update({
      where: { id: quizId },
      data: { private: newPrivate } as any
    });

    const embed = new EmbedBuilder()
      .setTitle(`🔒 Quiz Privacy Updated`)
      .setDescription(`**${quiz.title}** is now ${newPrivate ? '🔒 Private' : '🌐 Public'}`)
      .addFields(
        { name: 'Questions', value: quiz.questions.length.toString(), inline: true },
        { name: 'Status', value: quiz.isActive ? '🟢 Active' : '🔴 Inactive', inline: true },
        { name: 'Privacy', value: newPrivate ? '🔒 Private' : '🌐 Public', inline: true }
      )
      .setColor(newPrivate ? '#ff9900' : '#00ff00')
      .setTimestamp();

    await interaction.update({ 
      embeds: [embed], 
      components: [] 
    });

    logger.info(`Quiz "${quiz.title}" (${quizId}) privacy ${newPrivate ? 'set to private' : 'set to public'} by ${interaction.user.tag}`);

  } catch (error) {
    logger.error('Error toggling quiz privacy:', error);
    try {
      await interaction.followUp({ 
        content: '❌ Error updating quiz privacy. Please try again.', 
        ephemeral: true 
      });
    } catch (followUpError) {
      logger.error('Error sending followUp message:', followUpError);
    }
  }
}

async function handleQuizEdit(interaction: ButtonInteraction): Promise<void> {
  try {
    // For now, just acknowledge the edit request
    // TODO: Implement modal for editing quiz properties
    await interaction.reply({ 
      content: '📝 Quiz editing feature coming soon!', 
      ephemeral: true 
    });

  } catch (error) {
    logger.error('Error handling quiz edit:', error);
    await interaction.reply({ 
      content: '❌ Error handling quiz edit request.', 
      ephemeral: true 
    });
  }
} 