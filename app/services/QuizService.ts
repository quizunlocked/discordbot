import {
  TextChannel,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonInteraction,
  Client,
  AttachmentBuilder,
} from 'discord.js';
import { databaseService } from './DatabaseService.js';
import { leaderboardService } from './LeaderboardService.js';
import { buttonCleanupService } from './ButtonCleanupService.js';
import { logger } from '../utils/logger.js';
import { config } from '../utils/config.js';
import { QuizSession, ParticipantData, QuizConfig, DiscordMessageOptions } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';

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
      answerSubmissionOrder: 0, // Initialize answer submission counter
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
        {
          name: 'Time Limit',
          value: `${config.quiz.defaultQuestionTimeout}s per question`,
          inline: true,
        },
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

    logger.info(
      `Quiz session ${sessionId} started in channel ${channel.id} with ${waitTime}s wait time`
    );
  }

  /**
   * Handle join button clicks
   */
  public async handleJoin(interaction: ButtonInteraction): Promise<void> {
    const sessionId = interaction.customId.replace('quiz_join_', '');
    const session = this.activeSessions.get(sessionId);

    if (!session || !session.isActive || !session.isWaiting) {
      await interaction.reply({
        content: 'Quiz session not found or not accepting participants.',
        ephemeral: true,
      });
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
      await interaction.reply({
        content: 'Quiz session not found or already started.',
        ephemeral: true,
      });
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
      include: {
        questions: {
          include: {
            image: true,
            hints: true,
          },
        },
      },
    });

    if (!quiz) {
      await channel.send('❌ Quiz not found in database.');
      return;
    }

    // Set total quiz timeout if timeLimit is specified
    if (quiz?.timeLimit) {
      const totalTimeoutId = setTimeout(() => {
        this.handleTotalQuizTimeout(session, channel);
      }, quiz.timeLimit * 1000);

      this.totalQuizTimeouts.set(session.id, totalTimeoutId);

      logger.info(`Total quiz timeout set for ${quiz.timeLimit}s for session ${session.id}`);
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
        newEmbed.spliceFields(2, 1, {
          name: 'Participants',
          value: session.participants.size.toString(),
          inline: true,
        });

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
    questions: Array<{
      id: string;
      questionText: string;
      options: string;
      correctAnswer: number;
      points: number;
      timeLimit?: number | null;
      hints: Array<{ id: string; title: string; text: string }>;
      image?: { id: string; path: string; title?: string | null; altText?: string | null } | null;
    }>,
    channel: TextChannel
  ): Promise<void> {
    if (!session.isActive) return;

    const question = questions[session.currentQuestionIndex];
    if (!question) {
      logger.error('Question not found at index:', session.currentQuestionIndex);
      return;
    }
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

    // Add image if present
    if (question.image && question.image.path) {
      const imagePath = path.resolve(question.image.path);
      try {
        // Check if image file exists
        await fs.access(imagePath);

        // For public quizzes, we can use attachments
        if (!session.isPrivate) {
          embed.setImage(
            `attachment://question-image.${path.extname(question.image.path).slice(1)}`
          );
        }

        // Add alt text if available
        if (question.image.altText) {
          embed.setFooter({ text: `Image: ${question.image.altText}` });
        }
      } catch (error) {
        logger.warn(`Image file not found for question ${question.id}: ${imagePath}`);
      }
    }

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

    // Add hint buttons if they exist
    if (question.hints && question.hints.length > 0) {
      const hintButtons = question.hints.map(hint =>
        new ButtonBuilder()
          .setCustomId(`quiz_hint_${session.id}_${session.currentQuestionIndex}_${hint.id}`)
          .setLabel(`💡 ${hint.title}`)
          .setStyle(ButtonStyle.Primary)
      );

      // Add hint buttons in a separate row (limit to 5 per row as per Discord limits)
      for (let i = 0; i < hintButtons.length; i += 5) {
        const hintRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          hintButtons.slice(i, i + 5)
        );
        rows.push(hintRow);
      }
    }

    // Prepare message options
    const messageOptions: DiscordMessageOptions = {
      embeds: [embed],
      components: rows,
    };

    // Add image attachment if present
    if (question.image && question.image.path) {
      const imagePath = path.resolve(question.image.path);
      try {
        await fs.access(imagePath);
        const imageBuffer = await fs.readFile(imagePath);
        const imageExtension = path.extname(question.image.path).slice(1);

        messageOptions.files = [
          new AttachmentBuilder(imageBuffer, {
            name: `question-image.${imageExtension}`,
          }),
        ];
      } catch (error) {
        logger.warn(`Could not attach image for question ${question.id}: ${error}`);
      }
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
        message = await user.send(messageOptions);
      } else {
        logger.error(`Could not send private quiz message to user ${quizOwnerId}`);
        return;
      }
    } else {
      // For public quizzes, send to the channel
      message = await channel.send(messageOptions);
    }

    // Cache the question message ID for real-time updates (public quizzes only)
    if (message && !session.isPrivate) {
      session.currentQuestionMessageId = message.id;
      logger.info(
        `Cached question message ID ${message.id} for session ${session.id}, question ${session.currentQuestionIndex + 1} (Discord timestamp: ${message.createdAt.toISOString()})`
      );
    }

    // Reset answer submission order for new question
    session.answerSubmissionOrder = 0;
    delete session.fastestCorrectAnswerId;

    logger.info(`Displayed question ${session.currentQuestionIndex + 1} for session ${session.id}`);

    // Track when this question started - use Discord's message timestamp for accuracy
    session.questionStartTime = message ? message.createdAt : new Date();

    // Schedule button cleanup for question
    if (message) {
      if (session.isPrivate) {
        // For private quizzes, we don't need to schedule cleanup since DM messages can't be edited by bots after user interaction
        // The message buttons will be automatically disabled after the question timeout
      } else {
        buttonCleanupService.scheduleQuestionCleanup(
          message.id,
          channel.id,
          questionTimeLimit + 10
        );
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
      await interaction.reply({
        content: 'Quiz session not found or not accepting answers.',
        ephemeral: true,
      });
      return;
    }

    const questionIdx = parseInt(questionIndex);
    if (questionIdx !== session.currentQuestionIndex) {
      await interaction.reply({
        content: 'This question has already been answered.',
        ephemeral: true,
      });
      return;
    }

    const answerIdx = parseInt(answerIndex);
    const userId = interaction.user.id;

    // Check if user is a participant
    const participant = session.participants.get(userId);
    if (!participant) {
      await interaction.reply({
        content: 'You are not a participant in this quiz.',
        ephemeral: true,
      });
      return;
    }

    // Check if user already answered this question
    if (participant.answers.has(questionIdx)) {
      await interaction.reply({
        content: 'You have already answered this question.',
        ephemeral: true,
      });
      return;
    }

    // Get question data
    const quiz = await databaseService.prisma.quiz.findUnique({
      where: { id: session.quizId },
      include: {
        questions: {
          include: {
            image: true,
            hints: true,
          },
        },
      },
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
    const answeredAt = interaction.createdAt; // Use Discord's server-side timestamp for fairness

    // Increment answer submission order
    session.answerSubmissionOrder++;
    const answerRank = session.answerSubmissionOrder;

    // Check if this is the fastest correct answer
    let wasFastestCorrect = false;
    if (isCorrect && !session.fastestCorrectAnswerId) {
      session.fastestCorrectAnswerId = userId;
      wasFastestCorrect = true;
    }

    // Calculate points based on question start time, not quiz start time
    const timeSpent = session.questionStartTime
      ? Math.floor((answeredAt.getTime() - session.questionStartTime.getTime()) / 1000)
      : 0;
    const basePoints = isCorrect ? question.points : 0;
    const speedBonus = isCorrect
      ? Math.floor(
          basePoints *
            config.quiz.speedBonusMultiplier *
            (1 - timeSpent / (question.timeLimit || config.quiz.defaultQuestionTimeout))
        )
      : 0;

    // Update participant
    participant.score += basePoints + speedBonus;
    participant.streak = isCorrect ? participant.streak + 1 : 0;
    participant.answers.set(questionIdx, {
      questionIndex: questionIdx,
      selectedAnswer: answerIdx,
      isCorrect,
      timeSpent,
      pointsEarned: basePoints + speedBonus,
      questionStartedAt: session.questionStartTime || new Date(),
      answeredAt,
      answerRank,
      wasFastestCorrect,
    });

    // Send feedback with fastest answer notification
    const feedback = isCorrect ? '✅ Correct!' : '❌ Incorrect!';
    const pointsText = isCorrect ? ` (+${basePoints + speedBonus} points)` : '';
    const fastestText = wasFastestCorrect ? ' 🏃‍♂️ **Fastest correct answer!**' : '';
    await interaction.reply({ content: `${feedback}${pointsText}${fastestText}`, ephemeral: true });

    // Update question embed with current progress (public quizzes only)
    if (!session.isPrivate) {
      await this.updateQuestionProgress(session, interaction.channel as TextChannel);
    }

    // Note: Questions now only end when the timer expires, not when all participants answer
    // This allows participants to see the "already answered" message and wait for the full timer
  }

  /**
   * Update question embed with current answer progress
   */
  private async updateQuestionProgress(session: QuizSession, channel: TextChannel): Promise<void> {
    if (!session.currentQuestionMessageId || session.isPrivate) return;

    // Rate limiting: Don't update more than once per second
    const now = new Date();
    if (session.lastEmbedUpdate && now.getTime() - session.lastEmbedUpdate.getTime() < 1000) {
      logger.debug(
        `Rate limiting embed update for session ${session.id} (last update ${now.getTime() - session.lastEmbedUpdate.getTime()}ms ago)`
      );
      return;
    }

    try {
      const message = await channel.messages.fetch(session.currentQuestionMessageId);
      const embed = message.embeds[0];

      if (embed) {
        const newEmbed = EmbedBuilder.from(embed);

        // Count how many participants have answered this question
        const answeredCount = Array.from(session.participants.values()).filter(participant =>
          participant.answers.has(session.currentQuestionIndex)
        ).length;

        // Update the progress field (third field, index 2)
        newEmbed.spliceFields(2, 1, {
          name: 'Participants',
          value: `${answeredCount} of ${session.participants.size} answered`,
          inline: true,
        });

        await message.edit({ embeds: [newEmbed] });
        session.lastEmbedUpdate = now;
      }
    } catch (error) {
      logger.warn('Error updating question progress:', error);
    }
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
      include: {
        questions: {
          include: {
            image: true,
            hints: true,
          },
        },
      },
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
    question: {
      id: string;
      questionText: string;
      options: string;
      correctAnswer: number;
      points: number;
      timeLimit?: number | null;
      hints: Array<{ id: string; title: string; text: string }>;
      image?: { id: string; path: string; title?: string | null; altText?: string | null } | null;
    },
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
      .setTitle("⏰ Time's Up!")
      .setDescription(`**Correct Answer:** ${correctAnswerLetter}. ${correctAnswer}`)
      .addFields(
        { name: 'Points Available', value: question.points.toString(), inline: true },
        {
          name: 'Correct Answers',
          value: this.getCorrectAnswersCount(session, session.currentQuestionIndex).toString(),
          inline: true,
        },
        {
          name: 'Total Answers',
          value: this.getTotalAnswersCount(session, session.currentQuestionIndex).toString(),
          inline: true,
        }
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
      include: {
        questions: {
          include: {
            image: true,
            hints: true,
          },
        },
      },
    });

    if (!quiz) {
      logger.error(`Quiz ${session.quizId} not found for next question`);
      await this.endQuiz(session, channel);
      return;
    }

    if (session.currentQuestionIndex >= quiz.questions.length) {
      logger.info(`Quiz ${session.id} completed after ${session.currentQuestionIndex} questions`);
      await this.endQuiz(session, channel);
    } else {
      logger.info(
        `Moving to question ${session.currentQuestionIndex + 1} for session ${session.id} after 3s delay`
      );
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

      // Sort participants by score (descending), then by average response time (ascending - faster wins)
      participants.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;

        // Calculate average response times for tie-breaking
        const aAnswers = Array.from(a.answers.values());
        const bAnswers = Array.from(b.answers.values());

        const aAvgTime =
          aAnswers.length > 0
            ? aAnswers.reduce((sum, answer) => sum + answer.timeSpent, 0) / aAnswers.length
            : Infinity; // If no answers, put at end
        const bAvgTime =
          bAnswers.length > 0
            ? bAnswers.reduce((sum, answer) => sum + answer.timeSpent, 0) / bAnswers.length
            : Infinity;

        return aAvgTime - bAvgTime; // Lower average time wins
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

        // Calculate overall average response time across all participants
        const allAnswers = participants.flatMap(p => Array.from(p.answers.values()));
        const overallAvgResponseTime =
          allAnswers.length > 0
            ? Number(
                (
                  allAnswers.reduce((sum, answer) => sum + answer.timeSpent, 0) / allAnswers.length
                ).toFixed(2)
              )
            : 0;

        embed.addFields(
          { name: '📊 Final Results', value: 'Here are the final standings:', inline: false },
          {
            name: '⏱️ Avg Response Time',
            value: `${overallAvgResponseTime}s`,
            inline: true,
          },
          { name: '👥 Participants', value: participants.length.toString(), inline: true }
        );

        // Add participant results
        const resultsText = participants
          .map((participant, index) => {
            const medal =
              index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;

            // Calculate average response time per question
            const answeredQuestions = Array.from(participant.answers.values());
            const avgResponseTime =
              answeredQuestions.length > 0
                ? Number(
                    (
                      answeredQuestions.reduce((sum, answer) => sum + answer.timeSpent, 0) /
                      answeredQuestions.length
                    ).toFixed(2)
                  )
                : 0;

            const timeText = `avg time: ${avgResponseTime}s`;
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
        include: {
          questions: {
            include: {
              image: true,
              hints: true,
            },
          },
        },
      });

      if (!quiz) {
        logger.error(`Quiz ${session.quizId} not found for saving attempts`);
        return;
      }

      for (const participant of participants) {
        // Ensure user exists in database (upsert)
        await databaseService.prisma.user.upsert({
          where: { id: participant.userId },
          update: {
            username: participant.username, // Update username in case it changed
          },
          create: {
            id: participant.userId,
            username: participant.username,
          },
        });

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
              logger.warn(
                `Question at index ${answer.questionIndex} not found for participant ${participant.userId}`
              );
              return null;
            }

            return {
              quizAttemptId: quizAttempt.id,
              questionId: question.id, // Use actual question ID
              questionStartedAt: answer.questionStartedAt,
              selectedAnswer: answer.selectedAnswer,
              isCorrect: answer.isCorrect,
              timeSpent: answer.timeSpent,
              pointsEarned: answer.pointsEarned,
              answeredAt: answer.answeredAt,
              wasFastestCorrect: answer.wasFastestCorrect || null,
              answerRank: answer.answerRank || null,
            };
          })
          .filter((attempt): attempt is NonNullable<typeof attempt> => attempt !== null); // Type-safe filter

        if (questionAttempts.length > 0) {
          await databaseService.prisma.questionAttempt.createMany({
            data: questionAttempts,
          });
        }
      }

      logger.info(
        `Saved ${participants.length} quiz attempts to database for participants: ${participants.map(p => p.username).join(', ')}`
      );
    } catch (error) {
      logger.error('Error saving quiz attempts:', error);
      throw error; // Re-throw to see the actual error
    }
  }

  /**
   * Update leaderboard scores
   */
  private async updateLeaderboardScores(participants: ParticipantData[]): Promise<void> {
    try {
      const endTime = new Date();

      for (const participant of participants) {
        const participantTime = Math.floor(
          (endTime.getTime() - participant.startTime.getTime()) / 1000
        );

        // Update scores for all periods
        await Promise.all([
          leaderboardService.updateScore(
            participant.userId,
            'weekly',
            participant.score,
            participantTime
          ),
          leaderboardService.updateScore(
            participant.userId,
            'monthly',
            participant.score,
            participantTime
          ),
          leaderboardService.updateScore(
            participant.userId,
            'yearly',
            participant.score,
            participantTime
          ),
          leaderboardService.updateScore(
            participant.userId,
            'overall',
            participant.score,
            participantTime
          ),
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
  private async saveQuizToDatabase(
    quizConfig: QuizConfig,
    quizId: string,
    isPrivate: boolean,
    userId?: string
  ): Promise<void> {
    try {
      const createData: any = {
        id: quizId,
        title: quizConfig.title,
        description: quizConfig.description || null,
        timeLimit: quizConfig.timeLimit || null,
        private: isPrivate,
        questions: {
          create: quizConfig.questions.map(q => ({
            questionText: q.questionText,
            options: JSON.stringify(q.options),
            correctAnswer: q.correctAnswer,
            points: q.points || config.quiz.pointsPerCorrectAnswer,
            timeLimit: q.timeLimit || config.quiz.defaultQuestionTimeout,
          })),
        },
      };

      if (userId) {
        createData.quizOwnerId = userId;
      }

      await databaseService.prisma.quiz.create({
        data: createData,
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
    return Array.from(session.participants.values()).filter(participant =>
      participant.answers.has(questionIndex)
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
      return channel?.isTextBased() ? (channel as TextChannel) : null;
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
   * Handle hint button clicks
   */
  public async handleHint(interaction: ButtonInteraction): Promise<void> {
    const parts = interaction.customId.split('_');
    if (parts.length < 5) {
      await interaction.reply({ content: 'Invalid hint button interaction.', ephemeral: true });
      return;
    }

    const [, , sessionId, questionIndex, hintId] = parts;
    if (!sessionId || !questionIndex || !hintId) {
      await interaction.reply({ content: 'Invalid hint button interaction.', ephemeral: true });
      return;
    }

    const session = this.activeSessions.get(sessionId);

    if (!session || !session.isActive || session.isWaiting) {
      await interaction.reply({
        content: 'Quiz session not found or not active.',
        ephemeral: true,
      });
      return;
    }

    const questionIdx = parseInt(questionIndex);
    if (questionIdx !== session.currentQuestionIndex) {
      await interaction.reply({
        content: 'This hint is for a previous question.',
        ephemeral: true,
      });
      return;
    }

    // Get the hint from database
    try {
      const hint = await databaseService.prisma.hint.findUnique({
        where: { id: hintId },
        include: { question: true },
      });

      if (!hint) {
        await interaction.reply({ content: 'Hint not found.', ephemeral: true });
        return;
      }

      // Verify the hint belongs to the current question
      const quiz = await databaseService.prisma.quiz.findUnique({
        where: { id: session.quizId },
        include: {
          questions: {
            include: {
              hints: true,
            },
          },
        },
      });

      if (!quiz) {
        await interaction.reply({ content: 'Quiz not found.', ephemeral: true });
        return;
      }

      const currentQuestion = quiz.questions[questionIdx];
      if (!currentQuestion || currentQuestion.id !== hint.questionId) {
        await interaction.reply({ content: 'Invalid hint for current question.', ephemeral: true });
        return;
      }

      // Send the hint privately to the user
      const embed = new EmbedBuilder()
        .setTitle(`💡 ${hint.title}`)
        .setDescription(hint.text)
        .setColor('#ffff00')
        .setFooter({ text: 'This hint is only visible to you' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

      logger.info(
        `User ${interaction.user.tag} viewed hint "${hint.title}" for question ${questionIdx + 1} in quiz ${session.quizId}`
      );
    } catch (error) {
      logger.error('Error handling hint interaction:', error);
      await interaction.reply({
        content: '❌ An error occurred while loading the hint.',
        ephemeral: true,
      });
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
      } else if (customId.startsWith('quiz_hint_')) {
        await this.handleHint(interaction);
      } else {
        logger.warn(`Unknown quiz button interaction: ${customId}`);
      }
    } catch (error) {
      logger.error('Error handling quiz button interaction:', error);
      await interaction.reply({
        content: '❌ An error occurred while processing your request.',
        ephemeral: true,
      });
    }
  }

  /**
   * Seed example quizzes if the Quiz table is empty
   */
  public static async seedQuizzesIfEmpty(): Promise<void> {
    const quizCount = await databaseService.prisma.quiz.count();
    if (quizCount > 0) {
      logger.info('Quiz table is not empty, skipping seeding.');
      return;
    }
    logger.info('Quiz table is empty, seeding example quizzes...');
    const dataPath = path.join(process.cwd(), 'data', 'sample-questions.json');
    const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
    for (const quiz of data.quizzes) {
      const quizId = uuidv4();
      await QuizService.getInstance().saveQuizToDatabase(quiz, quizId, false);
      logger.info(`Seeded quiz: ${quiz.title}`);
    }
    logger.info('Seeding complete.');
  }

  /**
   * Seed example users with quiz attempts if the User table is empty
   */
  public static async seedUsersIfEmpty(): Promise<void> {
    const userCount = await databaseService.prisma.user.count();
    if (userCount > 0) {
      logger.info('User table is not empty, skipping user seeding.');
      return;
    }

    logger.info('User table is empty, seeding example users with quiz attempts...');

    // Get all existing quizzes to create attempts for
    const quizzes = await databaseService.prisma.quiz.findMany({
      include: { questions: true },
    });

    if (quizzes.length === 0) {
      logger.warn('No quizzes found, cannot seed user attempts. Run quiz seeding first.');
      return;
    }

    // Sample usernames for variety
    const sampleUsernames = [
      'QuizMaster',
      'BrainiacBob',
      'SmartSarah',
      'CleverChloe',
      'WiseWill',
      'GeniusGrace',
      'SharpSharon',
      'BrilliantBen',
      'QuickQuinn',
      'ThinkTank',
      'MindBender',
      'LogicLuke',
      'ReasonRita',
      'FactFinder',
      'TriviaKing',
      'PuzzlePro',
      'KnowItAll',
      'StudyBuddy',
      'BookwormBella',
      'DataDave',
    ];

    // Create 20 users
    for (let i = 0; i < 20; i++) {
      const userId = `user_${i + 1}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const username = sampleUsernames[i]!; // We know this exists

      // Create user
      await databaseService.prisma.user.create({
        data: {
          id: userId,
          username: username,
        },
      });

      // Create quiz attempts for each quiz
      for (const quiz of quizzes) {
        const baseDate = new Date();
        baseDate.setDate(baseDate.getDate() - Math.floor(Math.random() * 30)); // Random date within last 30 days

        // Calculate total possible points for this quiz
        const totalPossiblePoints = quiz.questions.reduce((sum, q) => sum + q.points, 0);

        // Generate a varied score (30% to 95% of total possible points)
        const scorePercentage = 0.3 + Math.random() * 0.65; // 30% to 95%
        const totalScore = Math.floor(totalPossiblePoints * scorePercentage);

        // Random completion time (2-10 minutes)
        const totalTime = 120 + Math.floor(Math.random() * 480); // 2-10 minutes in seconds

        // Create quiz attempt
        const quizAttempt = await databaseService.prisma.quizAttempt.create({
          data: {
            userId: userId,
            quizId: quiz.id,
            startedAt: baseDate,
            completedAt: new Date(baseDate.getTime() + totalTime * 1000),
            totalScore: totalScore,
            totalTime: totalTime,
          },
        });

        // Create question attempts for each question
        let scoreDistributed = 0;
        for (let qIndex = 0; qIndex < quiz.questions.length; qIndex++) {
          const question = quiz.questions[qIndex]!; // We know this exists
          const isLastQuestion = qIndex === quiz.questions.length - 1;

          // Determine if this question was answered correctly
          // Higher chance of correct answers for higher-scoring users
          const correctProbability = Math.min(0.9, scorePercentage + 0.1);
          const isCorrect = Math.random() < correctProbability;

          // Points earned for this question
          let pointsEarned = 0;
          if (isCorrect) {
            if (isLastQuestion) {
              // Give remaining points to last question to match total
              pointsEarned = Math.max(0, totalScore - scoreDistributed);
            } else {
              pointsEarned = question.points;
            }
          }
          scoreDistributed += pointsEarned;

          // Random time spent on question (10-60 seconds)
          const timeSpent = 10 + Math.floor(Math.random() * 50);

          // Selected answer (correct if isCorrect, otherwise random wrong answer)
          let selectedAnswer: number;
          if (isCorrect) {
            selectedAnswer = question.correctAnswer;
          } else {
            const options = JSON.parse(question.options);
            do {
              selectedAnswer = Math.floor(Math.random() * options.length);
            } while (selectedAnswer === question.correctAnswer);
          }

          await databaseService.prisma.questionAttempt.create({
            data: {
              quizAttemptId: quizAttempt.id,
              questionId: question.id,
              selectedAnswer: selectedAnswer,
              isCorrect: isCorrect,
              timeSpent: timeSpent,
              pointsEarned: pointsEarned,
              answeredAt: new Date(baseDate.getTime() + qIndex * 30000), // 30 sec intervals
            },
          });
        }
      }

      logger.info(`Seeded user: ${username} with ${quizzes.length} quiz attempts`);
    }

    logger.info('User seeding complete.');
  }
}

export const quizService = QuizService.getInstance();
