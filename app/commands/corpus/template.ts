import { EmbedBuilder, AttachmentBuilder, ChatInputCommandInteraction } from 'discord.js';
import { logger } from '../../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export const cooldown = 5; // 5 second cooldown

export async function handleTemplate(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    await interaction.deferReply({ ephemeral: true });

    // Path to the corpus template file
    const templatePath = path.join(process.cwd(), 'data', 'corpus-template.csv');

    try {
      // Read the template file
      const templateContent = await fs.readFile(templatePath, 'utf-8');

      // Create attachment
      const attachment = new AttachmentBuilder(Buffer.from(templateContent), {
        name: 'corpus-template.csv',
      });

      // Create informative embed
      const embed = new EmbedBuilder()
        .setTitle('📋 Corpus CSV Template')
        .setDescription('Download this template to create your own corpus for quiz generation.')
        .addFields(
          { name: 'Format', value: 'CSV file with specific column structure', inline: true },
          {
            name: 'Required Columns',
            value: '• `question_variants`\n• `correct_answer_variants`',
            inline: true,
          },
          { name: 'Optional Columns', value: 'Add any number of hint columns', inline: true },
          {
            name: 'Instructions',
            value:
              '• Use newlines to separate variants within cells\n' +
              '• First column: Different ways to ask the question\n' +
              '• Second column: Correct answer variants/synonyms\n' +
              '• Additional columns: Hint types with multiple variants\n' +
              '• Each row represents one corpus entry (question group)',
            inline: false,
          },
          {
            name: 'Example Usage',
            value:
              '1. Download this template\n' +
              '2. Edit it with your corpus data\n' +
              '3. Upload with `/upload-corpus-csv`\n' +
              '4. Generate quizzes with `/generate-quiz`',
            inline: false,
          }
        )
        .setColor('#0099ff')
        .setFooter({ text: 'Modify the template with your own corpus data' })
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed],
        files: [attachment],
      });

      logger.info(`Corpus template downloaded by ${interaction.user.tag}`);
    } catch (fileError) {
      logger.error('Error reading corpus template file:', fileError);
      await interaction.editReply(
        '❌ Could not load corpus template file. Please contact an administrator.'
      );
    }
  } catch (error) {
    logger.error('Error in get-corpus-template command:', error);
    await interaction.editReply('❌ An error occurred while generating the corpus template.');
  }
}
