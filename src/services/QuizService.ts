import { 
  TextChannel, 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder, 
  EmbedBuilder,
  ButtonInteraction,
  Client
} from 'discord.js';
import { databaseService } from './DatabaseService';
import { leaderboardService } from './LeaderboardService';
import { buttonCleanupService } from './ButtonCleanupService';
import { logger } from '@/utils/logger';
import { config } from '@/utils/config';
import { 
  QuizSession, 
  ParticipantData, 
  QuizConfig
} from '@/types';
import { v4 as uuidv4 } from 'uuid';

export class QuizService {
  private static instance: QuizService;
  private activeSessions: Map<string, QuizSession> = new Map();
  private questionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private waitingTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private totalQuizTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private client: Client | null = null;

  public static getInstance(): QuizService {
    if (!QuizService.instance) {
      QuizService.instance = new QuizService();
    }
    return QuizService.instance;
  }

  /**
   * Set the Discord client instance
   */
  public setClient(client: Client): void {
    this.client = client;
  }

  /**
   * Start a new quiz session
   */
  public async startQuiz(
    channel: TextChannel,
    quizConfig: QuizConfig,
    quizId: string,
    waitTime: number = 30,
    saveToDatabase: boolean = true,
    isPrivate: boolean = false,
    userId?: string
  ): Promise<void> {
    const sessionId = uuidv4();
    
    const session: QuizSession = {
      id: sessionId,
      quizId,
      channelId: channel.id,
      currentQuestionIndex: 0,
      participants: new Map(),
      startTime: new Date(),
      isActive: true,
      isWaiting: true, // New field to track waiting state
      isQuestionComplete: false, // Track if current question has been completed
      isPrivate, // Track if this is a private quiz session
    };

    this.activeSessions.set(sessionId, session);
    
    // Save quiz to database only if requested
    if (saveToDatabase) {
      await this.saveQuizToDatabase(quizConfig, quizId, isPrivate, userId);
    }
    
    // For private quizzes, start immediately without join phase
    if (isPrivate) {
      if (!userId) {
        throw new Error('User ID is required for private quizzes');
      }
      
      // Get the actual user who started the quiz
      const user = await channel.client.users.fetch(userId).catch(() => null);
      if (!user) {
        throw new Error(`Could not fetch user ${userId} for private quiz`);
      }
      
      // Add the quiz creator as the only participant
      const participant: ParticipantData = {
        userId: user.id,
        username: user.username,
        score: 0,
        streak: 0,
        answers: new Map(),
        startTime: new Date(),
      };
      session.participants.set(participant.userId, participant);
      
      // Start questions immediately
      await this.startQuizQuestions(session, channel);
      return;
    }
    
    // Send welcome message with join button for public quizzes
    const welcomeEmbed = new EmbedBuilder()
      .setTitle(`🎯 ${quizConfig.title}`)
      .setDescription(quizConfig.description || 'Get ready to test your knowledge!')
      .addFields(
        { name: 'Questions', value: quizConfig.questions.length.toString(), inline: true },
        { name: 'Time Limit', value: `${config.quiz.defaultQuestionTimeout}s per question`, inline: true },
        { name: 'Participants', value: '0', inline: true },
        { name: 'Waiting Time', value: `${waitTime}s`, inline: true }
      )
      .setColor('#0099ff')
      .setTimestamp();

    const joinButton = new ButtonBuilder()
      .setCustomId(`quiz_join_${sessionId}`)
      .setLabel('Join Quiz')
      .setStyle(ButtonStyle.Success);

    const startButton = new ButtonBuilder()
      .setCustomId(`quiz_start_${sessionId}`)
      .setLabel('Start Now')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(joinButton, startButton);

    const message = await channel.send({
      embeds: [welcomeEmbed],
      components: [row],
    });

    session.messageId = message.id;
    
    // Schedule button cleanup for quiz join message
    buttonCleanupService.scheduleQuizCleanup(message.id, channel.id, waitTime + 60); // Extra 60s buffer
    
    // Set waiting timeout
    const waitingTimeoutId = setTimeout(() => {
      this.startQuizQuestions(session, channel);
    }, waitTime * 1000);

    this.waitingTimeouts.set(sessionId, waitingTimeoutId);
    
    logger.info(`Quiz session ${sessionId} started in channel ${channel.id} with ${waitTime}s wait time`);
  }

