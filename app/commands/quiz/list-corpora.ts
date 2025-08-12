import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction } from 'discord.js';
import { logger } from '@/utils/logger';
import { databaseService } from '@/services/DatabaseService';

export const data = new SlashCommandBuilder()
  .setName('list-corpora')
  .setDescription('List all available corpora for quiz generation');

export const cooldown = 5; // 5 second cooldown

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    await interaction.deferReply({ ephemeral: true });

    // Get all corpora with entry counts
    const corpora = await databaseService.prisma.corpus.findMany({
      include: {
        _count: {
          select: {
            entries: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (corpora.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📚 No Corpora Available')
        .setDescription('No corpora have been created yet.')
        .addFields(
          { name: 'Getting Started', value: 
            '1. Download template: `/get-corpus-template`\n' +
            '2. Upload your corpus: `/upload-corpus-csv`\n' +
            '3. Generate quizzes: `/generate-quiz`',
            inline: false
          }
        )
        .setColor('#ff9900')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Create embed with corpus list
    const embed = new EmbedBuilder()
      .setTitle('📚 Available Corpora')
      .setDescription(`Found ${corpora.length} corpus${corpora.length === 1 ? '' : 'es'} for quiz generation`)
      .setColor('#0099ff')
      .setTimestamp();

    // Add fields for each corpus (limit to 25 fields max)
    const maxFields = 25;
    const corporaToShow = corpora.slice(0, maxFields);
    
    for (const corpus of corporaToShow) {
      const createdDate = corpus.createdAt.toLocaleDateString();
      embed.addFields({
        name: `📋 ${corpus.title}`,
        value: `**Entries:** ${corpus._count.entries}\n**Created:** ${createdDate}\n**ID:** \`${corpus.id}\``,
        inline: true
      });
    }

    // Add warning if there are more corpora than we can show
    if (corpora.length > maxFields) {
      embed.setFooter({ 
        text: `Showing first ${maxFields} of ${corpora.length} corpora. Use specific corpus titles when generating quizzes.` 
      });
    } else {
      embed.addFields({
        name: 'Usage',
        value: 'Use `/generate-quiz from-corpus:"Corpus Title"` to create quizzes from these corpora.',
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });

    logger.info(`Corpus list viewed by ${interaction.user.tag} (${corpora.length} corpora)`);

  } catch (error) {
    logger.error('Error listing corpora:', error);
    await interaction.editReply('❌ An error occurred while fetching the corpus list.');
  }
}