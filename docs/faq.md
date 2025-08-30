# Frequently Asked Questions

Common questions and solutions for Quiz Unlocked users, administrators, and developers.

## General Usage

### How do I add Quiz Unlocked to my Discord server?

If you're using the hosted version, you can invite the bot using the invitation link provided. If you're self-hosting, follow the [Getting Started](/getting-started) guide to set up your own instance.

### What permissions does the bot need?

Quiz Unlocked requires these essential permissions:
- **Send Messages** - To post quiz questions and responses
- **Use Slash Commands** - To respond to commands
- **Embed Links** - To create rich quiz displays and leaderboards
- **Attach Files** - To send CSV templates and results
- **Read Message History** - To track quiz interactions

The bot also needs the **Server Members Intent** enabled in the Discord Developer Portal for leaderboard functionality.

### Can multiple quizzes run simultaneously?

Only one quiz can run per Discord channel at a time. However, different channels in the same server can host separate quiz sessions simultaneously.

### How many people can participate in a quiz?

There's no hard limit on participants. The bot has been tested with hundreds of concurrent users. Performance may vary based on your server specifications and Discord API rate limits.

### Is my quiz data private?

- **Public quizzes** can be started by anyone in the server
- **Private quizzes** can only be started by their creators
- User data (scores, attempts) is server-specific and not shared between servers
- Quiz creators can delete their own quizzes at any time

## Quiz Creation

### What file formats are supported for quiz uploads?

Quiz Unlocked supports CSV files for quiz uploads. The CSV must follow a specific format with columns for `questionText`, `options`, `correctAnswer`, `points`, and `timeLimit`. Use `/quiz template` to download a properly formatted template.

### How many questions can a quiz have?

Quizzes can contain between 1 and 100 questions. For very long quizzes, consider breaking them into smaller sessions for better user engagement.

### Can I add images to quiz questions?

Yes! Use the `/image upload` command to upload images, then reference the image ID in your CSV file's `imageId` column. Supported formats include PNG, JPG, JPEG, and GIF files up to 25MB.

### How do I create multiple-choice questions with different numbers of options?

In your CSV file, the `options` column should contain a JSON array of answer choices. You can have anywhere from 2 to 10 options per question:

```csv
"What is 2+2?","[""3"",""4"",""5""]",1,10,30
"Pick a color","[""Red"",""Blue""]",0,5,20
```

### Can I edit a quiz after creating it?

Yes, use the `/quiz edit` command with the quiz ID. You can modify questions, answers, point values, and time limits. Only quiz creators can edit their own quizzes.

### How do I delete a quiz?

Use the `/quiz delete` command with the quiz ID. This permanently removes the quiz and cannot be undone. Only quiz creators can delete their own quizzes.

## Quiz Sessions

### Why won't my quiz start?

Common reasons quizzes fail to start:
- **Quiz not found** - Check the quiz title spelling
- **No questions** - Ensure the quiz has at least one question
- **Quiz disabled** - Admin may have disabled the quiz
- **Already running** - Only one quiz per channel at a time
- **Permissions** - Bot may lack necessary permissions

### How is scoring calculated?

The scoring system includes:
- **Base points** - Set per question (default: 10 points)
- **Speed bonus** - Faster correct answers earn more points
- **Streak bonus** - Consecutive correct answers increase multiplier
- **Response time** - Tracked for statistics and tie-breaking

### Can I pause or resume a quiz?

Currently, there's no pause feature. You can stop a quiz with `/quiz stop`, but it cannot be resumed from the same point. Consider breaking long quizzes into shorter sessions.

### What happens if the bot goes offline during a quiz?

If the bot restarts during a quiz session, the session will be lost. Participants will need to start a new quiz session. This is why we recommend shorter quiz sessions and stable hosting environments.

### How do hints work?

Hints are optional buttons that appear with quiz questions. Users can click them to reveal additional information without affecting their score. Add hints using the `/question hint-add` command or include them in corpus entries.

## Leaderboards and Statistics

### How are leaderboards calculated?

Leaderboards aggregate user performance across different time periods:
- **Weekly** - Monday to Sunday
- **Monthly** - Calendar month
- **Yearly** - Calendar year
- **Overall** - All-time performance

Rankings are based on total score, with response time as a tie-breaker.

### Why is my success rate different from before?

Recent updates improved success rate calculations to use actual question attempts instead of assumptions about quiz length. The new system is more accurate, especially for quizzes with varying question counts.

### Can I see detailed statistics for a specific user?

Server administrators can view any user's statistics with `/stats user:@username`. Users can always view their own stats with `/stats`.

### How often do leaderboards update?

Leaderboards update in real-time as users complete quizzes. There may be a brief delay (few seconds) for complex calculations.

### Can users reset their statistics?

Individual users cannot reset their own statistics. Server administrators can delete user data using `/admin delete-userdata` if needed for privacy reasons.

## Corpus and Question Banks

### What's the difference between quizzes and corpora?

- **Quizzes** are static sets of questions that are always the same
- **Corpora** (question banks) contain question variants and can generate randomized quizzes with different questions each time

### How does corpus quiz generation work?

When generating a quiz from a corpus:
1. Random entries are selected based on your requested question count
2. Question and answer variants are randomly chosen from each entry
3. Incorrect answer options are generated from other corpus entries with matching tags
4. A new quiz is created with the generated questions

### Can I use tags to categorize corpus entries?

Yes! Tags help organize content and ensure generated quizzes have thematically appropriate incorrect answers. For example, entries tagged with "geography" will use other geography entries for incorrect options.

### How many variants should I include per corpus entry?

Include as many variants as you want. More variants create more diverse generated quizzes. A good practice is 2-3 question variants and 3-5 answer variants per entry.