  /**
   * Handle join button clicks
   */
  public async handleJoin(interaction: ButtonInteraction): Promise<void> {
    const sessionId = interaction.customId.replace('quiz_join_', '');
    const session = this.activeSessions.get(sessionId);
    
    if (!session || !session.isActive || !session.isWaiting) {
      await interaction.reply({ content: 'Quiz session not found or not accepting participants.', ephemeral: true });
      return;
    }

    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Check if user already joined
    if (session.participants.has(userId)) {
      await interaction.reply({ content: 'You have already joined this quiz!', ephemeral: true });
      return;
    }

    // Add participant
    const participant: ParticipantData = {
      userId,
      username,
      score: 0,
      streak: 0,
      answers: new Map(),
      startTime: new Date(),
    };
    session.participants.set(userId, participant);

    // Update the message with new participant count
    await this.updateWaitingMessage(session, interaction.channel as TextChannel);

    await interaction.reply({ content: '✅ You have joined the quiz!', ephemeral: true });
    
    logger.info(`User ${username} joined quiz session ${sessionId}`);
  }

  /**
   * Handle manual start button clicks
   */
  public async handleManualStart(interaction: ButtonInteraction): Promise<void> {
    const sessionId = interaction.customId.replace('quiz_start_', '');
    const session = this.activeSessions.get(sessionId);
    
    if (!session || !session.isActive || !session.isWaiting) {
      await interaction.reply({ content: 'Quiz session not found or already started.', ephemeral: true });
      return;
    }

    // Clear waiting timeout
    const waitingTimeoutId = this.waitingTimeouts.get(sessionId);
    if (waitingTimeoutId) {
      clearTimeout(waitingTimeoutId);
      this.waitingTimeouts.delete(sessionId);
    }

    await interaction.deferUpdate();
    
    // Start the quiz questions
    await this.startQuizQuestions(session, interaction.channel as TextChannel);
  }

  /**
   * Handle total quiz timeout
   */
  private async handleTotalQuizTimeout(session: QuizSession, channel: TextChannel): Promise<void> {
    if (!session.isActive) return;

    await channel.send('⏰ **Total quiz time limit reached!** The quiz will now end.');
    
    // End the quiz immediately
    await this.endQuiz(session, channel);
  }

  /**
   * Start the actual quiz questions
   */
  private async startQuizQuestions(session: QuizSession, channel: TextChannel): Promise<void> {
    session.isWaiting = false;

    // Check if anyone joined
    if (session.participants.size === 0) {
      await channel.send('❌ No one joined the quiz. Quiz cancelled.');
      this.activeSessions.delete(session.id);
      return;
    }

    // Get quiz data from database
    const quiz = await databaseService.prisma.quiz.findUnique({
      where: { id: session.quizId },
      include: { questions: true },
    });

    if (!quiz) {
      await channel.send('❌ Quiz not found in database.');
      return;
    }

    // Set total quiz timeout if timeLimit is specified
    if ((quiz as any).timeLimit) {
      const totalTimeoutId = setTimeout(() => {
        this.handleTotalQuizTimeout(session, channel);
      }, (quiz as any).timeLimit * 1000);

      this.totalQuizTimeouts.set(session.id, totalTimeoutId);
      
      logger.info(`Total quiz timeout set for ${(quiz as any).timeLimit}s for session ${session.id}`);
    }

    // Start the first question
    await this.displayQuestion(session, quiz.questions, channel);
  }

  /**
   * Update the waiting message with current participant count
   */
  private async updateWaitingMessage(session: QuizSession, channel: TextChannel): Promise<void> {
    if (!session.messageId) return;

    try {
      const message = await channel.messages.fetch(session.messageId);
      const embed = message.embeds[0];
      
      if (embed) {
        const newEmbed = EmbedBuilder.from(embed);
        newEmbed.spliceFields(2, 1, { name: 'Participants', value: session.participants.size.toString(), inline: true });
        
        await message.edit({ embeds: [newEmbed] });
      }
    } catch (error) {
      logger.error('Error updating waiting message:', error);
    }
  }

