import {
  CommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { logger } from '../../utils/logger.js';

export async function handleCreate(interaction: CommandInteraction): Promise<void> {
  try {
    // Create modal for quiz creation
    const modal = new ModalBuilder().setCustomId('quiz_create_modal').setTitle('Create New Quiz');

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