## Administration

### How do I give someone admin permissions for the bot?

Bot commands respect Discord's permission system. Users with "Manage Server" permissions can use admin commands. Configure role permissions in your Discord server settings.

### Can I disable certain commands?

Currently, command disabling must be done through Discord's built-in slash command permissions system. Go to Server Settings → Integrations → Quiz Unlocked to configure command permissions.

### How do I moderate quiz content?

Server administrators can:
- View all quizzes with `/admin list-quizzes`
- Toggle quiz availability with `/admin toggle-quiz`
- Delete inappropriate content
- Remove user data if needed

### Can I backup my quiz data?

If you're self-hosting, you can backup your PostgreSQL database regularly. For hosted versions, export your quiz data by downloading your quizzes as CSV files periodically.

### How do I handle user privacy requests?

Use `/admin delete-userdata user:@username` to completely remove a user's data from your server. This includes all quiz attempts, scores, and created content.

## Technical Issues

### The bot isn't responding to commands

Troubleshooting steps:
1. **Check bot status** - Ensure the bot shows as online
2. **Verify permissions** - Bot needs appropriate Discord permissions
3. **Try `/ping`** - Test basic connectivity
4. **Check server status** - Bot hosting service may be down
5. **Restart the bot** - If self-hosting, restart the application

### Slash commands aren't showing up

This usually indicates deployment issues:
1. **Check bot permissions** - Needs `applications.commands` scope
2. **Redeploy commands** - Run `npm run deploy-commands`
3. **Wait for propagation** - Global commands take up to 1 hour
4. **Server-specific deployment** - Use guild ID for instant updates

### Quiz data seems corrupted or missing

Database issues are rare but can occur:
1. **Check database connectivity** - Verify connection string
2. **Review recent migrations** - Ensure schema is current
3. **Check logs** - Look for database errors
4. **Restore from backup** - If data is truly lost

### Performance is slow or unresponsive

Performance issues can have various causes:
1. **Server resources** - Check CPU/memory usage
2. **Database performance** - Run VACUUM and ANALYZE
3. **Network connectivity** - Test Discord API connectivity
4. **Rate limiting** - Bot may be hitting API limits

### Memory usage keeps increasing

Memory leaks should be reported as bugs:
1. **Restart the bot** - Immediate temporary fix
2. **Monitor memory usage** - Track growth patterns
3. **Check for updates** - May be a known issue
4. **Report the issue** - Help us identify and fix the problem

## Development and Contribution

### How do I set up a development environment?

Follow the [Development Guide](/development) for complete setup instructions. You'll need Node.js 18+, PostgreSQL, and a Discord application for testing.

### Can I contribute new features?

Absolutely! Quiz Unlocked is open source and welcomes contributions. See the [Development Guide](/development) for contribution guidelines and code standards.

### How do I report bugs?

Report bugs on [GitHub Issues](https://github.com/anthonyronda/learn-polish-bot/issues) with:
- Detailed description of the problem
- Steps to reproduce the issue
- Expected vs actual behavior
- Environment information (Node version, OS, etc.)
- Relevant log entries

### Can I request new features?

Feature requests are welcome! Open an issue on GitHub with:
- Clear description of the desired functionality
- Use cases and benefits
- Proposed implementation approach (if you have ideas)
- Willingness to contribute development effort

### How do I update to the latest version?

For self-hosted instances:
1. Backup your database
2. Pull the latest code: `git pull origin main`
3. Update dependencies: `npm install`
4. Run migrations: `npm run db:deploy`
5. Rebuild: `npm run build`
6. Restart the bot

## Error Messages

### "Quiz not found"

The quiz title doesn't exist or may have been deleted. Use `/admin list-quizzes` to see available quizzes, or check for typos in the quiz name.

### "No questions found"

The quiz exists but has no questions. This can happen if:
- CSV upload failed during question parsing
- Questions were manually deleted
- Quiz creation was interrupted

### "Database connection failed"

Database connectivity issues. Check:
- Database server is running
- Connection string is correct
- Network connectivity between bot and database
- Database permissions and authentication

### "Maximum file size exceeded"

File uploads are limited to 25MB. For large question banks, consider:
- Splitting into multiple smaller files
- Compressing images before upload
- Removing unnecessary data from CSV files

### "Invalid JSON in options column"

CSV parsing failed due to malformed JSON in the options column. Ensure:
- Options are properly quoted: `["Option A","Option B"]`
- Special characters are escaped correctly
- No trailing commas in JSON arrays

### "Command failed due to missing permissions"

The bot lacks necessary Discord permissions. Check that the bot has:
- Required permissions in the specific channel
- Role hierarchy allows bot to function
- Server-level permissions are correctly configured

## Getting Help

### Where can I get additional support?

1. **Documentation** - Check our comprehensive guides
2. **GitHub Issues** - Report bugs and request features
3. **Community Discussions** - Join GitHub Discussions for general questions
4. **Discord Server** - Real-time community support *(coming soon)*

### How do I contribute to the documentation?

Documentation is part of the main repository. To improve these docs:
1. Fork the repository on GitHub
2. Edit files in the `/docs` directory
3. Submit a pull request with your improvements
4. Follow our documentation style guidelines

### Can I hire someone to customize the bot?

Quiz Unlocked is open source, so you're free to hire developers to customize it for your needs. Consider contributing useful features back to the project to benefit the entire community.

### Is commercial use allowed?

Yes, Quiz Unlocked uses an open source license that allows commercial use. See the LICENSE file in the repository for specific terms and conditions.

Still have questions? Open an issue on [GitHub](https://github.com/anthonyronda/learn-polish-bot/issues) or check our [GitHub Discussions](https://github.com/anthonyronda/learn-polish-bot/discussions) for community support.