  /**
   * Display the current question
   */
  private async displayQuestion(
    session: QuizSession,
    questions: any[],
    channel: TextChannel
  ): Promise<void> {
    if (!session.isActive) return;

    const question = questions[session.currentQuestionIndex];
    const options = JSON.parse(question.options);
    
    // Use question's individual time limit or fall back to default
    const questionTimeLimit = question.timeLimit || config.quiz.defaultQuestionTimeout;
    
    const embed = new EmbedBuilder()
      .setTitle(`Question ${session.currentQuestionIndex + 1} of ${questions.length}`)
      .setDescription(question.questionText)
      .addFields(
        { name: 'Points', value: question.points.toString(), inline: true },
        { name: 'Time Limit', value: `${questionTimeLimit}s`, inline: true },
        { name: 'Participants', value: session.participants.size.toString(), inline: true }
      )
      .setColor('#ff9900')
      .setTimestamp();

    const buttons = options.map((option: string, index: number) =>
      new ButtonBuilder()
        .setCustomId(`quiz_answer_${session.id}_${session.currentQuestionIndex}_${index}`)
        .setLabel(`${String.fromCharCode(65 + index)}. ${option}`)
        .setStyle(ButtonStyle.Secondary)
    );

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < buttons.length; i += 4) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 4));
      rows.push(row);
    }

    let message;
    if (session.isPrivate) {
      // For private quizzes, send to the quiz owner
      const quizOwnerId = Array.from(session.participants.keys())[0]; // First participant is the owner
      if (!quizOwnerId) {
        logger.error('No participants found for private quiz');
        return;
      }
      const user = await this.client?.users.fetch(quizOwnerId);
      if (user) {
        message = await user.send({
          embeds: [embed],
          components: rows,
        });
      } else {
        logger.error(`Could not send private quiz message to user ${quizOwnerId}`);
        return;
      }
    } else {
      // For public quizzes, send to the channel
      message = await channel.send({
        embeds: [embed],
        components: rows,
      });
    }

    // Track when this question started
    session.questionStartTime = new Date();

    // Schedule button cleanup for question
    if (message) {
      if (session.isPrivate) {
        // For private quizzes, we don't need to schedule cleanup since DM messages can't be edited by bots after user interaction
        // The message buttons will be automatically disabled after the question timeout
      } else {
        buttonCleanupService.scheduleQuestionCleanup(message.id, channel.id, questionTimeLimit + 10);
      }
    }

    // Set question timeout using the question's individual time limit
    const questionTimeoutId = setTimeout(() => {
      this.handleQuestionTimeout(session, channel);
    }, questionTimeLimit * 1000);

    this.questionTimeouts.set(`${session.id}_${session.currentQuestionIndex}`, questionTimeoutId);
  }

  /**
   * Handle answer button clicks
   */
  public async handleAnswer(interaction: ButtonInteraction): Promise<void> {
    const parts = interaction.customId.split('_');
    if (parts.length < 5) {
      await interaction.reply({ content: 'Invalid button interaction.', ephemeral: true });
      return;
    }

    const [, , sessionId, questionIndex, answerIndex] = parts;
    if (!sessionId || !questionIndex || !answerIndex) {
      await interaction.reply({ content: 'Invalid button interaction.', ephemeral: true });
      return;
    }

    const session = this.activeSessions.get(sessionId);
    
    if (!session || !session.isActive || session.isWaiting) {
      await interaction.reply({ content: 'Quiz session not found or not accepting answers.', ephemeral: true });
      return;
    }

    const questionIdx = parseInt(questionIndex);
    if (questionIdx !== session.currentQuestionIndex) {
      await interaction.reply({ content: 'This question has already been answered.', ephemeral: true });
      return;
    }

    const answerIdx = parseInt(answerIndex);
    const userId = interaction.user.id;

    // Check if user is a participant
    const participant = session.participants.get(userId);
    if (!participant) {
      await interaction.reply({ content: 'You are not a participant in this quiz.', ephemeral: true });
      return;
    }

    // Check if user already answered this question
    if (participant.answers.has(questionIdx)) {
      await interaction.reply({ content: 'You have already answered this question.', ephemeral: true });
      return;
    }

    // Get question data
    const quiz = await databaseService.prisma.quiz.findUnique({
      where: { id: session.quizId },
      include: { questions: true },
    });

    if (!quiz) {
      await interaction.reply({ content: 'Quiz not found.', ephemeral: true });
      return;
    }

    const question = quiz.questions[questionIdx];
    if (!question) {
      await interaction.reply({ content: 'Question not found.', ephemeral: true });
      return;
    }

    const isCorrect = answerIdx === question.correctAnswer;
    
    // Calculate points based on question start time, not quiz start time
    const timeSpent = session.questionStartTime 
      ? Math.floor((Date.now() - session.questionStartTime.getTime()) / 1000)
      : 0;
    const basePoints = isCorrect ? question.points : 0;
    const speedBonus = isCorrect ? Math.floor(basePoints * config.quiz.speedBonusMultiplier * (1 - timeSpent / (question.timeLimit || config.quiz.defaultQuestionTimeout))) : 0;
    
    // Update participant
    participant.score += basePoints + speedBonus;
    participant.streak = isCorrect ? participant.streak + 1 : 0;
    participant.answers.set(questionIdx, {
      questionIndex: questionIdx,
      selectedAnswer: answerIdx,
      isCorrect,
      timeSpent,
      pointsEarned: basePoints + speedBonus,
      answeredAt: new Date(),
    });

    // Send feedback
    const feedback = isCorrect ? '✅ Correct!' : '❌ Incorrect!';
    const pointsText = isCorrect ? ` (+${basePoints + speedBonus} points)` : '';
    await interaction.reply({ content: `${feedback}${pointsText}`, ephemeral: true });

    // Note: Questions now only end when the timer expires, not when all participants answer
    // This allows participants to see the "already answered" message and wait for the full timer
  }

  /**
   * Handle question timeout
   */
  private async handleQuestionTimeout(session: QuizSession, channel: TextChannel): Promise<void> {
    if (!session.isActive || session.isQuestionComplete) return;

    session.isQuestionComplete = true;
    
    // Get the current question
    const quiz = await databaseService.prisma.quiz.findUnique({
      where: { id: session.quizId },
      include: { questions: true },
    });

    if (!quiz) {
      logger.error(`Quiz ${session.quizId} not found`);
      return;
    }

    const question = quiz.questions[session.currentQuestionIndex];
    if (!question) {
      logger.error(`Question at index ${session.currentQuestionIndex} not found`);
      return;
    }

    const options = JSON.parse(question.options);

    await this.showQuestionResults(session, question, options, channel);
  }

  /**
   * Show question results and remove buttons
   */
  private async showQuestionResults(
    session: QuizSession,
    question: any,
    options: string[],
    channel: TextChannel
  ): Promise<void> {
    if (!session.isActive) return;

    let lastMessage;
    if (session.isPrivate) {
      // For private quizzes, we can't easily get the last message from DM
      // Just proceed without removing buttons
    } else {
      // Get the last message in the channel (should be the question message)
      const messages = await channel.messages.fetch({ limit: 1 });
      lastMessage = messages.first();
      
      if (lastMessage && lastMessage.components.length > 0) {
        // Remove buttons from the question message
        await buttonCleanupService.removeButtons(lastMessage.id, channel.id, 'question');
      }
    }

    const correctAnswer = options[question.correctAnswer];
    const correctAnswerLetter = String.fromCharCode(65 + question.correctAnswer);

    const embed = new EmbedBuilder()
      .setTitle('⏰ Time\'s Up!')
      .setDescription(`**Correct Answer:** ${correctAnswerLetter}. ${correctAnswer}`)
      .addFields(
        { name: 'Points Available', value: question.points.toString(), inline: true },
        { name: 'Correct Answers', value: this.getCorrectAnswersCount(session, session.currentQuestionIndex).toString(), inline: true },
        { name: 'Total Answers', value: this.getTotalAnswersCount(session, session.currentQuestionIndex).toString(), inline: true }
      )
      .setColor('#ff0000')
      .setTimestamp();

    if (session.isPrivate) {
      // For private quizzes, send to the quiz owner
      const quizOwnerId = Array.from(session.participants.keys())[0];
      if (quizOwnerId) {
        const user = await this.client?.users.fetch(quizOwnerId);
        if (user) {
          await user.send({ embeds: [embed] });
        }
      }
    } else {
      // For public quizzes, send to the channel
      await channel.send({ embeds: [embed] });
    }

    // Move to next question or end quiz
    session.currentQuestionIndex++;
    session.isQuestionComplete = false;

    // Get quiz data for next question check
    const quiz = await databaseService.prisma.quiz.findUnique({
      where: { id: session.quizId },
      include: { questions: true },
    });

    if (!quiz) {
      logger.error(`Quiz ${session.quizId} not found for next question`);
      await this.endQuiz(session, channel);
      return;
    }

    if (session.currentQuestionIndex >= quiz.questions.length) {
      await this.endQuiz(session, channel);
    } else {
      // Wait a moment before showing next question
      setTimeout(() => {
        this.displayQuestion(session, quiz.questions, channel);
      }, 3000);
    }
  }

  /**
   * End the quiz and show final results
   */
  private async endQuiz(session: QuizSession, channel: TextChannel): Promise<void> {
    if (!session.isActive) return;

    session.isActive = false;
    session.isWaiting = false;

    // Clear all timeouts
    this.clearAllTimeouts(session);

    // Remove buttons from quiz join message if it exists
    if (session.messageId && !session.isPrivate) {
      await buttonCleanupService.removeButtons(session.messageId, channel.id, 'quiz');
    }

    try {
      // Calculate final scores and times
      const participants = Array.from(session.participants.values());
      const endTime = new Date();
      
      // Sort participants by score (descending), then by time (ascending)
      participants.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const aTime = endTime.getTime() - a.startTime.getTime();
        const bTime = endTime.getTime() - b.startTime.getTime();
        return aTime - bTime;
      });

      // Create results embed
      const embed = new EmbedBuilder()
        .setTitle('🏁 Quiz Complete!')
        .setColor('#00ff00')
        .setTimestamp();

      if (participants.length === 0) {
        embed.setDescription('No participants joined the quiz.');
      } else {
        const totalTime = Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000);
        embed.addFields(
          { name: '📊 Final Results', value: 'Here are the final standings:', inline: false },
          { name: '⏱️ Total Time', value: `${Math.floor(totalTime / 60)}m ${totalTime % 60}s`, inline: true },
          { name: '👥 Participants', value: participants.length.toString(), inline: true }
        );

        // Add participant results
        const resultsText = participants
          .map((participant, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const participantTime = Math.floor((endTime.getTime() - participant.startTime.getTime()) / 1000);
            const timeText = `${Math.floor(participantTime / 60)}m ${participantTime % 60}s`;
            return `${medal} **${participant.username}** - ${participant.score} pts (${timeText})`;
          })
          .join('\n');

        embed.addFields({ name: '🏆 Standings', value: resultsText, inline: false });

        // Save quiz attempt to database
        await this.saveQuizAttempts(session, participants, totalTime);

        // Update leaderboard scores only for public quizzes
        if (!session.isPrivate) {
          await this.updateLeaderboardScores(participants);
        }
      }

      // Send final results
      if (session.isPrivate) {
        // For private quizzes, send to the quiz owner
        const quizOwnerId = Array.from(session.participants.keys())[0];
        if (quizOwnerId) {
          const user = await this.client?.users.fetch(quizOwnerId);
          if (user) {
            await user.send({ embeds: [embed] });
          }
        }
      } else {
        // For public quizzes, send to the channel
        await channel.send({ embeds: [embed] });
      }

      // Clean up session
      this.activeSessions.delete(session.id);
      logger.info(`Quiz ${session.id} ended with ${participants.length} participants`);

    } catch (error) {
      logger.error('Error ending quiz:', error);
    }
  }

  /**
   * Save quiz attempts to database
   */
  private async saveQuizAttempts(
    session: QuizSession,
    participants: ParticipantData[],
    totalTime: number
  ): Promise<void> {
    try {
      // Get quiz data to access actual question IDs
      const quiz = await databaseService.prisma.quiz.findUnique({
        where: { id: session.quizId },
        include: { questions: true },
      });

      if (!quiz) {
        logger.error(`Quiz ${session.quizId} not found for saving attempts`);
        return;
      }

      for (const participant of participants) {
        // Create quiz attempt
        const quizAttempt = await databaseService.prisma.quizAttempt.create({
          data: {
            userId: participant.userId,
            quizId: session.quizId,
            totalScore: participant.score,
            totalTime,
            completedAt: new Date(),
          },
        });

        // Save question attempts with actual question IDs
        const questionAttempts = Array.from(participant.answers.values())
          .map(answer => {
            const question = quiz.questions[answer.questionIndex];
            if (!question) {
              logger.warn(`Question at index ${answer.questionIndex} not found for participant ${participant.userId}`);
              return null;
            }

            return {
              quizAttemptId: quizAttempt.id,
              questionId: question.id, // Use actual question ID
              selectedAnswer: answer.selectedAnswer,
              isCorrect: answer.isCorrect,
              timeSpent: answer.timeSpent,
              pointsEarned: answer.pointsEarned,
              answeredAt: answer.answeredAt,
            };
          })
          .filter((attempt): attempt is NonNullable<typeof attempt> => attempt !== null); // Type-safe filter

        if (questionAttempts.length > 0) {
          await databaseService.prisma.questionAttempt.createMany({
            data: questionAttempts,
          });
        }
      }

      logger.info(`Saved ${participants.length} quiz attempts to database`);
    } catch (error) {
      logger.error('Error saving quiz attempts:', error);
    }
  }

  /**
   * Update leaderboard scores
   */
  private async updateLeaderboardScores(
    participants: ParticipantData[]
  ): Promise<void> {
    try {
      const endTime = new Date();
      
      for (const participant of participants) {
        const participantTime = Math.floor((endTime.getTime() - participant.startTime.getTime()) / 1000);
        
        // Update scores for all periods
        await Promise.all([
          leaderboardService.updateScore(participant.userId, 'weekly', participant.score, participantTime),
          leaderboardService.updateScore(participant.userId, 'monthly', participant.score, participantTime),
          leaderboardService.updateScore(participant.userId, 'yearly', participant.score, participantTime),
          leaderboardService.updateScore(participant.userId, 'overall', participant.score, participantTime),
        ]);
      }

      logger.info(`Updated leaderboard scores for ${participants.length} participants`);
    } catch (error) {
      logger.error('Error updating leaderboard scores:', error);
    }
  }

  /**
   * Save quiz to database
   */
  private async saveQuizToDatabase(quizConfig: QuizConfig, quizId: string, isPrivate: boolean, userId?: string): Promise<void> {
    try {
      await databaseService.prisma.quiz.create({
        data: {
          id: quizId,
          title: quizConfig.title,
          description: quizConfig.description || null,
          timeLimit: quizConfig.timeLimit || null,
          private: isPrivate,
          quizOwnerId: userId,
          questions: {
            create: quizConfig.questions.map(q => ({
              questionText: q.questionText,
              options: JSON.stringify(q.options),
              correctAnswer: q.correctAnswer,
              points: q.points || config.quiz.pointsPerCorrectAnswer,
              timeLimit: q.timeLimit || config.quiz.defaultQuestionTimeout,
            })),
          },
        } as any,
      });
    } catch (error) {
      logger.error('Error saving quiz to database:', error);
    }
  }

  /**
   * Get count of correct answers for a question
   */
  private getCorrectAnswersCount(session: QuizSession, questionIndex: number): number {
    return Array.from(session.participants.values()).filter(
      participant => participant.answers.get(questionIndex)?.isCorrect
    ).length;
  }

  /**
   * Get count of total answers for a question
   */
  private getTotalAnswersCount(session: QuizSession, questionIndex: number): number {
    return Array.from(session.participants.values()).filter(
      participant => participant.answers.has(questionIndex)
    ).length;
  }

  /**
   * Get active session by channel ID
   */
  public getActiveSessionByChannel(channelId: string): QuizSession | undefined {
    return Array.from(this.activeSessions.values()).find(
      session => session.channelId === channelId && session.isActive
    );
  }

  /**
   * Stop a quiz session
   */
  public async stopQuiz(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Quiz session ${sessionId} not found`);
    }

    // Remove buttons from quiz join message if it exists
    if (session.messageId) {
      await buttonCleanupService.removeButtons(session.messageId, session.channelId, 'quiz');
    }

    // Clear all timeouts
    this.clearAllTimeouts(session);

    // Mark session as inactive
    session.isActive = false;
    session.isWaiting = false;

    // Get channel and send stop message
    try {
      const channel = await this.getChannel(session.channelId);
      if (channel) {
        await channel.send('🛑 Quiz has been stopped by an administrator.');
      }
    } catch (error) {
      logger.error('Error sending stop message:', error);
    }

    // Remove from active sessions
    this.activeSessions.delete(sessionId);
    
    logger.info(`Quiz session ${sessionId} stopped by administrator`);
  }

  /**
   * Get channel by ID
   */
  private async getChannel(channelId: string): Promise<TextChannel | null> {
    if (!this.client) {
      logger.error('Discord client not set in QuizService');
      return null;
    }

    try {
      const channel = await this.client.channels.fetch(channelId);
      return channel?.isTextBased() ? channel as TextChannel : null;
    } catch (error) {
      logger.error(`Error fetching channel ${channelId}:`, error);
      return null;
    }
  }

  private clearAllTimeouts(session: QuizSession): void {
    // Clear all timeouts for the session
    for (const [key, timeoutId] of this.questionTimeouts.entries()) {
      if (key.startsWith(session.id + '_')) {
        clearTimeout(timeoutId);
        this.questionTimeouts.delete(key);
      }
    }

    // Clear total quiz timeout
    const totalTimeoutId = this.totalQuizTimeouts.get(session.id);
    if (totalTimeoutId) {
      clearTimeout(totalTimeoutId);
      this.totalQuizTimeouts.delete(session.id);
    }
  }

  /**
   * Handle button interactions for quiz-related buttons
   */
  public async handleButtonInteraction(interaction: ButtonInteraction): Promise<void> {
    const { customId } = interaction;

    try {
      if (customId.startsWith('quiz_join_')) {
        await this.handleJoin(interaction);
      } else if (customId.startsWith('quiz_start_')) {
        await this.handleManualStart(interaction);
      } else if (customId.startsWith('quiz_answer_')) {
        await this.handleAnswer(interaction);
      } else {
        logger.warn(`Unknown quiz button interaction: ${customId}`);
      }
    } catch (error) {
      logger.error('Error handling quiz button interaction:', error);
      await interaction.reply({ 
        content: '❌ An error occurred while processing your request.', 
        ephemeral: true 
      });
    }
  }

  /**
   * Seed example quizzes if the Quiz table is empty
   */
  public static async seedQuizzesIfEmpty() {
    const quizCount = await databaseService.prisma.quiz.count();
    if (quizCount > 0) {
      logger.info('Quiz table is not empty, skipping seeding.');
      return;
    }
    logger.info('Quiz table is empty, seeding example quizzes...');
    const fs = require('fs');
    const path = require('path');
    const dataPath = path.join(process.cwd(), 'data', 'sample-questions.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    for (const quiz of data.quizzes) {
      const quizId = require('uuid').v4();
      await QuizService.getInstance().saveQuizToDatabase(quiz, quizId, false);
      logger.info(`Seeded quiz: ${quiz.title}`);
    }
    logger.info('Seeding complete.');
  }
}

export const quizService = QuizService.getInstance(); 