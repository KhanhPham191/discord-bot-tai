const { Client, GatewayIntentBits, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Import movie functions
const { searchMovies, searchMoviesByYear, getNewMovies, getMovieDetail, getEpisodes, extractYearFromMovie } = require('./movies');

// Import football functions
const { getTeamById, getCompetitionMatches, getLiveScore, getStandings, getFixtures, getFixturesWithCL, getLiveMatches, getMatchLineup } = require('./football');

// Load .env file - required for API keys
require('dotenv').config();

// Ensure all required environment variables are set
if (!process.env.FOOTBALL_API_KEY) {
  console.warn('⚠️ FOOTBALL_API_KEY not set from .env');
}
if (!process.env.DISCORD_TOKEN) {
  console.warn('⚠️ DISCORD_TOKEN not set from .env');
}

const TOKEN = process.env.DISCORD_TOKEN;
const LIVESCORE_CHANNEL = '694577581298810946';
const LIVESCORE_UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutes
const MOVIE_UPDATE_INTERVAL = 30 * 60 * 1000; // 30 minutes
const MOVIE_UPDATE_CHANNEL = '743938937172525067';
const PREFIX = '!';
let AUTO_REPLY_CHANNELS = ['713109490878120026', '694577581298810940'];

const CONFIG_FILE = path.join(__dirname, 'config.json');

// Cache for search embeds and components (for back button)
const searchCache = new Map(); // userId -> { embed, components, movies, searchQuery, cacheId, timestamp }
const cacheIdIndex = new Map(); // cacheId -> cache object (for fast lookup)
let cacheIdCounter = 0;
const CACHE_TTL = 60 * 1000; // 60 seconds

// Movie update tracking - store slugs of movies already notified
const notifiedMovies = new Set(); // Set to track movie slugs already notified
const NOTIFIED_MOVIES_FILE = path.join(__dirname, 'notified-movies.json');

// Clean up expired cache entries
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of searchCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      searchCache.delete(key);
      cacheIdIndex.delete(value.cacheId); // Also remove from index
    }
  }
}, 30 * 1000); // Check every 30 seconds

// Cooldown tracking for commands (per-user rate limiting)
const dashboardCooldown = new Map();  // Per-user cooldown for !dashboard
const fixturesCooldown = new Map();   // Per-user cooldown for !fixtures selector
const DASHBOARD_COOLDOWN_MS = 60 * 1000;  // 60 seconds
const FIXTURES_COOLDOWN_MS = 30 * 1000;   // 30 seconds (fixtures is heavier)

let config = {
  allowedUsers: [],
  aiEnabled: false,
  trackedTeams: [] // User-selected teams to track
};

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      console.log('✅ Config đã được load từ config.json');
    } catch (e) {
      console.error('Lỗi load config:', e);
    }
  } else {
    console.log('📝 Tạo file config.json mới...');
    saveConfig();
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log(`✅ Config đã được lưu vào ${CONFIG_FILE}`);
    console.log(`📊 Hiện tại có ${config.movieUpdate?.channels?.length || 0} kênh movie update`);
    if (config.movieUpdate?.channels?.length > 0) {
      config.movieUpdate.channels.forEach((ch, idx) => {
        console.log(`   ${idx + 1}. ${ch.name} (${ch.id})`);
      });
    }
  } catch (error) {
    console.error(`❌ Lỗi lưu config: ${error.message}`);
  }
}

// Load notified movies from file
function loadNotifiedMovies() {
  console.log('📥 Loading notified movies...');
  if (fs.existsSync(NOTIFIED_MOVIES_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(NOTIFIED_MOVIES_FILE, 'utf8'));
      notifiedMovies.clear();
      data.forEach(slug => notifiedMovies.add(slug));
      console.log(`✅ Loaded ${notifiedMovies.size} notified movies`);
    } catch (e) {
      console.error('Lỗi load notified movies:', e);
    }
  } else {
    console.log('📝 No notified movies file yet. Will create on first update.');
  }
}

// Save notified movies to file
function saveNotifiedMovies() {
  const data = Array.from(notifiedMovies);
  fs.writeFileSync(NOTIFIED_MOVIES_FILE, JSON.stringify(data, null, 2));
}

// Create tracked teams dashboard UI
// Get tracked teams for a specific user
function getUserTrackedTeams(userId) {
  if (!config.userTrackedTeams) config.userTrackedTeams = {};
  return config.userTrackedTeams[userId] || [];
}

// Add team to user's tracked list
function addUserTrackedTeam(userId, teamId) {
  if (!config.userTrackedTeams) config.userTrackedTeams = {};
  if (!config.userTrackedTeams[userId]) {
    config.userTrackedTeams[userId] = [];
  }
  if (!config.userTrackedTeams[userId].includes(teamId)) {
    config.userTrackedTeams[userId].push(teamId);
  }
}

// Remove team from user's tracked list
function removeUserTrackedTeam(userId, teamId) {
  if (!config.userTrackedTeams) config.userTrackedTeams = {};
  if (config.userTrackedTeams[userId]) {
    config.userTrackedTeams[userId] = config.userTrackedTeams[userId].filter(id => id !== teamId);
  }
}

async function createTrackedTeamsDashboard(userId) {
  const userTeams = getUserTrackedTeams(userId);
  if (!userTeams || userTeams.length === 0) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor('#ef4444')
          .setTitle('📭 Không có team nào được theo dõi')
          .setDescription('Hãy dùng `!track` để chọn team để theo dõi!')
          .setTimestamp()
      ]
    };
  }

  // Return array of team pages instead of single message
  const pages = [];
  
  for (const teamId of userTeams) {
    try {
      const team = config.livescoreTeams.find(t => t.id === teamId);
      if (!team) continue;

      // Get fixtures including Champions League (max 3 to reduce API calls)
      const fixtures = await getFixturesWithCL(teamId, 3);
      
      let fixturesText = '';
      if (fixtures.length === 0) {
        fixturesText = '🚫 Không có trận sắp tới';
      } else {
        fixtures.slice(0, 3).forEach((f, idx) => {
          const date = new Date(f.utcDate).toLocaleString('vi-VN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
          const opponent = f.homeTeam.id === teamId ? f.awayTeam.name : f.homeTeam.name;
          const isHome = f.homeTeam.id === teamId ? '🏠' : '✈️';
          const comp = f.inChampionsLeague ? '🏆 CL' : (f.competition?.name ? ` [${f.competition.name}]` : '');
          
          fixturesText += `${idx + 1}. ${isHome} vs **${opponent}**\n   📅 ${date} ${comp}\n`;
        });
      }

      const teamEmbed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle(`⚽ ${team.name}`)
        .addFields(
          { name: '📋 Trận sắp tới', value: fixturesText || 'N/A', inline: false },
          { name: '🔗 Team ID', value: teamId.toString(), inline: true }
        )
        .setFooter({ text: `Trang ${pages.length + 1} / ${userTeams.length}` })
        .setTimestamp();

      pages.push({ embeds: [teamEmbed], teamId });
    } catch (err) {
      console.error(`Error fetching fixtures for team ${teamId}:`, err.message);
    }
  }

  return pages;
}


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Function to register slash commands
async function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('ping')
      .setDescription('Kiểm tra bot sống hay không'),
    
    new SlashCommandBuilder()
      .setName('hello')
      .setDescription('Bot chào bạn'),
    
    new SlashCommandBuilder()
      .setName('echo')
      .setDescription('Bot lặp lại câu bạn nói')
      .addStringOption(option =>
        option.setName('noidung')
          .setDescription('Nội dung muốn bot lặp lại')
          .setRequired(true)),
    
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Xem tất cả các lệnh'),
    
    new SlashCommandBuilder()
      .setName('live')
      .setDescription('Xem trận đang diễn ra')
      .addStringOption(option =>
        option.setName('league_id')
          .setDescription('ID giải đấu (PL, EL1, SA...)')
          .setRequired(false)),
    
    new SlashCommandBuilder()
      .setName('standings')
      .setDescription('Xem bảng xếp hạng')
      .addStringOption(option =>
        option.setName('league_code')
          .setDescription('Mã giải đấu (PL, EL1, SA, BL1, FL1, PD, EC)')
          .setRequired(false)),
    
    new SlashCommandBuilder()
      .setName('fixtures')
      .setDescription('Xem lịch thi đấu sắp tới')
      .addIntegerOption(option =>
        option.setName('team_id')
          .setDescription('ID của đội bóng')
          .setRequired(false)),
    
    new SlashCommandBuilder()
      .setName('lineup')
      .setDescription('Xem line-up trước trận (khi công bố)')
      .addIntegerOption(option =>
        option.setName('match_id')
          .setDescription('ID của trận đấu')
          .setRequired(true)),
    
    new SlashCommandBuilder()
      .setName('findteam')
      .setDescription('Tìm Team ID')
      .addStringOption(option =>
        option.setName('name')
          .setDescription('Tên đội bóng')
          .setRequired(true)),
    
    new SlashCommandBuilder()
      .setName('teams')
      .setDescription('Hiển thị danh sách team có sẵn'),
    
    new SlashCommandBuilder()
      .setName('track')
      .setDescription('Chọn team để theo dõi (UI dropdown)'),
    
    new SlashCommandBuilder()
      .setName('untrack')
      .setDescription('Hủy theo dõi team')
      .addIntegerOption(option =>
        option.setName('team_id')
          .setDescription('ID của team muốn hủy theo dõi')
          .setRequired(true)),
    
    new SlashCommandBuilder()
      .setName('mytracks')
      .setDescription('Xem danh sách team đang theo dõi'),
    
    new SlashCommandBuilder()
      .setName('dashboard')
      .setDescription('Xem dashboard với lịch thi đấu'),
    
    new SlashCommandBuilder()
      .setName('search')
      .setDescription('Tìm phim')
      .addStringOption(option =>
        option.setName('name')
          .setDescription('Tên phim (gõ "help" để xem chi tiết)')
          .setRequired(true))
      .addIntegerOption(option =>
        option.setName('page')
          .setDescription('Số trang (mặc định: 1)')
          .setRequired(false)),
    
    new SlashCommandBuilder()
      .setName('newmovies')
      .setDescription('Phim mới cập nhật')
      .addIntegerOption(option =>
        option.setName('page')
          .setDescription('Số trang (mặc định: 1)')
          .setRequired(false)),
    
    new SlashCommandBuilder()
      .setName('episodes')
      .setDescription('Xem danh sách tập phim')
      .addStringOption(option =>
        option.setName('slug')
          .setDescription('Slug của phim')
          .setRequired(true)),
    
    new SlashCommandBuilder()
      .setName('set-movie-update-channel')
      .setDescription('Thiết lập channel để nhận thông báo phim update')
      .addChannelOption(option =>
        option.setName('channel')
          .setDescription('Channel để gửi thông báo phim mới')
          .setRequired(true))
      .addBooleanOption(option =>
        option.setName('enabled')
          .setDescription('Bật/tắt tính năng thông báo phim update')
          .setRequired(false))
  ];

  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands.map(cmd => cmd.toJSON()) }
    );
    console.log('✅ Slash commands đã được đăng ký thành công');
  } catch (error) {
    console.error('❌ Lỗi đăng ký slash commands:', error);
  }
}

client.once('ready', async () => {
  console.log(`✅ Bot đã đăng nhập với tư cách: ${client.user.tag}`);
  loadConfig();
  loadNotifiedMovies();
  
  // Register slash commands
  await registerSlashCommands();

  // Setup auto-checker for movie updates
  setInterval(async () => {
    try {
      const now = new Date().toLocaleString('vi-VN');
      console.log(`🔄 [${now}] Checking for movie updates...`);
      
      // Check if movie update feature is enabled and channels are configured
      if (!config.movieUpdate?.enabled || !config.movieUpdate?.channels || config.movieUpdate.channels.length === 0) {
        console.log(`⚠️ Movie update not configured or no channels set.`);
        return;
      }

      console.log(`✅ Movie update enabled. Configured channels:`);
      config.movieUpdate.channels.forEach((ch, idx) => {
        console.log(`   ${idx + 1}. ${ch.name} (${ch.id})`);
      });

      // Fetch all channels
      const channels = [];
      for (const channelConfig of config.movieUpdate.channels) {
        console.log(`🔍 Fetching channel: ${channelConfig.id}...`);
        const channel = await client.channels.fetch(channelConfig.id).catch(() => null);
        if (channel) {
          channels.push(channel);
          console.log(`✅ Successfully fetched: ${channel.name} (${channel.id})`);
        } else {
          console.warn(`⚠️ Could not fetch channel ${channelConfig.id}`);
        }
      }

      if (channels.length === 0) {
        console.error('❌ Could not fetch any movie update channels');
        return;
      }

      console.log(`✅ Fetched ${channels.length} channels successfully. Getting new movies...`);

      // Get new movies with timeout
      const newMovies = await Promise.race([
        getNewMovies(1),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Movie API timeout')), 15000))
      ]).catch(err => {
        console.error('⚠️ Error fetching new movies:', err.message);
        return [];
      });
      
      console.log(`📊 Found ${newMovies.length} new movies from API`);
      
      if (newMovies.length === 0) {
        console.log('ℹ️ No new movies to process');
        return;
      }

      for (const movie of newMovies) {
        // Check if already notified
        if (notifiedMovies.has(movie.slug)) {
          console.log(`⏭️ Movie already notified: ${movie.name} (${movie.slug})`);
          continue;
        }

        console.log(`🎬 Processing new movie: ${movie.name} (${movie.slug})`);

        // Mark as notified
        notifiedMovies.add(movie.slug);
        saveNotifiedMovies();

        // Get full movie detail for embed with timeout
        try {
          const detail = await Promise.race([
            getMovieDetail(movie.slug),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Detail API timeout')), 10000))
          ]).catch(() => null);
          
          if (!detail) {
            console.log(`⚠️ Could not get detail for movie: ${movie.slug}`);
            continue;
          }

          const movieEmbed = new EmbedBuilder()
            .setColor('#ef4444')
            .setTitle(`🎬 ${detail.name}`)
            .setDescription(detail.original_name ? `*${detail.original_name}*` : '')
            .setThumbnail(detail.poster_url || detail.thumb_url)
            .addFields(
              { name: '📅 Năm phát hành', value: String(detail.year || 'N/A'), inline: true },
              { name: '⭐ Chất lượng', value: String(detail.quality || 'N/A'), inline: true },
              { name: '🗣️ Ngôn ngữ', value: String(detail.language || 'N/A'), inline: true },
              { name: '⏱️ Thời lượng', value: detail.time || 'N/A', inline: true },
              { name: '📺 Tập phim', value: `${detail.current_episode || 0}/${detail.total_episodes || '?'}`, inline: true },
              { name: '📋 Mô tả', value: (detail.description || 'Không có mô tả').substring(0, 300) + '...' }
            )
            .setFooter({ text: `Thông báo phim mới sẽ được update` })
            .setTimestamp();

          // Send notification to all configured channels
          for (const channel of channels) {
            try {
              await channel.send({ 
                content: `🆕 **Phim mới được cập nhật!**`,
                embeds: [movieEmbed] 
              });
              console.log(`✅ Sent notification to ${channel.name}: ${detail.name}`);
            } catch (e) {
              console.error(`⚠️ Error sending to channel ${channel.name}:`, e.message);
            }
          }
        } catch (e) {
          console.error(`⚠️ Error getting detail for ${movie.slug}:`, e.message);
        }
      }
    } catch (error) {
      console.error('❌ Error in movie update checker:', error.message);
    }
  }, MOVIE_UPDATE_INTERVAL);
  
  // Setup auto-reminder for upcoming matches (1 hour before)
  setInterval(async () => {
    console.log('🕐 Checking for upcoming matches to remind...');
    
    if (!config.userTrackedTeams) return;
    
    for (const [userId, teamIds] of Object.entries(config.userTrackedTeams)) {
      if (!Array.isArray(teamIds) || teamIds.length === 0) continue;
      
      try {
        const user = await client.users.fetch(userId);
        if (!user) continue;
        
        // Check each team's fixtures
        for (const teamId of teamIds) {
          const fixtures = await getFixturesWithCL(teamId, 5);
          
          // Find matches in next 1.5 hours
          const now = new Date();
          const in1Hour = new Date(now.getTime() + 60 * 60 * 1000);
          const in90Min = new Date(now.getTime() + 90 * 60 * 1000);
          
          const upcomingMatches = fixtures.filter(f => {
            const matchTime = new Date(f.utcDate);
            return matchTime > now && matchTime <= in90Min;
          });
          
          if (upcomingMatches.length > 0) {
            // Send reminder DM
            const team = config.livescoreTeams.find(t => t.id === teamId);
            const teamName = team?.name || `Team ${teamId}`;
            
            upcomingMatches.forEach(match => {
              const opponent = match.homeTeam.id === teamId ? match.awayTeam.name : match.homeTeam.name;
              const isHome = match.homeTeam.id === teamId ? '🏠' : '✈️';
              const timeUntilMatch = Math.floor((new Date(match.utcDate) - now) / 60 / 1000); // minutes
              
              const reminderEmbed = new EmbedBuilder()
                .setColor('#f59e0b')
                .setTitle(`⚠️ Trận đấu sắp bắt đầu!`)
                .setDescription(`${isHome} **${teamName}** vs **${opponent}**`)
                .addFields(
                  { name: '🕐 Bắt đầu sau', value: `${timeUntilMatch} phút`, inline: true },
                  { name: '🏆 Giải đấu', value: match.competition?.name || 'N/A', inline: true }
                )
                .setFooter({ text: 'Football Bot Reminder' })
                .setTimestamp();
              
              user.send({ embeds: [reminderEmbed] }).catch(err => {
                console.log(`⚠️ Could not send reminder to ${user.tag}:`, err.message);
              });
            });
          }
        }
      } catch (err) {
        console.error(`Error checking matches for user ${userId}:`, err.message);
      }
    }
  }, 15 * 60 * 1000); // Check every 15 minutes
});

// Handle interactions (slash commands, select menu, buttons)
client.on('interactionCreate', async (interaction) => {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const command = interaction.commandName;
    const userId = interaction.user.id;
    const now = Date.now();
    
    try {
      // Convert slash command to message-like object for reuse
      const messageData = {
        author: interaction.user,
        member: interaction.member,
        guild: interaction.guild,
        reply: (content) => interaction.reply(content),
        channel: interaction.channel,
        deferReply: () => interaction.deferReply(),
        editReply: (content) => interaction.editReply(content)
      };

      if (command === 'ping') {
        await interaction.reply('Pong! 🏓');
        return;
      }

      if (command === 'hello') {
        await interaction.reply(`Hello ${interaction.user.username} 😎`);
        return;
      }

      if (command === 'help') {
        await interaction.reply(
          [
            '📌 Các lệnh hiện có:',
            '`/ping` - kiểm tra bot sống hay không',
            '`/hello` - bot chào bạn',
            '`/echo <nội dung>` - bot lặp lại câu bạn nói',
            '',
            '⚽ Livescore & Fixtures:',
            '`/live [league_id]` - xem trận đang diễn ra',
            '`/standings [league_code]` - bảng xếp hạng',
            '`/fixtures <team_id>` - lịch thi đấu sắp tới',
            '`/lineup <match_id>` - xem line-up trước trận (khi công bố)',
            '`/findteam <name>` - tìm Team ID',
            '',
            '📍 Team Tracking (Auto-Reminder):',
            '`/teams` - hiển thị danh sách team có sẵn',
            '`/track` - chọn team để theo dõi (UI dropdown)',
            '`/untrack <team_id>` - hủy theo dõi team',
            '`/mytracks` - xem danh sách team đang theo dõi',
            '`/dashboard` - xem dashboard với lịch thi đấu',
            '💡 **Auto-Reminder**: Bot sẽ nhắc 1h trước mỗi trận của team bạn track',
            '',
            '🎬 Movie Search:',
            '`/search <tên phim>` - tìm phim (gõ `help` để xem chi tiết)',
            '`/newmovies [trang]` - phim mới cập nhật (trang 1 nếu không chỉ định)',
            '`/set-movie-update-channel <channel> [enabled]` - thiết lập kênh nhận thông báo phim mới',
            '',
            '🎮 Where Winds Meet Game:',
            '`/weapon <tên>` - tìm vũ khí',
            '`/npc <tên>` - tìm nhân vật',
            '`/boss <tên>` - tìm boss',
            '`/skill <tên>` - tìm kỹ năng',
            '`/item <tên>` - tìm vật phẩm',
            '`/gamestats` - xem thống kê database game'
          ].join('\n')
        );
        return;
      }

      if (command === 'echo') {
        const content = interaction.options.getString('noidung');
        await interaction.reply(content);
        return;
      }

      if (command === 'teams') {
        const premierLeagueTeams = config.livescoreTeams.slice(0, 10);
        
        let teamsText = '⚽ **Chọn đội bóng để theo dõi:**\n\n';
        premierLeagueTeams.forEach((team, idx) => {
          const tracked = config.trackedTeams.includes(team.id) ? '✅' : '  ';
          teamsText += `${tracked} ${idx + 1}. **${team.name}** (ID: ${team.id})\n`;
        });
        
        teamsText += `\n💡 Dùng \`/track\` để theo dõi\n`;
        teamsText += `💡 Dùng \`/untrack <team_id>\` để hủy theo dõi\n`;
        teamsText += `💡 Dùng \`/mytracks\` để xem danh sách theo dõi`;
        
        await interaction.reply(teamsText);
        return;
      }

      if (command === 'track') {
        const teams = config.livescoreTeams;
        const userTrackedTeams = getUserTrackedTeams(userId);
        
        const options = teams.map(team => ({
          label: team.name,
          value: team.id.toString(),
          description: `ID: ${team.id}${userTrackedTeams.includes(team.id) ? ' ✅ (bạn theo dõi)' : ''}`
        }));
        
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('track_team_select')
          .setPlaceholder('Chọn đội bóng để theo dõi')
          .addOptions(options);
        
        const row = new ActionRowBuilder()
          .addComponents(selectMenu);
        
        const response = await interaction.reply({
          content: '⚽ **Chọn đội bóng muốn theo dõi:**',
          components: [row],
          fetchReply: true
        });
        return;
      }

      if (command === 'untrack') {
        const teamId = interaction.options.getInteger('team_id');
        const userTrackedTeams = getUserTrackedTeams(userId);
        
        if (!userTrackedTeams.includes(teamId)) {
          await interaction.reply(`❌ Bạn không theo dõi team với ID **${teamId}**!`);
          return;
        }
        
        removeUserTrackedTeam(userId, teamId);
        saveConfig();
        
        const team = config.livescoreTeams.find(t => t.id === teamId);
        const teamName = team?.name || `Team ${teamId}`;
        
        await interaction.reply(`✅ Đã hủy theo dõi **${teamName}**`);
        return;
      }

      if (command === 'mytracks') {
        const userTrackedTeams = getUserTrackedTeams(userId);
        
        if (userTrackedTeams.length === 0) {
          await interaction.reply('📋 Bạn chưa theo dõi team nào. Dùng `/track` để thêm team.');
          return;
        }

        const trackedTeamNames = userTrackedTeams
          .map(id => {
            const team = config.livescoreTeams.find(t => t.id === id);
            return team ? team.name : `ID: ${id}`;
          })
          .join('\n');
        
        await interaction.reply(`📋 **Danh sách team bạn theo dõi:**\n${trackedTeamNames}\n\nDùng \`/untrack <team_id>\` để xóa.`);
        return;
      }

      if (command === 'dashboard') {
        // Check cooldown - 60 seconds per user
        if (dashboardCooldown.has(userId)) {
          const cooldownExpires = dashboardCooldown.get(userId);
          if (now < cooldownExpires) {
            const secondsLeft = Math.ceil((cooldownExpires - now) / 1000);
            await interaction.reply(`⏳ Dashboard cooldown. Vui lòng chờ ${secondsLeft}s trước khi sử dụng lại.`);
            return;
          }
        }
        
        dashboardCooldown.set(userId, now + DASHBOARD_COOLDOWN_MS);
        
        await interaction.deferReply();
        
        try {
          const pages = await createTrackedTeamsDashboard(userId);
          
          if (!pages || pages.length === 0) {
            await interaction.editReply('❌ Không có team nào được theo dõi.');
            return;
          }
          
          if (pages.length === 1) {
            await interaction.editReply(pages[0]);
            return;
          }
          
          let currentPage = 0;
          
          const createButtons = () => {
            return new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(`dashboard_prev_${userId}`)
                  .setLabel('⬅️ Trước')
                  .setStyle(2)
                  .setDisabled(currentPage === 0),
                new ButtonBuilder()
                  .setCustomId(`dashboard_next_${userId}`)
                  .setLabel('Sau ➡️')
                  .setStyle(2)
                  .setDisabled(currentPage === pages.length - 1)
              );
          };
          
          const response = await interaction.editReply({
            ...pages[currentPage],
            components: [createButtons()]
          });
          
          const collector = response.createMessageComponentCollector({ 
            filter: (inter) => inter.user.id === userId,
            time: 5 * 60 * 1000
          });
          
          collector.on('collect', async (inter) => {
            if (inter.customId === `dashboard_prev_${userId}`) {
              currentPage--;
            } else if (inter.customId === `dashboard_next_${userId}`) {
              currentPage++;
            }
            
            await inter.update({
              ...pages[currentPage],
              components: [createButtons()]
            }).catch(() => {});
          });
          
          collector.on('end', async () => {
            const disabledRow = new ActionRowBuilder()
              .addComponents(
                new ButtonBuilder()
                  .setCustomId(`dashboard_prev_${userId}`)
                  .setLabel('⬅️ Trước')
                  .setStyle(2)
                  .setDisabled(true),
                new ButtonBuilder()
                  .setCustomId(`dashboard_next_${userId}`)
                  .setLabel('Sau ➡️')
                  .setStyle(2)
                  .setDisabled(true)
              );
            await response.edit({ components: [disabledRow] }).catch(() => {});
          });
        } catch (e) {
          console.error('❌ Lỗi tải dashboard:', e.message);
          await interaction.editReply('❌ Lỗi khi tải dashboard. Vui lòng thử lại.');
        }
        return;
      }

      if (command === 'live') {
        const competitionId = interaction.options.getString('league_id') || 'PL';
        await interaction.deferReply();
        
        const liveMatches = await getLiveMatches(competitionId);
        
        if (liveMatches.length === 0) {
          await interaction.editReply('❌ Không có trận đấu nào đang diễn ra!');
          return;
        }
        
        let liveText = `🔴 **LIVE - Trận đấu đang diễn ra**\n`;
        liveText += `═══════════════════════════════════\n\n`;
        
        liveMatches.slice(0, 10).forEach((match, idx) => {
          const homeTeam = match.homeTeam.name;
          const awayTeam = match.awayTeam.name;
          const homeGoals = match.score?.fullTime?.home || 0;
          const awayGoals = match.score?.fullTime?.away || 0;
          const status = match.status;
          const minute = match.minute || '?';
          
          liveText += `${idx + 1}. **${homeTeam} ${homeGoals} - ${awayGoals} ${awayTeam}**\n`;
          liveText += `   ⏱️ ${minute}' | Status: ${status}\n`;
          liveText += `\n`;
        });
        
        liveText += `═══════════════════════════════════`;
        await interaction.editReply(liveText);
        return;
      }

      if (command === 'findteam') {
        const teamName = interaction.options.getString('name').toLowerCase();
        
        await interaction.deferReply();
        
        try {
          const foundTeams = (config.livescoreTeams || []).filter(team => 
            team.name.toLowerCase().includes(teamName)
          );
          
          if (foundTeams.length === 0) {
            await interaction.editReply(`❌ Không tìm thấy đội bóng: **${teamName}**\n\n💡 **Danh sách đội hỗ trợ (Premier League):**\n${(config.livescoreTeams || []).slice(0, 10).map((t, i) => `${i + 1}. ${t.name}`).join('\n')}`);
            return;
          }
          
          let resultText = `🔍 **Kết quả tìm kiếm: "${teamName}"**\n`;
          resultText += `═══════════════════════════════════\n\n`;
          
          foundTeams.forEach((team, idx) => {
            resultText += `${idx + 1}. **${team.name}**\n`;
            resultText += `   📍 ID: **${team.id}**\n`;
            resultText += `   ⚽ \`/fixtures ${team.id}\` - xem lịch thi đấu\n`;
            resultText += `   ❤️ \`/track ${team.id}\` - theo dõi đội\n\n`;
          });
          
          resultText += `═══════════════════════════════════\n`;
          resultText += `💡 **Copy Team ID rồi dùng các lệnh ở trên**`;
          
          await interaction.editReply(resultText);
        } catch (e) {
          console.error('❌ Lỗi tìm kiếm đội bóng:', e.message);
          await interaction.editReply('❌ Có lỗi xảy ra khi tìm kiếm. Vui lòng thử lại!');
        }
        return;
      }

      if (command === 'standings') {
        const compCode = interaction.options.getString('league_code')?.toUpperCase() || null;
        const supportedComps = {
          'PL': 'Premier League',
          'EL1': 'La Liga',
          'SA': 'Serie A',
          'BL1': 'Bundesliga',
          'FL1': 'Ligue 1',
          'PD': 'Primeira Liga',
          'EC': 'Champions League'
        };
        
        if (!compCode) {
          let compList = `📊 **DANH SÁCH GIẢI ĐẤU**\n`;
          compList += `═══════════════════════════════════\n\n`;
          
          Object.entries(supportedComps).forEach(([code, name]) => {
            compList += `• **${code}** - ${name}\n`;
          });
          
          compList += `\n═══════════════════════════════════\n`;
          compList += `💡 Dùng: \`/standings <competition_code>\` để xem bảng xếp`;
          
          await interaction.reply(compList);
          return;
        }
        
        if (!supportedComps[compCode]) {
          await interaction.reply(`❌ Không tìm thấy giải đấu! Dùng \`/standings\` để xem danh sách.`);
          return;
        }
        
        await interaction.deferReply();
        
        const standings = await getStandings(compCode);
        
        if (!standings) {
          await interaction.editReply('❌ Không tìm thấy bảng xếp hạng!');
          return;
        }
        
        const table = standings.standings[0].table;
        let standingsText = `📊 **${standings.competition.name} - Season ${standings.season.currentSeason}**\n`;
        standingsText += `═══════════════════════════════════\n\n`;
        
        table.slice(0, 10).forEach((team, idx) => {
          const rank = team.position;
          const name = team.team.name;
          const points = team.points;
          const played = team.playedGames;
          const wins = team.won;
          const draws = team.draw;
          const losses = team.lost;
          const gf = team.goalsFor;
          const ga = team.goalsAgainst;
          const gd = gf - ga;
          
          standingsText += `${rank.toString().padStart(2, '0')}. ${name.padEnd(20, ' ')} | ${points.toString().padStart(2, ' ')}pts\n`;
          standingsText += `    📈 ${played}P ${wins}W ${draws}D ${losses}L | ${gf}:${ga} (${gd > 0 ? '+' : ''}${gd})\n`;
          standingsText += `\n`;
        });
        
        standingsText += `═══════════════════════════════════`;
        await interaction.editReply(standingsText);
        return;
      }

      if (command === 'lineup') {
        const matchId = interaction.options.getInteger('match_id');
        await interaction.deferReply();

        try {
          const matchData = await getMatchLineup(matchId);
          
          if (!matchData) {
            await interaction.editReply('❌ Không tìm thấy thông tin trận đấu!');
            return;
          }

          const homeTeam = matchData.homeTeam;
          const awayTeam = matchData.awayTeam;
          const utcDate = new Date(matchData.utcDate);
          const dateStr = utcDate.toLocaleString('vi-VN', {
            weekday: 'long',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });

          const embeds = [];
          
          const headerEmbed = new EmbedBuilder()
            .setColor('#3b82f6')
            .setTitle(`📋 Line-up: ${homeTeam.name} vs ${awayTeam.name}`)
            .setDescription(`🏆 ${matchData.competition?.name || 'Unknown'}\n📅 ${dateStr}\n📊 Status: ${matchData.status}`)
            .setTimestamp();

          embeds.push(headerEmbed);

          if (matchData.lineupNotAvailable) {
            const messageEmbed = new EmbedBuilder()
              .setColor('#f97316')
              .setDescription(matchData.message || 'Line-up chưa được công bố. Trạng thái: ' + matchData.status);
            
            embeds.push(messageEmbed);
            await interaction.editReply({ embeds });
            return;
          }

          const homeLineup = matchData.homeTeamLineup || [];
          let homeText = `🏠 **${homeTeam.name}** (Formation: ${matchData.homeTeamFormation || 'N/A'})\n\n`;
          
          if (homeLineup.length > 0) {
            homeText += '**Starting XI:**\n';
            homeLineup.slice(0, 11).forEach((player, idx) => {
              if (player && player.position && player.position !== 'UNKNOWN') {
                homeText += `${idx + 1}. ${player.name} - ${player.position}\n`;
              }
            });
          } else {
            homeText += '_Line-up chưa được công bố_\n';
          }

          const homeEmbed = new EmbedBuilder()
            .setColor('#ef4444')
            .setDescription(homeText.slice(0, 2048))
            .setFooter({ text: `${homeTeam.name}` });

          embeds.push(homeEmbed);

          const awayLineup = matchData.awayTeamLineup || [];
          let awayText = `✈️ **${awayTeam.name}** (Formation: ${matchData.awayTeamFormation || 'N/A'})\n\n`;
          
          if (awayLineup.length > 0) {
            awayText += '**Starting XI:**\n';
            awayLineup.slice(0, 11).forEach((player, idx) => {
              if (player && player.position && player.position !== 'UNKNOWN') {
                awayText += `${idx + 1}. ${player.name} - ${player.position}\n`;
              }
            });
          } else {
            awayText += '_Line-up chưa được công bố_\n';
          }

          const awayEmbed = new EmbedBuilder()
            .setColor('#3b82f6')
            .setDescription(awayText.slice(0, 2048))
            .setFooter({ text: `${awayTeam.name}` });

          embeds.push(awayEmbed);

          await interaction.editReply({ embeds });
        } catch (e) {
          console.error('❌ Lỗi lấy line-up:', e.message);
          await interaction.editReply('❌ Có lỗi xảy ra. Vui lòng thử lại!');
        }
        return;
      }

      if (command === 'fixtures') {
        const teamId = interaction.options.getInteger('team_id');
        
        // Check cooldown
        if (fixturesCooldown.has(userId)) {
          const cooldownExpires = fixturesCooldown.get(userId);
          if (now < cooldownExpires) {
            const secondsLeft = Math.ceil((cooldownExpires - now) / 1000);
            await interaction.reply(`⏳ Fixtures cooldown. Vui lòng chờ ${secondsLeft}s trước khi sử dụng lại.`);
            return;
          }
        }
        
        fixturesCooldown.set(userId, now + FIXTURES_COOLDOWN_MS);
        
        if (teamId) {
          await interaction.deferReply();
          
          try {
            const fixtures = await getFixturesWithCL(teamId, 10);
            
            if (fixtures.length === 0) {
              await interaction.editReply(`❌ Không tìm thấy lịch thi đấu cho team ID: **${teamId}**`);
              return;
            }
            
            let teamName = `Team ${teamId}`;
            try {
              const teamData = await getTeamById(teamId);
              if (teamData) {
                teamName = teamData.name;
              }
            } catch (e) {
              console.log('⚠️ Could not fetch team name:', e.message);
            }
            
            const embeds = [];
            const headerEmbed = new EmbedBuilder()
              .setColor('#1e40af')
              .setTitle(`⚽ ${teamName}`)
              .setDescription(`**Lịch Thi Đấu Sắp Tới**\n${fixtures.length} trận`)
              .setTimestamp()
              .setFooter({ text: 'Football Bot | Updated' });
            
            embeds.push(headerEmbed);
            
            let currentText = '';
            let matchCount = 0;
            
            fixtures.slice(0, 10).forEach((f, idx) => {
              const date = new Date(f.utcDate);
              const dateStr = date.toLocaleString('vi-VN', {
                weekday: 'short',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              });
              const opponent = f.homeTeam.id === teamId ? f.awayTeam.name : f.homeTeam.name;
              const isHome = f.homeTeam.id === teamId ? '🏠' : '✈️';
              const competition = f.inChampionsLeague ? '🏆 Champions League' : (f.competition?.name || 'Unknown');
              
              const matchStr = `\`${idx + 1}.\` ${isHome} **${opponent}**\n└─ 📅 ${dateStr} • ${competition}\n`;
              
              currentText += matchStr;
              matchCount++;
              
              if (matchCount === 5 || idx === fixtures.length - 1) {
                const fixturesEmbed = new EmbedBuilder()
                  .setColor('#059669')
                  .setDescription(currentText.trim())
                  .setFooter({ text: `Trận ${matchCount === 5 ? (idx - 4) + '-' + (idx + 1) : (idx - matchCount + 2) + '-' + (idx + 1)} của ${fixtures.length}` });
                
                embeds.push(fixturesEmbed);
                currentText = '';
                matchCount = 0;
              }
            });
            
            await interaction.editReply({ embeds });
          } catch (e) {
            console.error('❌ Lỗi lấy lịch thi đấu:', e.message);
            await interaction.editReply('❌ Có lỗi xảy ra khi lấy lịch thi đấu. Vui lòng thử lại!');
          }
          return;
        }
        
        // Show tracked teams menu
        const userTrackedTeams = getUserTrackedTeams(userId);
        
        if (userTrackedTeams.length === 0) {
          await interaction.reply('❌ Bạn chưa theo dõi team nào.\n\n💡 Cách dùng:\n• `/track` - chọn team để theo dõi\n• `/fixtures <team_id>` - xem lịch của team nào đó\n• `/findteam <tên>` - tìm Team ID');
          return;
        }
        
        const trackedTeamsList = config.livescoreTeams.filter(t => userTrackedTeams.includes(t.id));
        const options = trackedTeamsList.map(team => ({
          label: team.name,
          value: team.id.toString(),
          description: `ID: ${team.id}`
        }));
        
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('fixtures_team_select')
          .setPlaceholder('Chọn đội bóng để xem lịch thi đấu')
          .addOptions(options);
        
        const row = new ActionRowBuilder()
          .addComponents(selectMenu);
        
        const response = await interaction.reply({
          content: '⚽ **Chọn đội bóng để xem lịch thi đấu:**',
          components: [row],
          fetchReply: true
        });
        return;
      }

      if (command === 'search') {
        const searchQuery = interaction.options.getString('name');
        const page = interaction.options.getInteger('page') || 1;
        
        if (searchQuery.toLowerCase() === 'help') {
          const helpText = `
📌 **Hướng Dẫn Lệnh Tìm Phim**

**Cú pháp:**
\`/search <tên phim> [page]\`

**Ví dụ:**
• \`/search avatar\` - Tìm phim "avatar"
• \`/search mưa đỏ page:2\` - Tìm "mưa đỏ" trang 2
• \`/search the marvel page:1\` - Tìm "the marvel"

**Tính năng:**
✅ Hiển thị tối đa 10 kết quả/trang
✅ Hỗ trợ phân trang (trang trước/sau)
✅ Hiển thị tên Việt + tên Anh + năm phát hành
✅ Click button để xem chi tiết
✅ Chọn server để xem danh sách tập
✅ Phân trang tập (10 tập/trang)
✅ Nút quay lại để điều hướng

**Lệnh khác:**
• \`/newmovies [page]\` - Phim mới cập nhật
• \`/help\` - Xem tất cả lệnh
`;
          await interaction.reply(helpText);
          return;
        }
        
        await interaction.deferReply();
        
        try {
          const results = await searchMovies(searchQuery);
          
          if (!results || results.length === 0) {
            await interaction.editReply(`❌ Không tìm thấy phim: **${searchQuery}**`);
            return;
          }

          // Calculate pagination
          const itemsPerPage = 10;
          const totalResults = results.length;
          const totalPages = Math.ceil(totalResults / itemsPerPage);
          
          // Validate page number
          if (page < 1 || page > totalPages) {
            await interaction.editReply(`❌ Trang không hợp lệ. Có **${totalPages}** trang tìm kiếm`);
            return;
          }
          
          const startIdx = (page - 1) * itemsPerPage;
          const endIdx = startIdx + itemsPerPage;
          const movies = results.slice(startIdx, endIdx);
          
          const embed = new EmbedBuilder()
            .setColor('#e50914')
            .setTitle(`🎬 Kết quả tìm kiếm: "${searchQuery}" - Trang ${page}/${totalPages}`)
            .setDescription(`Tìm thấy **${totalResults}** phim | Hiển thị **${movies.length}** phim`)
            .setTimestamp();
          
          let description = '';
          for (let idx = 0; idx < movies.length; idx++) {
            const movie = movies[idx];
            const slug = movie.slug || '';
            const title = movie.name || movie.title || 'Unknown';
            const englishTitle = movie.original_name || '';
            const year = movie.year || 'N/A';
            
            let totalEpisodes = 'N/A';
            let category = 'N/A';
            try {
              if (slug) {
                const detail = await getMovieDetail(slug);
                if (detail) {
                  if (detail.total_episodes) {
                    totalEpisodes = detail.total_episodes.toString();
                  }
                  if (detail.category && detail.category[1]) {
                    const categoryList = detail.category[1].list;
                    if (categoryList && categoryList.length > 0) {
                      category = categoryList[0].name;
                    }
                  }
                }
              }
            } catch (e) {
              console.log(`⚠️ Could not fetch detail for ${slug}`);
            }
            
            const movieNum = startIdx + idx + 1;
            let titleDisplay = `**${movieNum}. ${title}**`;
            if (englishTitle && englishTitle !== title) {
              titleDisplay += ` (${englishTitle})`;
            }
            
            description += `${titleDisplay}\n`;
            
            let infoLine = '';
            if (year !== 'N/A') {
              infoLine += `📅 ${year}`;
            }
            if (category !== 'N/A') {
              infoLine += infoLine ? ` | 📺 ${category}` : `📺 ${category}`;
            }
            if (totalEpisodes !== 'N/A') {
              infoLine += infoLine ? ` | 🎬 ${totalEpisodes} tập` : `🎬 ${totalEpisodes} tập`;
            }
            
            if (infoLine) {
              description += infoLine + '\n';
            }
            
            description += '\n';
          }
          
          embed.setDescription(description);
          
          // Create pagination buttons
          const paginationButtons = [];
          if (page > 1) {
            paginationButtons.push(
              new ButtonBuilder()
                .setCustomId(`search_prev_${page}_${userId}_${searchQuery}`)
                .setLabel('⬅️ Trang trước')
                .setStyle(2)
            );
          }
          
          paginationButtons.push(
            new ButtonBuilder()
              .setCustomId(`search_page_${page}_${userId}`)
              .setLabel(`📄 Trang ${page}/${totalPages}`)
              .setStyle(2)
              .setDisabled(true)
          );
          
          if (page < totalPages) {
            paginationButtons.push(
              new ButtonBuilder()
                .setCustomId(`search_next_${page}_${userId}_${searchQuery}`)
                .setLabel('Trang sau ➡️')
                .setStyle(2)
            );
          }

          const buttonRows = [];

          if (paginationButtons.length > 0) {
            buttonRows.push(new ActionRowBuilder().addComponents(paginationButtons));
          }
          
          const response = await interaction.editReply({ 
            embeds: [embed],
            components: buttonRows.length > 0 ? buttonRows : [],
            fetchReply: true
          });
          
          // Cache this search result for back button
          const cacheId = ++cacheIdCounter;
          const cacheKey = `search_${userId}_${page}_${searchQuery}`;
          const cacheData = {
            embed,
            components: buttonRows,
            movies,
            allResults: results,
            searchQuery,
            type: 'search',
            cacheId,
            page,
            totalPages,
            timestamp: Date.now()
          };
          searchCache.set(cacheKey, cacheData);
          cacheIdIndex.set(cacheId, cacheData);
          console.log(`✅ [SEARCH CACHE] User ${userId} - Page: ${page}/${totalPages}, CacheID: ${cacheId}, Movies: ${movies.length}, Query: ${searchQuery}`);
          
          // Store cache ID in each button so we can retrieve it later
          const updatedButtonRows = [];
          for (let i = 1; i <= Math.min(10, movies.length); i++) {
            if ((i - 1) % 5 === 0) {
              updatedButtonRows.push(new ActionRowBuilder());
            }
            const movieTitle = movies[i - 1].name.substring(0, 15);
            updatedButtonRows[Math.floor((i - 1) / 5)].addComponents(
              new ButtonBuilder()
                .setCustomId(`search_detail_${i}_${userId}_${page}_${cacheId}`)
                .setLabel(`${i}. ${movieTitle}`)
                .setStyle(1)
            );
          }
          
          // Add pagination buttons to updated rows
          if (paginationButtons.length > 0) {
            updatedButtonRows.push(new ActionRowBuilder().addComponents(paginationButtons));
          }
          
          await interaction.editReply({
            components: updatedButtonRows.length > 0 ? updatedButtonRows : []
          });
          
          // Create collector for movie selection buttons
          const movieCollector = response.createMessageComponentCollector({
            filter: (btn) => btn.user.id === userId && btn.customId.startsWith('search_detail_'),
            time: 5 * 60 * 1000 // 5 minutes
          });

          movieCollector.on('collect', async (buttonInteraction) => {
            const customId = buttonInteraction.customId;
            const parts = customId.split('_');
            // Format: search_detail_${i}_${userId}_${page}_${cacheId}
            const movieNum = parseInt(parts[2]);
            const pageNum = parseInt(parts[4]);
            const returnCacheId = parseInt(parts[5]);
            const selectedMovie = movies[movieNum - 1];
            const slug = selectedMovie.slug;
            
            console.log(`📍 [SEARCH DETAIL CLICK] MovieNum: ${movieNum}, Page: ${pageNum}, CacheID: ${returnCacheId}, CustomID: ${customId}`);
            console.log(`🎬 [SELECTED MOVIE] Title: ${selectedMovie.name}, Slug: ${slug}`);

            try {
              // IMPORTANT: Save cache BEFORE showing detail, so back button can find it
              const cacheKey = `search_${userId}_${pageNum}_${searchQuery}`;
              console.log(`💾 [SAVING CACHE FOR BACK BUTTON] Key: ${cacheKey}, CacheID: ${returnCacheId}`);
              
              const cacheData = {
                embed: response.embeds[0],
                components: buttonRows,
                movies: movies,
                allResults: results,
                searchQuery,
                type: 'search',
                cacheId: returnCacheId,
                page: pageNum,
                totalPages: Math.ceil(results.length / 10),
                timestamp: Date.now()
              };
              searchCache.set(cacheKey, cacheData);
              cacheIdIndex.set(returnCacheId, cacheData);
              
              const detail = await getMovieDetail(slug);
              
              if (!detail) {
                await buttonInteraction.reply({ content: '❌ Không thể lấy thông tin phim', flags: 64 });
                return;
              }

              // Show movie detail with server selection buttons
              const movieDetail = new EmbedBuilder()
                .setColor('#e50914')
                .setTitle(`🎬 ${detail.name}`)
                .setThumbnail(detail.thumb_url)
                .setDescription(detail.description?.substring(0, 300) || 'Không có mô tả')
                .addFields(
                  { name: '📅 Năm phát hành', value: String(detail.year || 'N/A'), inline: true },
                  { name: '🎭 Chất lượng', value: String(detail.quality || 'N/A'), inline: true },
                  { name: '🗣️ Ngôn ngữ', value: String(detail.language || 'N/A'), inline: true },
                  { name: '📺 Số tập', value: String(detail.total_episodes || 'N/A'), inline: true },
                  { name: '▶️ Tập hiện tại', value: String(detail.current_episode || 'N/A'), inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Movie Detail' });

              // Create server selection buttons
              const serverButtons = [];
              for (let i = 0; i < detail.episodes.length; i++) {
                serverButtons.push(
                  new ButtonBuilder()
                    .setCustomId(`server_select_${i}_${slug}_${userId}`)
                    .setLabel(detail.episodes[i].server_name.substring(0, 20))
                    .setStyle(2) // Secondary style
                );
              }

              // Add back button with cacheId and searchQuery to prevent cache mixing
              serverButtons.push(
                new ButtonBuilder()
                  .setCustomId(`back_search_${returnCacheId}_${searchQuery.substring(0, 30)}`)
                  .setLabel('⬅️ Quay lại')
                  .setStyle(4) // Danger style (red)
              );

              const serverRow = serverButtons.length > 0 ? new ActionRowBuilder().addComponents(serverButtons) : null;

              await buttonInteraction.update({
                embeds: [movieDetail],
                components: serverRow ? [serverRow] : []
              });
            } catch (error) {
              console.error('❌ Lỗi khi chọn phim:', error.message);
              await buttonInteraction.reply({ content: '❌ Có lỗi xảy ra. Vui lòng thử lại!', flags: 64 });
            }
          });

          movieCollector.on('end', () => {
            // Disable buttons after collection ends
            const disabledRows = buttonRows.map(row => {
              const newRow = new ActionRowBuilder();
              row.components.forEach(btn => {
                newRow.addComponents(
                  ButtonBuilder.from(btn).setDisabled(true)
                );
              });
              return newRow;
            });
            response.edit({ components: disabledRows }).catch(() => {});
          });
        } catch (error) {
          console.error('❌ Lỗi tìm kiếm phim:', error.message);
          await interaction.editReply('❌ Có lỗi xảy ra khi tìm kiếm. Vui lòng thử lại!');
        }
        return;
      }

      if (command === 'newmovies') {
        const page = interaction.options.getInteger('page') || 1;
        
        await interaction.deferReply();
        
        try {
          const newMovies = await getNewMovies(page);
          console.log(`✅ Found ${newMovies.length} new movies on page ${page}`);
          
          if (!newMovies || newMovies.length === 0) {
            await interaction.editReply(`❌ Không tìm thấy phim mới`);
            return;
          }

          const movies = newMovies.slice(0, 10);
          
          const embed = new EmbedBuilder()
            .setColor('#e50914')
            .setTitle(`🎬 Phim Mới Cập Nhật - Trang ${page}`)
            .setDescription(`Hiển thị **${movies.length}** phim`)
            .setTimestamp();

          let description = '';
          for (let idx = 0; idx < movies.length; idx++) {
            const movie = movies[idx];
            const title = movie.name || movie.title || 'Unknown';
            const englishTitle = movie.original_name || '';
            const year = movie.year || 'N/A';
            
            const movieNum = idx + 1;
            let titleDisplay = `**${movieNum}. ${title}**`;
            if (englishTitle && englishTitle !== title) {
              titleDisplay += ` (${englishTitle})`;
            }
            
            description += `${titleDisplay}\n`;
            
            if (year !== 'N/A') {
              description += `📅 ${year}\n`;
            }
            
            description += '\n';
          }

          embed.setDescription(description);
          
          // Create pagination buttons (no detail buttons)
          const paginationButtons = [];
          if (page > 1) {
            paginationButtons.push(
              new ButtonBuilder()
                .setCustomId(`newmovies_prev_${page}_${userId}`)
                .setLabel('⬅️ Trang trước')
                .setStyle(2)
            );
          }
          
          paginationButtons.push(
            new ButtonBuilder()
              .setCustomId(`newmovies_page_${page}_${userId}`)
              .setLabel(`📄 Trang ${page}`)
              .setStyle(2)
              .setDisabled(true)
          );
          
          paginationButtons.push(
            new ButtonBuilder()
              .setCustomId(`newmovies_next_${page}_${userId}`)
              .setLabel('Trang sau ➡️')
              .setStyle(2)
          );

          const buttonRows = [];
          // Add movie buttons in rows of 5

          // Add pagination buttons
          if (paginationButtons.length > 0) {
            buttonRows.push(new ActionRowBuilder().addComponents(paginationButtons));
          }

          // Add cache for newmovies
          const newmoviesCacheId = ++cacheIdCounter;
          searchCache.set(`newmovies_${userId}_${page}`, {
            embed,
            components: buttonRows,
            movies,
            searchQuery: 'newmovies',
            type: 'newmovies',
            cacheId: newmoviesCacheId,
            timestamp: Date.now(),
            page: page
          });
          console.log(`✅ [NEWMOVIES CACHE] User ${userId} - Page: ${page}, CacheID: ${newmoviesCacheId}, Movies: ${movies.length}`);

          const response = await interaction.editReply({ 
            embeds: [embed],
            components: buttonRows.length > 0 ? buttonRows : [],
            fetchReply: true
          });
        } catch (error) {
          console.error('❌ Lỗi lấy phim mới:', error.message);
          await interaction.editReply('❌ Có lỗi xảy ra khi lấy phim mới. Vui lòng thử lại!');
        }
        
        return;
      }

      if (command === 'set-movie-update-channel') {
        console.log(`\n🔧 Processing set-movie-update-channel command...`);
        const channel = interaction.options.getChannel('channel');
        const enabled = interaction.options.getBoolean('enabled') ?? true;

        console.log(`📺 Channel: ${channel?.name} (${channel?.id}), Enabled: ${enabled}`);

        // Initialize movieUpdate config if doesn't exist
        if (!config.movieUpdate) {
          console.log(`📝 Initializing movieUpdate config...`);
          config.movieUpdate = {
            channels: [],
            enabled: true
          };
        }

        // Ensure channels array exists
        if (!config.movieUpdate.channels) {
          console.log(`📝 Initializing channels array...`);
          config.movieUpdate.channels = [];
        }

        console.log(`📊 Current channels before: ${config.movieUpdate.channels.length}`);

        // Check if channel already exists
        const channelExists = config.movieUpdate.channels.some(c => c.id === channel.id);
        
        if (enabled) {
          // Add channel if not exists
          if (!channelExists) {
            config.movieUpdate.channels.push({
              id: channel.id,
              name: channel.name,
              guildId: interaction.guildId
            });
            console.log(`✅ Added movie notification channel: ${channel.name} (${channel.id})`);
            console.log(`📊 Current channels after: ${config.movieUpdate.channels.length}`);
          } else {
            console.log(`⚠️ Channel already in notification list: ${channel.name} (${channel.id})`);
          }
        } else {
          // Remove channel from list
          config.movieUpdate.channels = config.movieUpdate.channels.filter(c => c.id !== channel.id);
          console.log(`✅ Removed movie notification channel: ${channel.name} (${channel.id})`);
          console.log(`📊 Current channels after: ${config.movieUpdate.channels.length}`);
        }

        // ALWAYS enable movieUpdate if we have channels
        config.movieUpdate.enabled = config.movieUpdate.channels.length > 0;
        console.log(`💾 Saving config with ${config.movieUpdate.channels.length} channels... (enabled: ${config.movieUpdate.enabled})`);
        console.log(`📋 Channels:`, JSON.stringify(config.movieUpdate.channels, null, 2));
        console.log(`📝 CONFIG_FILE path: ${CONFIG_FILE}`);
        console.log(`📝 Full config object:`, JSON.stringify(config, null, 2));
        saveConfig();
        console.log(`✨ Save complete!\n`);

        const statusEmbed = new EmbedBuilder()
          .setColor(enabled ? '#10b981' : '#ef4444')
          .setTitle('⚙️ Thiết lập kênh thông báo phim update')
          .addFields(
            { name: '📺 Kênh được chọn', value: `${channel} (${channel.id})`, inline: false },
            { name: '🔄 Thao tác', value: enabled ? '✅ Thêm vào danh sách' : '❌ Xóa khỏi danh sách', inline: false },
            { name: '📊 Tổng channels', value: `${config.movieUpdate.channels.length}`, inline: false }
          )
          .setFooter({ text: 'Bot sẽ gửi thông báo phim mới vào tất cả channels đã thiết lập mỗi 30 phút' })
          .setTimestamp();

        await interaction.reply({ embeds: [statusEmbed] });
        return;
      }
    } catch (error) {
      console.error('❌ Lỗi xử lý slash command:', error);
      if (!interaction.replied) {
        await interaction.reply({ content: '❌ Có lỗi xảy ra khi xử lý lệnh.', flags: 64 }).catch(() => {});
      }
    }
  }
  
  // Original interaction handlers for select menus and buttons
  if (!interaction.isChatInputCommand() && !interaction.isStringSelectMenu() && !interaction.isButton()) return;
  
  if (interaction.isStringSelectMenu()) {
    // Search dropdowns
    if (interaction.customId === 'track_team_select') {
      const userId = interaction.user.id;
      const teamId = parseInt(interaction.values[0]);
      const team = config.livescoreTeams.find(t => t.id === teamId);
      
      if (!team) {
        await interaction.reply({ content: '❌ Team không tồn tại!', flags: 64 });
        return;
      }
      
      // Add team to user's tracked list
      addUserTrackedTeam(userId, teamId);
      saveConfig();
      
      // Send public notification
      try {
        const publicMsg = await interaction.channel.send(`✅ **${interaction.user.username}** đã theo dõi **${team.name}**`);
        setTimeout(() => {
          publicMsg.delete().catch(() => {});
        }, 5000);
      } catch (e) {
        console.error('Error sending public track message:', e.message);
      }
      
      // Reply to interaction (ephemeral)
      await interaction.reply({ content: `✅ Đang theo dõi **${team.name}**!`, flags: 64 }).catch(() => {});
      return;
    }
    
    if (interaction.customId === 'untrack_team_select') {
      const userId = interaction.user.id;
      const teamId = parseInt(interaction.values[0]);
      const team = config.livescoreTeams.find(t => t.id === teamId);
      
      if (!team) {
        await interaction.reply({ content: '❌ Team không tồn tại!', flags: 64 });
        return;
      }
      
      const currentUserTeams = getUserTrackedTeams(userId);
      if (!currentUserTeams.includes(teamId)) {
        await interaction.reply({ content: `⚠️ Bạn không theo dõi **${team.name}**!`, flags: 64 });
        return;
      }
      
      // Remove team from user's tracked list
      removeUserTrackedTeam(userId, teamId);
      saveConfig();
      
      // Send public notification
      try {
        const publicMsg = await interaction.channel.send(`❌ **${interaction.user.username}** đã hủy theo dõi **${team.name}**`);
        setTimeout(() => {
          publicMsg.delete().catch(() => {});
        }, 5000);
      } catch (e) {
        console.error('Error sending public untrack message:', e.message);
      }
      
      // Reply to interaction (ephemeral)
      await interaction.reply({ content: `✅ Đã hủy theo dõi **${team.name}**!`, flags: 64 }).catch(() => {});
      return;
    }
    
    if (interaction.customId === 'fixtures_team_select') {
      const userId = interaction.user.id;
      const teamId = parseInt(interaction.values[0]);
      
      await interaction.deferReply();
      
      try {
        const fixtures = await getFixturesWithCL(teamId, 10);
        
        if (fixtures.length === 0) {
          await interaction.editReply('❌ Không tìm thấy lịch thi đấu!');
          return;
        }
        
        // Get team name
        const team = config.livescoreTeams.find(t => t.id === teamId);
        const teamName = team?.name || `Team ${teamId}`;
        
        // Create main embed with professional styling (Tailwind-inspired)
        const embeds = [];
        const headerEmbed = new EmbedBuilder()
          .setColor('#1e40af') // Tailwind blue-800
          .setTitle(`⚽ ${teamName}`)
          .setDescription(`**Lịch Thi Đấu Sắp Tới**\n${fixtures.length} trận`)
          .setTimestamp()
          .setFooter({ text: 'Football Bot | Updated' });
        
        embeds.push(headerEmbed);
        
        // Create individual embed for each fixture block
        let currentText = '';
        let matchCount = 0;
        
        fixtures.slice(0, 10).forEach((f, idx) => {
          const date = new Date(f.utcDate);
          const dateStr = date.toLocaleString('vi-VN', {
            weekday: 'short',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
          const opponent = f.homeTeam.id === teamId ? f.awayTeam.name : f.homeTeam.name;
          const isHome = f.homeTeam.id === teamId ? '🏠' : '✈️';
          const competition = f.inChampionsLeague ? '🏆 Champions League' : (f.competition?.name || 'Unknown');
          
          const matchStr = `\`${idx + 1}.\` ${isHome} **${opponent}**\n└─ 📅 ${dateStr} • ${competition}\n`;
          
          currentText += matchStr;
          matchCount++;
          
          // Create new embed every 5 matches to avoid character limit
          if (matchCount === 5 || idx === fixtures.length - 1) {
            const fixturesEmbed = new EmbedBuilder()
              .setColor('#059669') // Tailwind green-600
              .setDescription(currentText.trim())
              .setFooter({ text: `Trận ${matchCount === 5 ? (idx - 4) + '-' + (idx + 1) : (idx - matchCount + 2) + '-' + (idx + 1)} của ${fixtures.length}` });
            
            embeds.push(fixturesEmbed);
            currentText = '';
            matchCount = 0;
          }
        });
        
        await interaction.editReply({ embeds });
      } catch (e) {
        console.error('❌ Lỗi lấy lịch thi đấu:', e.message);
        await interaction.editReply('❌ Có lỗi xảy ra khi lấy lịch thi đấu. Vui lòng thử lại!');
      }
      return;
    }

    // Game select menu handlers with pagination support
    if (interaction.customId.startsWith('game_weapon_select_')) {
      await handleWeaponSelect(interaction);
      return;
    }

    if (interaction.customId.startsWith('game_npc_select_')) {
      await handleNPCSelect(interaction);
      return;
    }

    if (interaction.customId.startsWith('game_boss_select_')) {
      await handleBossSelect(interaction);
      return;
    }

    if (interaction.customId.startsWith('game_skill_select_')) {
      await handleSkillSelect(interaction);
      return;
    }

    if (interaction.customId.startsWith('game_item_select_')) {
      await handleItemSelect(interaction);
      return;
    }
  }
  
  // Handle button clicks for movies and other features
  if (interaction.isButton()) {
    const customId = interaction.customId;
    const userId = interaction.user.id;
    
    try {
      // Server selection buttons for movies
      if (customId.startsWith('server_select_')) {
        const parts = customId.split('_');
        const serverIndex = parseInt(parts[2]);
        const slug = parts[3];
        const interactionUserId = parts[4];
        const cacheId = parts[5] ? parseInt(parts[5]) : null;
        
        if (userId !== interactionUserId) {
          await interaction.reply({ content: '❌ Bạn không có quyền sử dụng button này!', flags: 64 });
          return;
        }
        
        // Defer the reply since we'll be making API calls
        await interaction.deferReply({ flags: 64 });
        
        try {
          let currentEpisodePage = 1;
          
          const createEpisodesEmbed = async (page) => {
            const result = await getEpisodes(slug, page, serverIndex);
            
            if (!result.episodes || result.episodes.length === 0) {
              return null;
            }

            const episodeEmbed = new EmbedBuilder()
              .setColor('#e50914')
              .setTitle(`🎬 ${result.movieName}`)
              .setDescription(`📺 Server: **${result.serverName}**`)
              .setTimestamp()
              .setFooter({ text: `Trang ${result.currentPage}/${result.totalPages} | Tổng ${result.totalEpisodes} tập` });

            let episodeList = '';
            for (const episode of result.episodes) {
              const episodeNum = episode.name;
              episodeList += `**Tập ${episodeNum}**: [Xem →](${episode.embed})\n`;
            }

            episodeEmbed.addFields({ name: 'Danh sách tập', value: episodeList || 'Không có tập' });
            return { embed: episodeEmbed, result };
          };

          const initialData = await createEpisodesEmbed(1);
          
          if (!initialData) {
            await interaction.editReply({
              content: `❌ Không tìm thấy tập phim`,
            });
            return;
          }

          const { result: epResult } = initialData;

          // Create pagination buttons
          const createPaginationButtons = (page) => {
            const paginationButtons = [];
            
            if (page > 1) {
              paginationButtons.push(
                new ButtonBuilder()
                  .setCustomId(`ep_prev_${serverIndex}_${slug}_${userId}${cacheId ? `_${cacheId}` : ''}`)
                  .setLabel('⬅️ Trang trước')
                  .setStyle(1)
              );
            }

            paginationButtons.push(
              new ButtonBuilder()
                .setCustomId(`ep_page_${serverIndex}_${slug}_${userId}`)
                .setLabel(`${page}/${epResult.totalPages}`)
                .setStyle(2)
                .setDisabled(true)
            );

            if (page < epResult.totalPages) {
              paginationButtons.push(
                new ButtonBuilder()
                  .setCustomId(`ep_next_${serverIndex}_${slug}_${userId}${cacheId ? `_${cacheId}` : ''}`)
                  .setLabel('Trang sau ➡️')
                  .setStyle(1)
              );
            }

            // Add back button
            paginationButtons.push(
              new ButtonBuilder()
                .setCustomId(`back_to_servers_${slug}_${userId}${cacheId ? `_${cacheId}` : ''}`)
                .setLabel('⬅️ Quay lại')
                .setStyle(4)
            );

            return paginationButtons;
          };

          await interaction.editReply({
            embeds: [initialData.embed],
            components: [new ActionRowBuilder().addComponents(createPaginationButtons(1))],
            fetchReply: true
          });
        } catch (err) {
          console.error('Error showing episodes:', err);
          await interaction.editReply('❌ Lỗi khi tải tập phim');
        }
        return;
      }
      
      // Pagination for episodes - go to previous page
      if (customId.startsWith('ep_prev_')) {
        const parts = customId.split('_');
        const serverIndex = parseInt(parts[2]);
        const slug = parts[3];
        const interactionUserId = parts[4];
        
        if (userId !== interactionUserId) {
          await interaction.reply({ content: '❌ Bạn không có quyền sử dụng button này!', flags: 64 });
          return;
        }
        
        await interaction.deferUpdate();
        
        try {
          const currentPage = parseInt(interaction.message.components[0].components.find(c => c.customId.includes('ep_page_'))?.label?.split('/')[0] || 1);
          const newPage = currentPage - 1;
          
          const result = await getEpisodes(slug, newPage, serverIndex);
          if (!result || !result.episodes || result.episodes.length === 0) {
            return;
          }
          
          const episodeEmbed = new EmbedBuilder()
            .setColor('#e50914')
            .setTitle(`🎬 ${result.movieName}`)
            .setDescription(`📺 Server: **${result.serverName}**`)
            .setTimestamp()
            .setFooter({ text: `Trang ${result.currentPage}/${result.totalPages} | Tổng ${result.totalEpisodes} tập` });

          let episodeList = '';
          for (const episode of result.episodes) {
            const episodeNum = episode.name;
            episodeList += `**Tập ${episodeNum}**: [Xem →](${episode.embed})\n`;
          }
          episodeEmbed.addFields({ name: 'Danh sách tập', value: episodeList || 'Không có tập' });
          
          // Create new pagination buttons
          const newButtons = [];
          if (newPage > 1) {
            newButtons.push(new ButtonBuilder().setCustomId(`ep_prev_${serverIndex}_${slug}_${userId}`).setLabel('⬅️ Trang trước').setStyle(1));
          }
          newButtons.push(new ButtonBuilder().setCustomId(`ep_page_${serverIndex}_${slug}_${userId}`).setLabel(`${newPage}/${result.totalPages}`).setStyle(2).setDisabled(true));
          if (newPage < result.totalPages) {
            newButtons.push(new ButtonBuilder().setCustomId(`ep_next_${serverIndex}_${slug}_${userId}`).setLabel('Trang sau ➡️').setStyle(1));
          }
          newButtons.push(new ButtonBuilder().setCustomId(`back_to_servers_${slug}_${userId}`).setLabel('⬅️ Quay lại').setStyle(4));
          
          await interaction.editReply({ embeds: [episodeEmbed], components: [new ActionRowBuilder().addComponents(newButtons)] });
        } catch (err) {
          console.error('Error pagination:', err);
        }
        return;
      }
      
      // Pagination for episodes - go to next page
      if (customId.startsWith('ep_next_')) {
        const parts = customId.split('_');
        const serverIndex = parseInt(parts[2]);
        const slug = parts[3];
        const interactionUserId = parts[4];
        
        if (userId !== interactionUserId) {
          await interaction.reply({ content: '❌ Bạn không có quyền sử dụng button này!', flags: 64 });
          return;
        }
        
        await interaction.deferUpdate();
        
        try {
          const currentPage = parseInt(interaction.message.components[0].components.find(c => c.customId.includes('ep_page_'))?.label?.split('/')[0] || 1);
          const newPage = currentPage + 1;
          
          const result = await getEpisodes(slug, newPage, serverIndex);
          if (!result || !result.episodes || result.episodes.length === 0) {
            return;
          }
          
          const episodeEmbed = new EmbedBuilder()
            .setColor('#e50914')
            .setTitle(`🎬 ${result.movieName}`)
            .setDescription(`📺 Server: **${result.serverName}**`)
            .setTimestamp()
            .setFooter({ text: `Trang ${result.currentPage}/${result.totalPages} | Tổng ${result.totalEpisodes} tập` });

          let episodeList = '';
          for (const episode of result.episodes) {
            const episodeNum = episode.name;
            episodeList += `**Tập ${episodeNum}**: [Xem →](${episode.embed})\n`;
          }
          episodeEmbed.addFields({ name: 'Danh sách tập', value: episodeList || 'Không có tập' });
          
          // Create new pagination buttons
          const newButtons = [];
          if (newPage > 1) {
            newButtons.push(new ButtonBuilder().setCustomId(`ep_prev_${serverIndex}_${slug}_${userId}`).setLabel('⬅️ Trang trước').setStyle(1));
          }
          newButtons.push(new ButtonBuilder().setCustomId(`ep_page_${serverIndex}_${slug}_${userId}`).setLabel(`${newPage}/${result.totalPages}`).setStyle(2).setDisabled(true));
          if (newPage < result.totalPages) {
            newButtons.push(new ButtonBuilder().setCustomId(`ep_next_${serverIndex}_${slug}_${userId}`).setLabel('Trang sau ➡️').setStyle(1));
          }
          newButtons.push(new ButtonBuilder().setCustomId(`back_to_servers_${slug}_${userId}`).setLabel('⬅️ Quay lại').setStyle(4));
          
          await interaction.editReply({ embeds: [episodeEmbed], components: [new ActionRowBuilder().addComponents(newButtons)] });
        } catch (err) {
          console.error('Error pagination:', err);
        }
        return;
      }
      
      // Back from episodes to servers - this needs the movie detail embed
      if (customId.startsWith('back_to_servers_')) {
        const parts = customId.split('_');
        const slug = parts[3];
        const interactionUserId = parts[4];
        const cacheId = parts[5] ? parseInt(parts[5]) : null;
        
        if (userId !== interactionUserId) {
          await interaction.reply({ content: '❌ Bạn không có quyền sử dụng button này!', flags: 64 });
          return;
        }
        
        await interaction.deferUpdate();
        
        try {
          const detail = await getMovieDetail(slug);
          if (!detail) {
            return;
          }
          
          const movieDetail = new EmbedBuilder()
            .setColor('#e50914')
            .setTitle(`🎬 ${detail.name}`)
            .setThumbnail(detail.thumb_url)
            .setDescription(detail.description?.substring(0, 300) || 'Không có mô tả')
            .addFields(
              { name: '📅 Năm phát hành', value: String(detail.year || 'N/A'), inline: true },
              { name: '🎭 Chất lượng', value: String(detail.quality || 'N/A'), inline: true },
              { name: '🗣️ Ngôn ngữ', value: String(detail.language || 'N/A'), inline: true },
              { name: '📺 Số tập', value: String(detail.total_episodes || 'N/A'), inline: true },
              { name: '▶️ Tập hiện tại', value: String(detail.current_episode || 'N/A'), inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'Movie Detail' });

          // Create server selection buttons
          const serverButtons = [];
          for (let i = 0; i < detail.episodes.length; i++) {
            serverButtons.push(
              new ButtonBuilder()
                .setCustomId(`server_select_${i}_${slug}_${userId}`)
                .setLabel(detail.episodes[i].server_name.substring(0, 20))
                .setStyle(2)
            );
          }

          // Add back button to go back to movie list
          serverButtons.push(
            new ButtonBuilder()
              .setCustomId(`back_to_search_${cacheId || 'default'}`)
              .setLabel('⬅️ Quay lại')
              .setStyle(4)
          );

          const serverRow = serverButtons.length > 0 ? new ActionRowBuilder().addComponents(serverButtons) : null;
          
          await interaction.editReply({
            embeds: [movieDetail],
            components: serverRow ? [serverRow] : []
          });
        } catch (err) {
          console.error('Error back to servers:', err);
        }
        return;
      }
      
      // Back from servers to movie list (search)
      if (customId.startsWith('back_to_search_list_')) {
        const parts = customId.split('_');
        const pageNum = parseInt(parts[4]);
        const searchQuery = parts.slice(5).join('_');
        
        console.log(`⬅️ [BACK SEARCH] User: ${userId}, Page: ${pageNum}, Query: ${searchQuery}`);
        
        await interaction.deferUpdate();
        
        try {
          const cacheKey = `search_${userId}_${pageNum}_${searchQuery}`;
          const cached = searchCache.get(cacheKey);
          console.log(`📦 [SEARCH CACHE CHECK] Key: ${cacheKey}, Found: ${!!cached}`);
          
          if (cached && cached.type === 'search') {
            console.log(`✅ [SEARCH CACHE HIT] Restoring ${cached.movies.length} movies from page ${pageNum}`);
            
            await interaction.editReply({
              embeds: [cached.embed],
              components: cached.components
            });
            console.log(`✅ [SEARCH BACK SUCCESS] Message updated`);
          } else {
            console.log(`⚠️ [SEARCH CACHE MISS] Cache not found for page ${pageNum}`);
          }
        } catch (err) {
          console.error('Error back to search:', err);
        }
        return;
      }

      // Back button handler for search
      if (customId.startsWith('back_search_')) {
        const afterPrefix = customId.replace('back_search_', '');
        const returnCacheId = parseInt(afterPrefix);
        
        console.log(`⬅️ [BACK SEARCH] User: ${userId}, CacheID: ${returnCacheId}`);
        console.log(`🔍 Parsing: customId="${customId}", afterPrefix="${afterPrefix}", returnCacheId=${returnCacheId}`);
        
        await interaction.deferUpdate();
        
        try {
          // Fast O(1) lookup using cacheIdIndex instead of looping
          const cached = cacheIdIndex.get(returnCacheId);
          
          console.log(`🔍 [FAST CACHE LOOKUP] CacheID: ${returnCacheId}, Found: ${!!cached}`);
          
          if (!cached) {
            console.log(`⚠️ [SEARCH CACHE MISS] Cache not found for cacheId ${returnCacheId}`);
            await interaction.editReply({
              content: '❌ Cache đã hết hạn hoặc không tìm thấy. Vui lòng tìm kiếm lại!',
              components: []
            });
            return;
          }
          
          console.log(`✅ [SEARCH CACHE HIT] Restoring ${cached.movies.length} movies from page ${cached.page}/${cached.totalPages}`);
          
          // Recreate buttons with proper IDs
          const page = cached.page;
          const movies = cached.movies;
          const searchQuery = cached.searchQuery;
          
          console.log(`🎬 [RECREATING BUTTONS] Page: ${page}, Movies: ${movies.length}, Query: ${searchQuery}`);
          
          const buttons = [];
          
          for (let i = 1; i <= Math.min(10, movies.length); i++) {
            const movieTitle = movies[i - 1].name.substring(0, 15);
            buttons.push(
              new ButtonBuilder()
                .setCustomId(`search_detail_${i}_${userId}_${page}_${returnCacheId}`)
                .setLabel(`${i}. ${movieTitle}`)
                .setStyle(1)
            );
          }

          // Add pagination buttons
          const paginationButtons = [];
          if (page > 1) {
            paginationButtons.push(
              new ButtonBuilder()
                .setCustomId(`search_prev_${page}_${userId}_${searchQuery}`)
                .setLabel('⬅️ Trang trước')
                .setStyle(2)
            );
          }
          
          paginationButtons.push(
            new ButtonBuilder()
              .setCustomId(`search_page_${page}_${userId}`)
              .setLabel(`📄 Trang ${page}/${cached.totalPages}`)
              .setStyle(2)
              .setDisabled(true)
          );
          
          if (page < cached.totalPages) {
            paginationButtons.push(
              new ButtonBuilder()
                .setCustomId(`search_next_${page}_${userId}_${searchQuery}`)
                .setLabel('Trang sau ➡️')
                .setStyle(2)
            );
          }

          const buttonRows = [];

          // Add detail buttons first
          for (let row = 0; row < Math.ceil(buttons.length / 2); row++) {
            const rowButtons = buttons.slice(row * 2, (row + 1) * 2);
            if (rowButtons.length > 0) {
              buttonRows.push(new ActionRowBuilder().addComponents(rowButtons));
            }
          }

          // Add pagination buttons
          if (paginationButtons.length > 0) {
            buttonRows.push(new ActionRowBuilder().addComponents(paginationButtons));
          }

          // Create new embed with current page info
          const embed = new EmbedBuilder()
            .setColor('#e50914')
            .setTitle(`🎬 Kết quả tìm kiếm: "${searchQuery}" - Trang ${page}/${cached.totalPages}`)
            .setDescription(cached.embed.description)
            .setTimestamp();

          await interaction.editReply({
            embeds: [embed],
            components: buttonRows
          });
          
          console.log(`✅ [SEARCH BACK SUCCESS] Restored page ${page}/${cached.totalPages}`);
        } catch (err) {
          console.error('Error back to search:', err);
        }
        return;
      }

      // Back button handler for search
      if (customId.startsWith('back_search_')) {
        const afterPrefix = customId.replace('back_search_', '');
        const parts = afterPrefix.split('_');
        const returnCacheId = parseInt(parts[0]);
        const returnSearchQuery = parts.slice(1).join('_'); // Reconstruct searchQuery
        
        console.log(`⬅️ [BACK SEARCH] User: ${userId}, CacheID: ${returnCacheId}, Query: ${returnSearchQuery}`);
        
        try {
          await interaction.deferUpdate();
        } catch (e) {
          console.log('⚠️ Interaction already acknowledged, skipping deferUpdate');
        }
        
        try {
          // Fast O(1) lookup using cacheIdIndex instead of looping
          const cached = cacheIdIndex.get(returnCacheId);
          
          console.log(`🔍 [FAST CACHE LOOKUP] CacheID: ${returnCacheId}, Query: ${returnSearchQuery}, Found: ${!!cached}`);
          
          if (!cached) {
            console.log(`⚠️ [SEARCH CACHE MISS] Cache not found for cacheId ${returnCacheId}`);
            return;
          }
          
          // Verify searchQuery matches to prevent cache mixing
          if (cached.searchQuery !== returnSearchQuery) {
            console.warn(`⚠️ [CACHE MISMATCH] Query mismatch: expected "${returnSearchQuery}", got "${cached.searchQuery}"`);
            return;
          }
          
          const page = cached.page;
          const movies = cached.movies;
          const searchQuery = cached.searchQuery;
          
          console.log(`🎬 [RECREATING BUTTONS] Page: ${page}, Movies: ${movies.length}, Query: ${searchQuery}`);
          
          const buttons = [];
          
          for (let i = 1; i <= Math.min(10, movies.length); i++) {
            const movieTitle = movies[i - 1].name.substring(0, 15);
            buttons.push(
              new ButtonBuilder()
                .setCustomId(`search_detail_${i}_${userId}_${page}_${returnCacheId}`)
                .setLabel(`${i}. ${movieTitle}`)
                .setStyle(1)
            );
          }

          // Add pagination buttons
          const paginationButtons = [];
          if (page > 1) {
            paginationButtons.push(
              new ButtonBuilder()
                .setCustomId(`search_prev_${page}_${userId}_${searchQuery}`)
                .setLabel('⬅️ Trang trước')
                .setStyle(2)
            );
          }
          
          paginationButtons.push(
            new ButtonBuilder()
              .setCustomId(`search_page_${page}_${userId}`)
              .setLabel(`📄 Trang ${page}/${cached.totalPages}`)
              .setStyle(2)
              .setDisabled(true)
          );
          
          if (page < cached.totalPages) {
            paginationButtons.push(
              new ButtonBuilder()
                .setCustomId(`search_next_${page}_${userId}_${searchQuery}`)
                .setLabel('Trang sau ➡️')
                .setStyle(2)
            );
          }

          const buttonRows = [];
          for (let i = 0; i < buttons.length; i += 5) {
            buttonRows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
          }
          if (paginationButtons.length > 0) {
            buttonRows.push(new ActionRowBuilder().addComponents(paginationButtons));
          }
          
          console.log(`🖱️ [BUTTON ROWS] Total rows: ${buttonRows.length}`);
          
          await interaction.editReply({
            embeds: [cached.embed],
            components: buttonRows
          });
          console.log(`✅ [SEARCH BACK SUCCESS] Message updated`);
        } catch (err) {
          console.error('❌ Error back to search:', err);
        }
        return;
      }

      // Old back_to_search handler for compatibility (deprecated)
      if (customId.startsWith('back_to_search_') && !customId.includes('list_')) {
        const cacheId = customId.replace('back_to_search_', '');
        console.log(`⚠️ [DEPRECATED BACK] Using old back_to_search handler for cacheId: ${cacheId}`);
        
        await interaction.deferUpdate();
        
        try {
          // Search for cache with matching cacheId (fallback to first search cache if not found)
          let cached = null;
          let foundKey = null;
          
          for (const [key, value] of searchCache.entries()) {
            if (value.type === 'search' && value.cacheId === parseInt(cacheId)) {
              cached = value;
              foundKey = key;
              break;
            }
          }
          
          // If not found, try to get any recent search cache for this user
          if (!cached) {
            for (const [key, value] of searchCache.entries()) {
              if (value.type === 'search' && key.includes(userId)) {
                cached = value;
                foundKey = key;
                console.log(`✅ Using fallback search cache for user`);
                break;
              }
            }
          }
          
          if (cached && cached.type === 'search') {
            console.log(`✅ [DEPRECATED BACK SUCCESS] Restoring ${cached.movies.length} movies`);
            
            const page = cached.page;
            const movies = cached.movies;
            const returnCacheId = cached.cacheId;
            
            const buttons = [];
            for (let i = 1; i <= Math.min(10, movies.length); i++) {
              const movieTitle = movies[i - 1].name.substring(0, 15);
              buttons.push(
                new ButtonBuilder()
                  .setCustomId(`search_detail_${i}_${userId}_${page}_${returnCacheId}`)
                  .setLabel(`${i}. ${movieTitle}`)
                  .setStyle(1)
              );
            }

            const paginationButtons = [];
            if (page > 1) {
              paginationButtons.push(
                new ButtonBuilder()
                  .setCustomId(`search_prev_${page}_${userId}_${cached.searchQuery}`)
                  .setLabel('⬅️ Trang trước')
                  .setStyle(2)
              );
            }
            
            paginationButtons.push(
              new ButtonBuilder()
                .setCustomId(`search_page_${page}_${userId}`)
                .setLabel(`📄 Trang ${page}/${cached.totalPages}`)
                .setStyle(2)
                .setDisabled(true)
            );
            
            if (page < cached.totalPages) {
              paginationButtons.push(
                new ButtonBuilder()
                  .setCustomId(`search_next_${page}_${userId}_${cached.searchQuery}`)
                  .setLabel('Trang sau ➡️')
                  .setStyle(2)
              );
            }

            const buttonRows = [];
            for (let i = 0; i < buttons.length; i += 5) {
              buttonRows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
            }
            if (paginationButtons.length > 0) {
              buttonRows.push(new ActionRowBuilder().addComponents(paginationButtons));
            }
            
            await interaction.editReply({
              embeds: [cached.embed],
              components: buttonRows
            });
          } else {
            console.log(`⚠️ [DEPRECATED BACK FAIL] No cache found for cacheId ${cacheId}`);
          }
        } catch (err) {
          console.error('❌ Error in deprecated back handler:', err);
        }
        return;
      }
      
      // Back from servers to movie list (newmovies)
      if (customId.startsWith('back_to_newmovies_list_')) {
        const parts = customId.split('_');
        const pageNum = parseInt(parts[4]);
        console.log(`⬅️ [BACK NEWMOVIES] User: ${userId}, Page: ${pageNum}`);
        
        await interaction.deferUpdate();
        
        try {
          const cacheKey = `newmovies_${userId}_${pageNum}`;
          const cached = searchCache.get(cacheKey);
          console.log(`📦 [NEWMOVIES CACHE CHECK] Key: ${cacheKey}, Found: ${!!cached}`);
          
          if (cached && cached.type === 'newmovies') {
            console.log(`✅ [NEWMOVIES CACHE HIT] Restoring ${cached.movies.length} movies from page ${pageNum}`);
            
            await interaction.editReply({
              embeds: [cached.embed],
              components: cached.components
            });
            console.log(`✅ [NEWMOVIES BACK SUCCESS] Message updated`);
          } else {
            console.log(`⚠️ [NEWMOVIES CACHE MISS] Cache not found for page ${pageNum}`);
            // Fallback: reload the page
            const newMovies = await getNewMovies(pageNum);
            if (newMovies && newMovies.length > 0) {
              const movies = newMovies.slice(0, 10);
              
              const embed = new EmbedBuilder()
                .setColor('#e50914')
                .setTitle(`🎬 Phim Mới Cập Nhật - Trang ${pageNum}`)
                .setDescription(`Hiển thị **${movies.length}** phim`)
                .setTimestamp();

              let description = '';
              for (let idx = 0; idx < movies.length; idx++) {
                const movie = movies[idx];
                const slug = movie.slug || '';
                const title = movie.name || movie.title || 'Unknown';
                const englishTitle = movie.original_name || '';
                const year = movie.year || 'N/A';
                
                let totalEpisodes = 'N/A';
                let category = 'N/A';
                try {
                  if (slug) {
                    const detail = await getMovieDetail(slug);
                    if (detail) {
                      if (detail.total_episodes) {
                        totalEpisodes = detail.total_episodes.toString();
                      }
                      if (detail.category && detail.category[1]) {
                        const categoryList = detail.category[1].list;
                        if (categoryList && categoryList.length > 0) {
                          category = categoryList[0].name;
                        }
                      }
                    }
                  }
                } catch (e) {
                  console.log(`⚠️ Could not fetch detail for ${slug}`);
                }
                
                const movieNum = idx + 1;
                let titleDisplay = `**${movieNum}. ${title}**`;
                if (englishTitle && englishTitle !== title) {
                  titleDisplay += ` (${englishTitle})`;
                }
                
                description += `${titleDisplay}\n`;
                
                let infoLine = '';
                if (year !== 'N/A') {
                  infoLine += `📅 ${year}`;
                }
                if (category !== 'N/A') {
                  infoLine += infoLine ? ` | 📺 ${category}` : `📺 ${category}`;
                }
                if (totalEpisodes !== 'N/A') {
                  infoLine += infoLine ? ` | 🎬 ${totalEpisodes} tập` : `🎬 ${totalEpisodes} tập`;
                }
                
                if (infoLine) {
                  description += infoLine + '\n';
                }
                
                description += '\n';
              }

              embed.setDescription(description);
              
              const buttons = [];
              for (let i = 1; i <= Math.min(10, movies.length); i++) {
                const movieTitle = movies[i - 1].name.substring(0, 15);
                buttons.push(
                  new ButtonBuilder()
                    .setCustomId(`newmovies_detail_${i}_${userId}_${pageNum}`)
                    .setLabel(`${i}. ${movieTitle}`)
                    .setStyle(1)
                );
              }

              const paginationButtons = [];
              if (pageNum > 1) {
                paginationButtons.push(
                  new ButtonBuilder()
                    .setCustomId(`newmovies_prev_${pageNum}_${userId}`)
                    .setLabel('⬅️ Trang trước')
                    .setStyle(2)
                );
              }
              
              paginationButtons.push(
                new ButtonBuilder()
                  .setCustomId(`newmovies_page_${pageNum}_${userId}`)
                  .setLabel(`📄 Trang ${pageNum}`)
                  .setStyle(2)
                  .setDisabled(true)
              );
              
              paginationButtons.push(
                new ButtonBuilder()
                  .setCustomId(`newmovies_next_${pageNum}_${userId}`)
                  .setLabel('Trang sau ➡️')
                  .setStyle(2)
              );

              const buttonRows = [];
              for (let i = 0; i < buttons.length; i += 5) {
                buttonRows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
              }
              if (paginationButtons.length > 0) {
                buttonRows.push(new ActionRowBuilder().addComponents(paginationButtons));
              }

              await interaction.editReply({
                embeds: [embed],
                components: buttonRows.length > 0 ? buttonRows : []
              });
            }
          }
        } catch (err) {
          console.error('Error back to newmovies:', err);
        }
        return;
      }

      // Newmovies pagination - Previous page
      if (customId.startsWith('newmovies_prev_')) {
        const parts = customId.split('_');
        const currentPage = parseInt(parts[2]);
        const nextPage = currentPage - 1;
        
        console.log(`⬅️ [NEWMOVIES PREV] User: ${userId}, Page: ${currentPage} -> ${nextPage}`);
        
        await interaction.deferUpdate();
        
        try {
          const newMovies = await getNewMovies(nextPage);
          console.log(`✅ Found ${newMovies.length} movies on page ${nextPage}`);
          
          if (!newMovies || newMovies.length === 0) {
            console.log(`❌ No movies on page ${nextPage}`);
            return;
          }

          const movies = newMovies.slice(0, 10);
          
          const embed = new EmbedBuilder()
            .setColor('#e50914')
            .setTitle(`🎬 Phim Mới Cập Nhật - Trang ${nextPage}`)
            .setDescription(`Hiển thị **${movies.length}** phim`)
            .setTimestamp();

          let description = '';
          for (let idx = 0; idx < movies.length; idx++) {
            const movie = movies[idx];
            const title = movie.name || movie.title || 'Unknown';
            const englishTitle = movie.original_name || '';
            const year = movie.year || 'N/A';
            
            const movieNum = idx + 1;
            let titleDisplay = `**${movieNum}. ${title}**`;
            if (englishTitle && englishTitle !== title) {
              titleDisplay += ` (${englishTitle})`;
            }
            
            description += `${titleDisplay}\n`;
            
            if (year !== 'N/A') {
              description += `📅 ${year}\n`;
            }
            
            description += '\n';
          }

          embed.setDescription(description);
          
          // Create pagination buttons
          const paginationButtons = [];
          if (nextPage > 1) {
            paginationButtons.push(
              new ButtonBuilder()
                .setCustomId(`newmovies_prev_${nextPage}_${userId}`)
                .setLabel('⬅️ Trang trước')
                .setStyle(2)
            );
          }
          
          paginationButtons.push(
            new ButtonBuilder()
              .setCustomId(`newmovies_page_${nextPage}_${userId}`)
              .setLabel(`📄 Trang ${nextPage}`)
              .setStyle(2)
              .setDisabled(true)
          );
          
          paginationButtons.push(
            new ButtonBuilder()
              .setCustomId(`newmovies_next_${nextPage}_${userId}`)
              .setLabel('Trang sau ➡️')
              .setStyle(2)
          );

          const buttonRows = [];

          if (paginationButtons.length > 0) {
            buttonRows.push(new ActionRowBuilder().addComponents(paginationButtons));
          }

          await interaction.editReply({
            embeds: [embed],
            components: buttonRows.length > 0 ? buttonRows : []
          });
          
          const newmoviesCacheId = ++cacheIdCounter;
          searchCache.set(`newmovies_${userId}_${nextPage}`, {
            embed,
            components: buttonRows,
            movies,
            searchQuery: 'newmovies',
            type: 'newmovies',
            cacheId: newmoviesCacheId,
            timestamp: Date.now(),
            page: nextPage
          });
        } catch (err) {
          console.error('Error newmovies prev:', err);
        }
        return;
      }

      // Newmovies pagination - Next page
      if (customId.startsWith('newmovies_next_')) {
        const parts = customId.split('_');
        const currentPage = parseInt(parts[2]);
        const nextPage = currentPage + 1;
        
        console.log(`➡️ [NEWMOVIES NEXT] User: ${userId}, Page: ${currentPage} -> ${nextPage}`);
        
        await interaction.deferUpdate();
        
        try {
          const newMovies = await getNewMovies(nextPage);
          console.log(`✅ Found ${newMovies.length} movies on page ${nextPage}`);
          
          if (!newMovies || newMovies.length === 0) {
            console.log(`❌ No movies on page ${nextPage}`);
            return;
          }

          const movies = newMovies.slice(0, 10);
          
          const embed = new EmbedBuilder()
            .setColor('#e50914')
            .setTitle(`🎬 Phim Mới Cập Nhật - Trang ${nextPage}`)
            .setDescription(`Hiển thị **${movies.length}** phim`)
            .setTimestamp();

          let description = '';
          for (let idx = 0; idx < movies.length; idx++) {
            const movie = movies[idx];
            const title = movie.name || movie.title || 'Unknown';
            const englishTitle = movie.original_name || '';
            const year = movie.year || 'N/A';
            
            const movieNum = idx + 1;
            let titleDisplay = `**${movieNum}. ${title}**`;
            if (englishTitle && englishTitle !== title) {
              titleDisplay += ` (${englishTitle})`;
            }
            
            description += `${titleDisplay}\n`;
            
            if (year !== 'N/A') {
              description += `📅 ${year}\n`;
            }
            
            description += '\n';
          }

          embed.setDescription(description);
          
          // Create pagination buttons
          const paginationButtons = [];
          if (nextPage > 1) {
            paginationButtons.push(
              new ButtonBuilder()
                .setCustomId(`newmovies_prev_${nextPage}_${userId}`)
                .setLabel('⬅️ Trang trước')
                .setStyle(2)
            );
          }
          
          paginationButtons.push(
            new ButtonBuilder()
              .setCustomId(`newmovies_page_${nextPage}_${userId}`)
              .setLabel(`📄 Trang ${nextPage}`)
              .setStyle(2)
              .setDisabled(true)
          );
          
          paginationButtons.push(
            new ButtonBuilder()
              .setCustomId(`newmovies_next_${nextPage}_${userId}`)
              .setLabel('Trang sau ➡️')
              .setStyle(2)
          );

          const buttonRows = [];

          if (paginationButtons.length > 0) {
            buttonRows.push(new ActionRowBuilder().addComponents(paginationButtons));
          }

          await interaction.editReply({
            embeds: [embed],
            components: buttonRows.length > 0 ? buttonRows : []
          });
          
          const newmoviesCacheId = ++cacheIdCounter;
          searchCache.set(`newmovies_${userId}_${nextPage}`, {
            embed,
            components: buttonRows,
            movies,
            searchQuery: 'newmovies',
            type: 'newmovies',
            cacheId: newmoviesCacheId,
            timestamp: Date.now(),
            page: nextPage
          });
        } catch (err) {
          console.error('Error newmovies next:', err);
        }
        return;
      }

      // Search pagination - Previous page
      if (customId.startsWith('search_prev_')) {
        const parts = customId.split('_');
        const currentPage = parseInt(parts[2]);
        const nextPage = currentPage - 1;
        const searchQuery = parts.slice(4).join('_');
        
        console.log(`⬅️ [SEARCH PREV] User: ${userId}, Query: ${searchQuery}, Page: ${currentPage} -> ${nextPage}`);
        
        try {
          await interaction.deferUpdate();
        } catch (e) {
          console.log('⚠️ Interaction already acknowledged, skipping deferUpdate');
        }
        
        try {
          const results = await searchMovies(searchQuery);
          
          if (!results || results.length === 0) {
            console.log(`❌ No results for query: ${searchQuery}`);
            return;
          }

          const itemsPerPage = 10;
          const totalResults = results.length;
          const totalPages = Math.ceil(totalResults / itemsPerPage);
          
          if (nextPage < 1) {
            console.log(`❌ Invalid page ${nextPage}`);
            return;
          }
          
          const startIdx = (nextPage - 1) * itemsPerPage;
          const endIdx = startIdx + itemsPerPage;
          const movies = results.slice(startIdx, endIdx);
          
          console.log(`📊 [SEARCH PREV DATA] Page: ${nextPage}/${totalPages}, Movies: ${movies.length}, Query: ${searchQuery}`);
          
          const embed = new EmbedBuilder()
            .setColor('#e50914')
            .setTitle(`🎬 Kết quả tìm kiếm: "${searchQuery}" - Trang ${nextPage}/${totalPages}`)
            .setDescription(`Tìm thấy **${totalResults}** phim | Hiển thị **${movies.length}** phim`)
            .setTimestamp();
          
          let description = '';
          for (let idx = 0; idx < movies.length; idx++) {
            const movie = movies[idx];
            const slug = movie.slug || '';
            const title = movie.name || movie.title || 'Unknown';
            const englishTitle = movie.original_name || '';
            const year = movie.year || 'N/A';
            
            let totalEpisodes = 'N/A';
            let category = 'N/A';
            try {
              if (slug) {
                const detail = await getMovieDetail(slug);
                if (detail) {
                  if (detail.total_episodes) {
                    totalEpisodes = detail.total_episodes.toString();
                  }
                  if (detail.category && detail.category[1]) {
                    const categoryList = detail.category[1].list;
                    if (categoryList && categoryList.length > 0) {
                      category = categoryList[0].name;
                    }
                  }
                }
              }
            } catch (e) {
              console.log(`⚠️ Could not fetch detail for ${slug}`);
            }
            
            const movieNum = startIdx + idx + 1;
            let titleDisplay = `**${movieNum}. ${title}**`;
            if (englishTitle && englishTitle !== title) {
              titleDisplay += ` (${englishTitle})`;
            }
            
            description += `${titleDisplay}\n`;
            
            let infoLine = '';
            if (year !== 'N/A') {
              infoLine += `📅 ${year}`;
            }
            if (category !== 'N/A') {
              infoLine += infoLine ? ` | 📺 ${category}` : `📺 ${category}`;
            }
            if (totalEpisodes !== 'N/A') {
              infoLine += infoLine ? ` | 🎬 ${totalEpisodes} tập` : `🎬 ${totalEpisodes} tập`;
            }
            
            if (infoLine) {
              description += infoLine + '\n';
            }
            
            description += '\n';
          }
          
          embed.setDescription(description);
          
          // Create cache FIRST before creating buttons
          const cacheKey = `search_${userId}_${nextPage}_${searchQuery}`;
          const cacheId = ++cacheIdCounter;
          
          console.log(`💾 [CACHE SAVE] Key: ${cacheKey}, CacheID: ${cacheId}, Query: ${searchQuery}, Page: ${nextPage}`);
          
          // Create buttons WITH cacheId
          const buttons = [];
          for (let i = 1; i <= Math.min(10, movies.length); i++) {
            const movieTitle = movies[i - 1].name.substring(0, 15);
            buttons.push(
              new ButtonBuilder()
                .setCustomId(`search_detail_${i}_${userId}_${nextPage}_${cacheId}`)
                .setLabel(`${i}. ${movieTitle}`)
                .setStyle(1)
            );
          }

          const paginationButtons = [];
          if (nextPage > 1) {
            paginationButtons.push(
              new ButtonBuilder()
                .setCustomId(`search_prev_${nextPage}_${userId}_${searchQuery}`)
                .setLabel('⬅️ Trang trước')
                .setStyle(2)
            );
          }
          
          paginationButtons.push(
            new ButtonBuilder()
              .setCustomId(`search_page_${nextPage}_${userId}`)
              .setLabel(`📄 Trang ${nextPage}/${totalPages}`)
              .setStyle(2)
              .setDisabled(true)
          );
          
          if (nextPage < totalPages) {
            paginationButtons.push(
              new ButtonBuilder()
                .setCustomId(`search_next_${nextPage}_${userId}_${searchQuery}`)
                .setLabel('Trang sau ➡️')
                .setStyle(2)
            );
          }

          const buttonRows = [];

          // Add detail buttons first
          for (let row = 0; row < Math.ceil(buttons.length / 2); row++) {
            const rowButtons = buttons.slice(row * 2, (row + 1) * 2);
            if (rowButtons.length > 0) {
              buttonRows.push(new ActionRowBuilder().addComponents(rowButtons));
            }
          }

          // Add pagination buttons at the bottom
          if (paginationButtons.length > 0) {
            buttonRows.push(new ActionRowBuilder().addComponents(paginationButtons));
          }

          // Discord limit: max 5 ActionRows per message
          if (buttonRows.length > 5) {
            console.warn(`⚠️ [SEARCH PREV] Too many rows: ${buttonRows.length}, truncating to 5`);
            buttonRows = buttonRows.slice(0, 5);
          }

          // Validate all components before sending
          for (let i = 0; i < buttonRows.length; i++) {
            const row = buttonRows[i];
            if (!row || !row.components) {
              console.error(`❌ [SEARCH PREV] Invalid component at row ${i}`);
              buttonRows.splice(i, 1);
              i--;
            }
          }

          await interaction.editReply({
            embeds: [embed],
            components: buttonRows.length > 0 ? buttonRows : []
          });
          
          const cacheData = {
            embed,
            components: buttonRows,
            movies,
            allResults: results,
            searchQuery,
            type: 'search',
            cacheId,
            page: nextPage,
            totalPages,
            timestamp: Date.now()
          };
          searchCache.set(cacheKey, cacheData);
          cacheIdIndex.set(cacheId, cacheData);
          
          console.log(`✅ [SEARCH PREV CACHE] Page: ${nextPage}/${totalPages}, CacheID: ${cacheId}, Movies: ${movies.length}`);
        } catch (err) {
          console.error('Error search prev:', err);
        }
        return;
      }

      // Search pagination - Next page
      if (customId.startsWith('search_next_')) {
        const parts = customId.split('_');
        const currentPage = parseInt(parts[2]);
        const nextPage = currentPage + 1;
        const searchQuery = parts.slice(4).join('_');
        
        console.log(`➡️ [SEARCH NEXT] User: ${userId}, Query: ${searchQuery}, Page: ${currentPage} -> ${nextPage}`);
        
        try {
          await interaction.deferUpdate();
        } catch (e) {
          console.log('⚠️ Interaction already acknowledged, skipping deferUpdate');
        }
        
        try {
          const results = await searchMovies(searchQuery);
          
          if (!results || results.length === 0) {
            console.log(`❌ No results for query: ${searchQuery}`);
            return;
          }

          const itemsPerPage = 10;
          const totalResults = results.length;
          const totalPages = Math.ceil(totalResults / itemsPerPage);
          
          if (nextPage > totalPages) {
            console.log(`❌ Invalid page ${nextPage}, totalPages: ${totalPages}`);
            return;
          }
          
          const startIdx = (nextPage - 1) * itemsPerPage;
          const endIdx = startIdx + itemsPerPage;
          const movies = results.slice(startIdx, endIdx);
          
          console.log(`📊 [SEARCH NEXT DATA] Page: ${nextPage}/${totalPages}, Movies: ${movies.length}, Query: ${searchQuery}`);
          
          const embed = new EmbedBuilder()
            .setColor('#e50914')
            .setTitle(`🎬 Kết quả tìm kiếm: "${searchQuery}" - Trang ${nextPage}/${totalPages}`)
            .setDescription(`Tìm thấy **${totalResults}** phim | Hiển thị **${movies.length}** phim`)
            .setTimestamp();
          
          let description = '';
          for (let idx = 0; idx < movies.length; idx++) {
            const movie = movies[idx];
            const slug = movie.slug || '';
            const title = movie.name || movie.title || 'Unknown';
            const englishTitle = movie.original_name || '';
            const year = movie.year || 'N/A';
            
            let totalEpisodes = 'N/A';
            let category = 'N/A';
            try {
              if (slug) {
                const detail = await getMovieDetail(slug);
                if (detail) {
                  if (detail.total_episodes) {
                    totalEpisodes = detail.total_episodes.toString();
                  }
                  if (detail.category && detail.category[1]) {
                    const categoryList = detail.category[1].list;
                    if (categoryList && categoryList.length > 0) {
                      category = categoryList[0].name;
                    }
                  }
                }
              }
            } catch (e) {
              console.log(`⚠️ Could not fetch detail for ${slug}`);
            }
            
            const movieNum = startIdx + idx + 1;
            let titleDisplay = `**${movieNum}. ${title}**`;
            if (englishTitle && englishTitle !== title) {
              titleDisplay += ` (${englishTitle})`;
            }
            
            description += `${titleDisplay}\n`;
            
            let infoLine = '';
            if (year !== 'N/A') {
              infoLine += `📅 ${year}`;
            }
            if (category !== 'N/A') {
              infoLine += infoLine ? ` | 📺 ${category}` : `📺 ${category}`;
            }
            if (totalEpisodes !== 'N/A') {
              infoLine += infoLine ? ` | 🎬 ${totalEpisodes} tập` : `🎬 ${totalEpisodes} tập`;
            }
            
            if (infoLine) {
              description += infoLine + '\n';
            }
            
            description += '\n';
          }
          
          embed.setDescription(description);
          
          // Create cache FIRST before creating buttons
          const cacheKey = `search_${userId}_${nextPage}_${searchQuery}`;
          const cacheId = ++cacheIdCounter;
          
          console.log(`💾 [CACHE SAVE] Key: ${cacheKey}, CacheID: ${cacheId}, Query: ${searchQuery}, Page: ${nextPage}`);
          
          // Create buttons WITH cacheId
          const buttons = [];
          for (let i = 1; i <= Math.min(10, movies.length); i++) {
            const movieTitle = movies[i - 1].name.substring(0, 15);
            buttons.push(
              new ButtonBuilder()
                .setCustomId(`search_detail_${i}_${userId}_${nextPage}_${cacheId}`)
                .setLabel(`${i}. ${movieTitle}`)
                .setStyle(1)
            );
          }

          const paginationButtons = [];
          if (nextPage > 1) {
            paginationButtons.push(
              new ButtonBuilder()
                .setCustomId(`search_prev_${nextPage}_${userId}_${searchQuery}`)
                .setLabel('⬅️ Trang trước')
                .setStyle(2)
            );
          }
          
          paginationButtons.push(
            new ButtonBuilder()
              .setCustomId(`search_page_${nextPage}_${userId}`)
              .setLabel(`📄 Trang ${nextPage}/${totalPages}`)
              .setStyle(2)
              .setDisabled(true)
          );
          
          if (nextPage < totalPages) {
            paginationButtons.push(
              new ButtonBuilder()
                .setCustomId(`search_next_${nextPage}_${userId}_${searchQuery}`)
                .setLabel('Trang sau ➡️')
                .setStyle(2)
            );
          }

          let buttonRows = [];

          // Add detail buttons first
          for (let row = 0; row < Math.ceil(buttons.length / 2); row++) {
            const rowButtons = buttons.slice(row * 2, (row + 1) * 2);
            if (rowButtons.length > 0) {
              buttonRows.push(new ActionRowBuilder().addComponents(rowButtons));
            }
          }

          // Add pagination buttons at the bottom
          if (paginationButtons.length > 0) {
            buttonRows.push(new ActionRowBuilder().addComponents(paginationButtons));
          }

          // Discord limit: max 5 ActionRows per message
          if (buttonRows.length > 5) {
            console.warn(`⚠️ [COMPONENTS LIMIT] Too many rows: ${buttonRows.length}, truncating to 5`);
            buttonRows = buttonRows.slice(0, 5);
          }

          // Validate all components before sending
          for (let i = 0; i < buttonRows.length; i++) {
            const row = buttonRows[i];
            if (!row || !row.components) {
              console.error(`❌ [INVALID COMPONENT] Row ${i} is invalid:`, row);
              buttonRows.splice(i, 1);
              i--;
            }
          }

          await interaction.editReply({
            embeds: [embed],
            components: buttonRows.length > 0 ? buttonRows : []
          });
          
          searchCache.set(cacheKey, {
            embed,
            components: buttonRows,
            movies,
            allResults: results,
            searchQuery,
            type: 'search',
            cacheId,
            page: nextPage,
            totalPages,
            timestamp: Date.now()
          });
          
          console.log(`✅ [SEARCH NEXT CACHE] Page: ${nextPage}/${totalPages}, CacheID: ${cacheId}, Movies: ${movies.length}`);
        } catch (err) {
          console.error('Error search next:', err);
        }
        return;
      }
    } catch (error) {
      console.error('❌ Lỗi xử lý button:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Có lỗi xảy ra', flags: 64 }).catch(() => {});
      }
    }
  }
});


// Auto-update livescore function - DISABLED to prevent API quota issues
// Users can manually use /live, /fixtures, /livescore commands instead


client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  const content = message.content.trim();
  const lower = content.toLowerCase();
  let replied = false;
  
  // Phát hiện từ chửi - bot trả lời bằng lời khôn ngoan/hóm hỉnh
  // Không dùng \b vì nó không làm việc với tiếng Việt
  try {
    const swearList = Array.isArray(config.swearWords) ? config.swearWords : [];
    
    if (swearList.length > 0) {
      // Kiểm tra xem có từ chửi nào trong tin nhắn không (case-insensitive)
      const hasSwear = swearList.some(word => lower.includes(word.toLowerCase()));
      
      if (hasSwear) {
        const replies = Array.isArray(config.smartReplies) ? config.smartReplies : [];
        const smartReply = replies.length > 0 
          ? replies[Math.floor(Math.random() * replies.length)]
          : "Chị em yêu nhau mà, đừng nên như vậy";
        
        console.log(`💬 Phát hiện từ chửi, gửi reply: ${smartReply}`);
        message.reply(smartReply);
        replied = true;
        return;
      }
    }
  } catch (e) {
    console.error('❌ Lỗi kiểm tra từ chửi:', e);
  }
  
  // Xử lý lệnh PREFIX
  if (content.startsWith(PREFIX)) {
    const afterPrefix = content.slice(PREFIX.length).trim();
    const args = afterPrefix.split(/\s+/);
    const command = args[0].toLowerCase();
    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator) || message.author.id === message.guild?.ownerId;

    if (command === 'ping') {
      message.reply('Pong! 🏓');
      console.log(`✅ Replied to ping command`);
      replied = true;
      return;
    }

    if (command === 'hello') {
      message.reply(`Hello ${message.author.username} 😎`);
      replied = true;
      return;
    }

    if (command === 'help') {
      message.reply(
        [
          '📌 Các lệnh hiện có:',
          `\`${PREFIX}ping\` - kiểm tra bot sống hay không`,
          `\`${PREFIX}hello\` - bot chào bạn`,
          `\`${PREFIX}echo <nội dung>\` - bot lặp lại câu bạn nói`,
          '',
          '⚽ Livescore & Fixtures:',
          `\`${PREFIX}live [league_id]\` - xem trận đang diễn ra`,
          `\`${PREFIX}standings [league_code]\` - bảng xếp hạng`,
          `\`${PREFIX}fixtures <team_id>\` - lịch thi đấu sắp tới`,
          `\`${PREFIX}lineup <match_id>\` - xem line-up trước trận (khi công bố)`,
          `\`${PREFIX}findteam <name>\` - tìm Team ID`,
          '',
          '📍 Team Tracking (Auto-Reminder):',
          `\`${PREFIX}teams\` - hiển thị danh sách team có sẵn`,
          `\`${PREFIX}track\` - chọn team để theo dõi (UI dropdown)`,
          `\`${PREFIX}untrack <team_id>\` - hủy theo dõi team`,
          `\`${PREFIX}mytracks\` - xem danh sách team đang theo dõi`,
          `\`${PREFIX}dashboard\` - xem dashboard với lịch thi đấu`,
          '💡 **Auto-Reminder**: Bot sẽ nhắc 1h trước mỗi trận của team bạn track',
          '',
          '🎬 Movie Search:',
          `\`${PREFIX}search <tên phim>\` - tìm phim (gõ \`!search help\` để xem chi tiết)`,
          `\`${PREFIX}newmovies [trang]\` - phim mới cập nhật (trang 1 nếu không chỉ định)`
        ].join('\n')
      );
      replied = true;
      return;
    }

    if (command === 'teams') {
      // Show interactive UI with team selection buttons
      const premierLeagueTeams = config.livescoreTeams.slice(0, 10); // Show first 10 teams
      
      let teamsText = '⚽ **Chọn đội bóng để theo dõi:**\n\n';
      premierLeagueTeams.forEach((team, idx) => {
        const tracked = config.trackedTeams.includes(team.id) ? '✅' : '  ';
        teamsText += `${tracked} ${idx + 1}. **${team.name}** (ID: ${team.id})\n`;
      });
      
      teamsText += `\n💡 Dùng \`${PREFIX}track <team_id>\` để theo dõi\n`;
      teamsText += `💡 Dùng \`${PREFIX}untrack <team_id>\` để hủy theo dõi\n`;
      teamsText += `💡 Dùng \`${PREFIX}mytracks\` để xem danh sách theo dõi`;
      
      message.reply(teamsText);
      replied = true;
      return;
    }

    if (command === 'echo') {
      if (args.length === 1) {
        message.reply(`Ví dụ: \`${PREFIX}echo xin chào\``);
        replied = true;
        return;
      }
      message.reply(args.slice(1).join(' '));
      replied = true;
      return;
    }

    // Track team command
    if (command === 'track') {
      // Show team selection UI
      const teams = config.livescoreTeams;
      const userId = message.author.id;
      const userTrackedTeams = getUserTrackedTeams(userId);
      
      // Create select menu options
      const options = teams.map(team => ({
        label: team.name,
        value: team.id.toString(),
        description: `ID: ${team.id}${userTrackedTeams.includes(team.id) ? ' ✅ (bạn theo dõi)' : ''}`
      }));
      
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('track_team_select')
        .setPlaceholder('Chọn đội bóng để theo dõi')
        .addOptions(options);
      
      const row = new ActionRowBuilder()
        .addComponents(selectMenu);
      
      const response = await message.reply({
        content: '⚽ **Chọn đội bóng muốn theo dõi:**',
        components: [row]
      });
      
      // Set timeout for interaction (15 minutes)
      const collector = response.createMessageComponentCollector({ time: 15 * 60 * 1000 });
      
      const updateMenu = async () => {
        // Rebuild menu with latest tracked status
        const freshUserTeams = getUserTrackedTeams(userId);
        const updatedOptions = config.livescoreTeams.map(team => ({
          label: team.name,
          value: team.id.toString(),
          description: `ID: ${team.id}${freshUserTeams.includes(team.id) ? ' ✅ (bạn theo dõi)' : ''}`
        }));
        
        const updatedMenu = new StringSelectMenuBuilder()
          .setCustomId('track_team_select')
          .setPlaceholder('Chọn đội bóng để theo dõi')
          .addOptions(updatedOptions);
        
        const updatedRow = new ActionRowBuilder()
          .addComponents(updatedMenu);
        
        await response.edit({ components: [updatedRow] }).catch(() => {});
      };
      
      collector.on('collect', async (interaction) => {
        // Check if it's the same user
        if (interaction.user.id !== message.author.id) {
          await interaction.reply({ content: '❌ Bạn không có quyền sử dụng UI này!', flags: 64 });
          return;
        }
        
        const teamId = parseInt(interaction.values[0]);
        const team = config.livescoreTeams.find(t => t.id === teamId);
        
        // Helper to disable menu and stop collector
        const disableMenuAndStop = async () => {
          const disabledRow = new ActionRowBuilder()
            .addComponents(selectMenu.setDisabled(true));
          await response.edit({ components: [disabledRow] }).catch(() => {});
          collector.stop();
        };
        
        if (!team) {
          await interaction.reply({ content: '❌ Team không tồn tại!', flags: 64 });
          await disableMenuAndStop();
          return;
        }
        
        // Check if already tracked
        const currentUserTeams = getUserTrackedTeams(interaction.user.id);
        if (currentUserTeams.includes(teamId)) {
          await interaction.reply({ content: `⚠️ **${team.name}** đã được bạn theo dõi rồi!`, flags: 64 });
          await disableMenuAndStop();
          return;
        }
        
        // Check limit (max 2 teams per user to reduce API calls)
        const MAX_TRACKED_TEAMS = 2;
        if (currentUserTeams.length >= MAX_TRACKED_TEAMS) {
          await interaction.reply({ content: `⚠️ Bạn chỉ có thể theo dõi tối đa ${MAX_TRACKED_TEAMS} đội bóng. Vui lòng bỏ theo dõi một đội khác trước!`, flags: 64 });
          await disableMenuAndStop();
          return;
        }
        
        // Add to user's tracked teams
        addUserTrackedTeam(interaction.user.id, teamId);
        saveConfig(config);
        
        // Send public notification with auto-delete
        try {
          const publicMsg = await interaction.channel.send(`✅ **${interaction.user.username}** đang theo dõi **${team.name}**`);
          setTimeout(() => {
            publicMsg.delete().catch(() => {});
          }, 5000);
        } catch (e) {
          console.error('Error sending public track message:', e.message);
        }
        
        // Reply to interaction (required by Discord, flags: 64 makes it ephemeral/hidden)
        await interaction.reply({ content: '✅', flags: 64 }).catch(() => {});
        
        // Disable menu after selection
        const disabledRow = new ActionRowBuilder()
          .addComponents(selectMenu.setDisabled(true));
        await response.edit({ components: [disabledRow] }).catch(() => {});
        
        // Stop collector after first selection
        collector.stop();
      });
      
      collector.on('end', () => {
        // Disable menu on timeout
        const disabledRow = new ActionRowBuilder()
          .addComponents(selectMenu.setDisabled(true));
        response.edit({ components: [disabledRow] }).catch(() => {});
      });
      
      replied = true;
      return;
    }

    // Untrack team command (UI based)
    if (command === 'untrack') {
      const userId = message.author.id;
      const userTrackedTeams = getUserTrackedTeams(userId);
      
      if (userTrackedTeams.length === 0) {
        message.reply('❌ Bạn chưa theo dõi team nào để bỏ theo dõi. Dùng `!track` để thêm team.');
        return;
      }
      
      // Create select menu with only tracked teams
      const trackedTeamsList = config.livescoreTeams.filter(t => userTrackedTeams.includes(t.id));
      const options = trackedTeamsList.map(team => ({
        label: team.name,
        value: team.id.toString(),
        description: `ID: ${team.id}`
      }));
      
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('untrack_team_select')
        .setPlaceholder('Chọn đội bóng để bỏ theo dõi')
        .addOptions(options);
      
      const row = new ActionRowBuilder()
        .addComponents(selectMenu);
      
      const response = await message.reply({
        content: '⚽ **Chọn đội bóng muốn bỏ theo dõi:**',
        components: [row]
      });
      
      // Set timeout for interaction (15 minutes)
      const collector = response.createMessageComponentCollector({ time: 15 * 60 * 1000 });
      
      const updateUntrackMenu = async () => {
        // Rebuild menu with latest tracked status
        const freshUserTeams = getUserTrackedTeams(userId);
        const freshTrackedTeams = config.livescoreTeams.filter(t => freshUserTeams.includes(t.id));
        
        if (freshTrackedTeams.length === 0) {
          // No more teams, disable menu
          const disabledRow = new ActionRowBuilder()
            .addComponents(selectMenu.setDisabled(true));
          await response.edit({ 
            content: '✅ Bạn không còn theo dõi team nào!',
            components: [disabledRow] 
          }).catch(() => {});
          collector.stop();
          return;
        }
        
        const updatedOptions = freshTrackedTeams.map(team => ({
          label: team.name,
          value: team.id.toString(),
          description: `ID: ${team.id}`
        }));
        
        const updatedMenu = new StringSelectMenuBuilder()
          .setCustomId('untrack_team_select')
          .setPlaceholder('Chọn đội bóng để bỏ theo dõi')
          .addOptions(updatedOptions);
        
        const updatedRow = new ActionRowBuilder()
          .addComponents(updatedMenu);
        
        await response.edit({ components: [updatedRow] }).catch(() => {});
      };
      
      collector.on('collect', async (interaction) => {
        // Check if it's the same user
        if (interaction.user.id !== message.author.id) {
          await interaction.reply({ content: '❌ Bạn không có quyền sử dụng UI này!', flags: 64 });
          return;
        }
        
        const teamId = parseInt(interaction.values[0]);
        const team = config.livescoreTeams.find(t => t.id === teamId);
        
        // Helper to disable menu and stop collector
        const disableMenuAndStop = async () => {
          const disabledRow = new ActionRowBuilder()
            .addComponents(selectMenu.setDisabled(true));
          await response.edit({ components: [disabledRow] }).catch(() => {});
          collector.stop();
        };
        
        if (!team) {
          await interaction.reply({ content: '❌ Team không tồn tại!', flags: 64 });
          await disableMenuAndStop();
          return;
        }
        
        // Check if user tracks this team
        const currentUserTeams = getUserTrackedTeams(interaction.user.id);
        if (!currentUserTeams.includes(teamId)) {
          await interaction.reply({ content: `⚠️ Bạn không theo dõi **${team.name}**!`, flags: 64 });
          return;
        }
        
        // Remove from user's tracked teams
        removeUserTrackedTeam(interaction.user.id, teamId);
        saveConfig(config);
        
        // Send public notification with auto-delete
        try {
          const publicMsg = await interaction.channel.send(`❌ **${interaction.user.username}** đã hủy theo dõi **${team.name}**`);
          setTimeout(() => {
            publicMsg.delete().catch(() => {});
          }, 5000);
        } catch (e) {
          console.error('Error sending public untrack message:', e.message);
        }
        
        // Reply to interaction (required by Discord, flags: 64 makes it ephemeral/hidden)
        await interaction.reply({ content: '✅', flags: 64 }).catch(() => {});
        
        // Disable menu after selection
        const disabledRow = new ActionRowBuilder()
          .addComponents(selectMenu.setDisabled(true));
        await response.edit({ components: [disabledRow] }).catch(() => {});
        
        // Stop collector after first selection
        collector.stop();
      });
      
      collector.on('end', () => {
        // Disable menu on timeout
        const disabledRow = new ActionRowBuilder()
          .addComponents(selectMenu.setDisabled(true));
        response.edit({ components: [disabledRow] }).catch(() => {});
      });
      
      return;
    }

    // Show tracked teams command
    if (command === 'mytracks') {
      const userId = message.author.id;
      const userTrackedTeams = getUserTrackedTeams(userId);
      
      if (userTrackedTeams.length === 0) {
        message.reply('📋 Bạn chưa theo dõi team nào. Dùng `!track` để thêm team.');
        return;
      }

      const trackedTeamNames = userTrackedTeams
        .map(id => {
          const team = config.livescoreTeams.find(t => t.id === id);
          return team ? team.name : `ID: ${id}`;
        })
        .join('\n');
      
      message.reply(`📋 **Danh sách team bạn theo dõi:**\n${trackedTeamNames}\n\nDùng \`!untrack <team_id>\` để xóa.`);
      return;
    }

    // Dashboard command - Show tracked teams with fixtures
    if (command === 'dashboard' || command === 'tracklist') {
      const userId = message.author.id;
      const now = Date.now();
      
      // Check cooldown - 60 seconds per user
      if (dashboardCooldown.has(userId)) {
        const cooldownExpires = dashboardCooldown.get(userId);
        if (now < cooldownExpires) {
          const secondsLeft = Math.ceil((cooldownExpires - now) / 1000);
          message.reply(`⏳ Dashboard cooldown. Vui lòng chờ ${secondsLeft}s trước khi sử dụng lại.`);
          return;
        }
      }
      
      // Set cooldown for this user (60 seconds)
      dashboardCooldown.set(userId, now + DASHBOARD_COOLDOWN_MS);
      
      message.reply('⏳ Đang tải dashboard...');
      
      try {
        const pages = await createTrackedTeamsDashboard(userId);
        
        if (!pages || pages.length === 0) {
          message.reply('❌ Không có team nào được theo dõi.');
          return;
        }
        
        // If only 1 page, just send it without buttons
        if (pages.length === 1) {
          message.reply(pages[0]);
          return;
        }
        
        // Multi-page dashboard with navigation buttons
        let currentPage = 0;
        
        const createButtons = () => {
          return new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`dashboard_prev_${userId}`)
                .setLabel('⬅️ Trước')
                .setStyle(2) // Secondary style
                .setDisabled(currentPage === 0),
              new ButtonBuilder()
                .setCustomId(`dashboard_next_${userId}`)
                .setLabel('Sau ➡️')
                .setStyle(2)
                .setDisabled(currentPage === pages.length - 1)
            );
        };
        
        const response = await message.reply({
          ...pages[currentPage],
          components: [createButtons()]
        });
        
        // Create collector for button interactions
        const collector = response.createMessageComponentCollector({ 
          filter: (interaction) => interaction.user.id === userId,
          time: 5 * 60 * 1000 // 5 minutes timeout
        });
        
        collector.on('collect', async (interaction) => {
          if (interaction.customId === `dashboard_prev_${userId}`) {
            currentPage--;
          } else if (interaction.customId === `dashboard_next_${userId}`) {
            currentPage++;
          }
          
          await interaction.update({
            ...pages[currentPage],
            components: [createButtons()]
          }).catch(() => {});
        });
        
        collector.on('end', async () => {
          // Disable buttons when timeout
          const disabledRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`dashboard_prev_${userId}`)
                .setLabel('⬅️ Trước')
                .setStyle(2)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId(`dashboard_next_${userId}`)
                .setLabel('Sau ➡️')
                .setStyle(2)
                .setDisabled(true)
            );
          await response.edit({ components: [disabledRow] }).catch(() => {});
        });
      } catch (e) {
        console.error('❌ Lỗi tải dashboard:', e.message);
        message.reply('❌ Lỗi khi tải dashboard. Vui lòng thử lại.');
      }
      return;
    }

    // Livescore commands
    if (command === 'live') {
      const competitionId = args[0] || 'PL'; // PL = Premier League
      message.reply('⏳ Đang lấy trận đấu đang diễn ra...');
      
      const liveMatches = await getLiveMatches(competitionId);
      
      if (liveMatches.length === 0) {
        message.reply('❌ Không có trận đấu nào đang diễn ra!');
        replied = true;
        return;
      }
      
      let liveText = `🔴 **LIVE - Trận đấu đang diễn ra**\n`;
      liveText += `═══════════════════════════════════\n\n`;
      
      liveMatches.slice(0, 10).forEach((match, idx) => {
        const homeTeam = match.homeTeam.name;
        const awayTeam = match.awayTeam.name;
        const homeGoals = match.score?.fullTime?.home || 0;
        const awayGoals = match.score?.fullTime?.away || 0;
        const status = match.status;
        const minute = match.minute || '?';
        
        liveText += `${idx + 1}. **${homeTeam} ${homeGoals} - ${awayGoals} ${awayTeam}**\n`;
        liveText += `   ⏱️ ${minute}' | Status: ${status}\n`;
        liveText += `\n`;
      });
      
      liveText += `═══════════════════════════════════`;
      message.reply(liveText);
      replied = true;
      return;
    }

    if (command === 'livescore') {
      if (args.length === 1) {
        message.reply(`Cách dùng: \`${PREFIX}livescore <team_id>\``);
        replied = true;
        return;
      }
      
      message.reply('⏳ Đang lấy dữ liệu...');
      const teamId = args[1];
      const score = await getLiveScore(teamId);
      
      if (!score) {
        message.reply('❌ Không tìm thấy đội bóng hoặc trận đấu live!');
        replied = true;
        return;
      }
      
      const fixture = score;
      const homeTeam = fixture.homeTeam.name;
      const awayTeam = fixture.awayTeam.name;
      const homeGoals = fixture.score?.fullTime?.home || 0;
      const awayGoals = fixture.score?.fullTime?.away || 0;
      const status = fixture.status;
      const date = new Date(fixture.utcDate).toLocaleString('vi-VN');
      const competition = fixture.competition?.name || 'Unknown';
      
      let scoreText = `⚽ **KẾT QUẢ TRẬN ĐẤU**\n`;
      scoreText += `═══════════════════════════════════\n`;
      scoreText += `${homeTeam} **${homeGoals}** - **${awayGoals}** ${awayTeam}\n`;
      scoreText += `═══════════════════════════════════\n`;
      scoreText += `📊 Status: ${status}\n`;
      scoreText += `📅 Thời gian: ${date}\n`;
      scoreText += `🏆 Giải đấu: ${competition}`;
      
      message.reply(scoreText);
      replied = true;
      return;
    }

    if (command === 'findteam') {
      if (args.length === 1) {
        message.reply(`Cách dùng: \`${PREFIX}findteam <tên đội>\`\n\nVí dụ: \`${PREFIX}findteam chelsea\` hoặc \`${PREFIX}findteam man united\``);
        replied = true;
        return;
      }
      
      const teamName = args.slice(1).join(' ').toLowerCase();
      console.log('🔍 findteam search:', { args, teamName, argsLength: args.length });
      
      try {
        // Search in livescoreTeams from config
        const foundTeams = (config.livescoreTeams || []).filter(team => 
          team.name.toLowerCase().includes(teamName)
        );
        
        console.log('📋 Found teams:', foundTeams.length, foundTeams.map(t => t.name));
        
        if (foundTeams.length === 0) {
          message.reply(`❌ Không tìm thấy đội bóng: **${teamName}**\n\n💡 **Danh sách đội hỗ trợ (Premier League):**\n${(config.livescoreTeams || []).slice(0, 10).map((t, i) => `${i + 1}. ${t.name}`).join('\n')}`);
          replied = true;
          return;
        }
        
        let resultText = `🔍 **Kết quả tìm kiếm: "${teamName}"**\n`;
        resultText += `═══════════════════════════════════\n\n`;
        
        foundTeams.forEach((team, idx) => {
          resultText += `${idx + 1}. **${team.name}**\n`;
          resultText += `   📍 ID: **${team.id}**\n`;
          resultText += `   ⚽ \`${PREFIX}fixtures ${team.id}\` - xem lịch thi đấu\n`;
          resultText += `   ❤️ \`${PREFIX}track ${team.id}\` - theo dõi đội\n\n`;
        });
        
        resultText += `═══════════════════════════════════\n`;
        resultText += `💡 **Copy Team ID rồi dùng các lệnh ở trên**`;
        
        message.reply(resultText);
      } catch (e) {
        console.error('❌ Lỗi tìm kiếm đội bóng:', e.message);
        message.reply('❌ Có lỗi xảy ra khi tìm kiếm. Vui lòng thử lại!');
      }
      replied = true;
      return;
    }

    if (command === 'standings') {
      // Danh sách competitions hỗ trợ
      const supportedComps = {
        'PL': 'Premier League',
        'EL1': 'La Liga',
        'SA': 'Serie A',
        'BL1': 'Bundesliga',
        'FL1': 'Ligue 1',
        'PD': 'Primeira Liga',
        'EC': 'Champions League'
      };
      
      if (args.length === 1) {
        let compList = `📊 **DANH SÁCH GIẢI ĐẤU**\n`;
        compList += `═══════════════════════════════════\n\n`;
        
        Object.entries(supportedComps).forEach(([code, name]) => {
          compList += `• **${code}** - ${name}\n`;
        });
        
        compList += `\n═══════════════════════════════════\n`;
        compList += `💡 Dùng: \`${PREFIX}standings <competition_code>\` để xem bảng xếp`;
        
        message.reply(compList);
        replied = true;
        return;
      }
      
      const compCode = args[1].toUpperCase();
      if (!supportedComps[compCode]) {
        message.reply(`❌ Không tìm thấy giải đấu! Dùng \`${PREFIX}standings\` để xem danh sách.`);
        replied = true;
        return;
      }
      
      message.reply('⏳ Đang lấy bảng xếp hạng...');
      
      const standings = await getStandings(compCode);
      
      if (!standings) {
        message.reply('❌ Không tìm thấy bảng xếp hạng!');
        replied = true;
        return;
      }
      
      const table = standings.standings[0].table;
      let standingsText = `📊 **${standings.competition.name} - Season ${standings.season.currentSeason}**\n`;
      standingsText += `═══════════════════════════════════\n\n`;
      
      table.slice(0, 10).forEach((team, idx) => {
        const rank = team.position;
        const name = team.team.name;
        const points = team.points;
        const played = team.playedGames;
        const wins = team.won;
        const draws = team.draw;
        const losses = team.lost;
        const gf = team.goalsFor;
        const ga = team.goalsAgainst;
        const gd = gf - ga;
        
        standingsText += `${rank.toString().padStart(2, '0')}. ${name.padEnd(20, ' ')} | ${points.toString().padStart(2, ' ')}pts\n`;
        standingsText += `    📈 ${played}P ${wins}W ${draws}D ${losses}L | ${gf}:${ga} (${gd > 0 ? '+' : ''}${gd})\n`;
        standingsText += `\n`;
      });
      
      standingsText += `═══════════════════════════════════`;
      message.reply(standingsText);
      replied = true;
      return;
    }

    // Get lineup for a match (before match)
    if (command === 'lineup') {
      if (args.length === 1) {
        message.reply(`Cách dùng: \`${PREFIX}lineup <match_id>\`\n\nMatch ID có thể lấy từ lịch thi đấu hoặc từ live matches`);
        replied = true;
        return;
      }

      const matchId = args[1];
      message.reply('⏳ Đang lấy line-up...');

      try {
        const matchData = await getMatchLineup(matchId);
        
        if (!matchData) {
          await message.reply('❌ Không tìm thấy thông tin trận đấu!');
          replied = true;
          return;
        }

        const homeTeam = matchData.homeTeam;
        const awayTeam = matchData.awayTeam;
        const utcDate = new Date(matchData.utcDate);
        const dateStr = utcDate.toLocaleString('vi-VN', {
          weekday: 'long',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });

        // Create embeds for lineup
        const embeds = [];
        
        const headerEmbed = new EmbedBuilder()
          .setColor('#3b82f6')
          .setTitle(`📋 Line-up: ${homeTeam.name} vs ${awayTeam.name}`)
          .setDescription(`🏆 ${matchData.competition?.name || 'Unknown'}\n📅 ${dateStr}\n📊 Status: ${matchData.status}`)
          .setTimestamp();

        embeds.push(headerEmbed);

        // Check if lineup is available
        if (matchData.lineupNotAvailable) {
          const messageEmbed = new EmbedBuilder()
            .setColor('#f97316')
            .setDescription(matchData.message || 'Line-up chưa được công bố. Trạng thái: ' + matchData.status);
          
          embeds.push(messageEmbed);
          await message.reply({ embeds });
          replied = true;
          return;
        }

        // Home team lineup
        const homeLineup = matchData.homeTeamLineup || [];
        let homeText = `🏠 **${homeTeam.name}** (Formation: ${matchData.homeTeamFormation || 'N/A'})\n\n`;
        
        if (homeLineup.length > 0) {
          homeText += '**Starting XI:**\n';
          homeLineup.slice(0, 11).forEach((player, idx) => {
            if (player && player.position && player.position !== 'UNKNOWN') {
              homeText += `${idx + 1}. ${player.name} - ${player.position}\n`;
            }
          });
        } else {
          homeText += '_Line-up chưa được công bố_\n';
        }

        const homeEmbed = new EmbedBuilder()
          .setColor('#ef4444')
          .setDescription(homeText.slice(0, 2048))
          .setFooter({ text: `${homeTeam.name}` });

        embeds.push(homeEmbed);

        // Away team lineup
        const awayLineup = matchData.awayTeamLineup || [];
        let awayText = `✈️ **${awayTeam.name}** (Formation: ${matchData.awayTeamFormation || 'N/A'})\n\n`;
        
        if (awayLineup.length > 0) {
          awayText += '**Starting XI:**\n';
          awayLineup.slice(0, 11).forEach((player, idx) => {
            if (player && player.position && player.position !== 'UNKNOWN') {
              awayText += `${idx + 1}. ${player.name} - ${player.position}\n`;
            }
          });
        } else {
          awayText += '_Line-up chưa được công bố_\n';
        }

        const awayEmbed = new EmbedBuilder()
          .setColor('#3b82f6')
          .setDescription(awayText.slice(0, 2048))
          .setFooter({ text: `${awayTeam.name}` });

        embeds.push(awayEmbed);

        await message.reply({ embeds });
      } catch (e) {
        console.error('❌ Lỗi lấy line-up:', e.message);
        await message.reply('❌ Có lỗi xảy ra. Vui lòng thử lại!');
      }
      replied = true;
      return;
    }

    if (command === 'fixtures') {
      const userId = message.author.id;
      const now = Date.now();
      
      console.log('🎯 fixtures command:', { args, argsLength: args.length, arg1: args[1], check: args.length > 1 && !isNaN(parseInt(args[1])) });
      
      // Check cooldown - 30 seconds per user
      if (fixturesCooldown.has(userId)) {
        const cooldownExpires = fixturesCooldown.get(userId);
        if (now < cooldownExpires) {
          const secondsLeft = Math.ceil((cooldownExpires - now) / 1000);
          message.reply(`⏳ Fixtures cooldown. Vui lòng chờ ${secondsLeft}s trước khi sử dụng lại.`);
          replied = true;
          return;
        }
      }
      
      // Set cooldown for this user (30 seconds)
      fixturesCooldown.set(userId, now + FIXTURES_COOLDOWN_MS);
      
      // If team ID is provided as argument, show fixtures directly
      if (args.length > 1 && !isNaN(parseInt(args[1]))) {
        console.log('✅ Entering direct fixtures block with teamId:', args[1]);
        const teamId = parseInt(args[1]);
        
        try {
          const fixtures = await getFixturesWithCL(teamId, 10);
          
          if (fixtures.length === 0) {
            await message.reply(`❌ Không tìm thấy lịch thi đấu cho team ID: **${teamId}**`);
            replied = true;
            return;
          }
          
          // Get team name from API or config
          let teamName = `Team ${teamId}`;
          try {
            const teamData = await getTeamById(teamId);
            if (teamData) {
              teamName = teamData.name;
            }
          } catch (e) {
            console.log('⚠️ Could not fetch team name:', e.message);
          }
          
          // Create main embed with professional styling (Tailwind-inspired)
          const embeds = [];
          const headerEmbed = new EmbedBuilder()
            .setColor('#1e40af') // Tailwind blue-800
            .setTitle(`⚽ ${teamName}`)
            .setDescription(`**Lịch Thi Đấu Sắp Tới**\n${fixtures.length} trận`)
            .setTimestamp()
            .setFooter({ text: 'Football Bot | Updated' });
          
          embeds.push(headerEmbed);
          
          // Create individual embed for each fixture block
          let currentText = '';
          let matchCount = 0;
          
          fixtures.slice(0, 10).forEach((f, idx) => {
            const date = new Date(f.utcDate);
            const dateStr = date.toLocaleString('vi-VN', {
              weekday: 'short',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            });
            const opponent = f.homeTeam.id === teamId ? f.awayTeam.name : f.homeTeam.name;
            const isHome = f.homeTeam.id === teamId ? '🏠' : '✈️';
            const competition = f.inChampionsLeague ? '🏆 Champions League' : (f.competition?.name || 'Unknown');
            
            const matchStr = `\`${idx + 1}.\` ${isHome} **${opponent}**\n└─ 📅 ${dateStr} • ${competition}\n`;
            
            currentText += matchStr;
            matchCount++;
            
            // Create new embed every 5 matches to avoid character limit
            if (matchCount === 5 || idx === fixtures.length - 1) {
              const fixturesEmbed = new EmbedBuilder()
                .setColor('#059669') // Tailwind green-600
                .setDescription(currentText.trim())
                .setFooter({ text: `Trận ${matchCount === 5 ? (idx - 4) + '-' + (idx + 1) : (idx - matchCount + 2) + '-' + (idx + 1)} của ${fixtures.length}` });
              
              embeds.push(fixturesEmbed);
              currentText = '';
              matchCount = 0;
            }
          });
          
          await message.reply({ embeds });
          replied = true;
          return;
        } catch (e) {
          console.error('❌ Lỗi lấy lịch thi đấu:', e.message);
          await message.reply('❌ Có lỗi xảy ra khi lấy lịch thi đấu. Vui lòng thử lại!');
          replied = true;
          return;
        }
      }
      
      const userTrackedTeams = getUserTrackedTeams(userId);
      
      if (userTrackedTeams.length === 0) {
        message.reply('❌ Bạn chưa theo dõi team nào.\n\n💡 Cách dùng:\n• `!track` - chọn team để theo dõi\n• `!fixtures <team_id>` - xem lịch của team nào đó\n• `!findteam <tên>` - tìm Team ID');
        replied = true;
        return;
      }
      
      // Create select menu with tracked teams only
      const trackedTeamsList = config.livescoreTeams.filter(t => userTrackedTeams.includes(t.id));
      const options = trackedTeamsList.map(team => ({
        label: team.name,
        value: team.id.toString(),
        description: `ID: ${team.id}`
      }));
      
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('fixtures_team_select')
        .setPlaceholder('Chọn đội bóng để xem lịch thi đấu')
        .addOptions(options);
      
      const row = new ActionRowBuilder()
        .addComponents(selectMenu);
      
      const response = await message.reply({
        content: '⚽ **Chọn đội bóng để xem lịch thi đấu:**',
        components: [row]
      });
      
      // Set timeout for interaction (15 minutes)
      const collector = response.createMessageComponentCollector({ time: 15 * 60 * 1000 });
      
      collector.on('collect', async (interaction) => {
        // Check if it's the same user
        if (interaction.user.id !== message.author.id) {
          await interaction.reply({ content: '❌ Bạn không có quyền sử dụng UI này!', flags: 64 });
          return;
        }
        
        const teamId = parseInt(interaction.values[0]);
        
        await interaction.deferReply();
        
        const fixtures = await getFixturesWithCL(teamId, 10);
        
        if (fixtures.length === 0) {
          await interaction.editReply('❌ Không tìm thấy lịch thi đấu!');
          return;
        }
        
        // Get team name
        const team = config.livescoreTeams.find(t => t.id === teamId);
        const teamName = team?.name || `Team ${teamId}`;
        
        // Create main embed with professional styling (Tailwind-inspired)
        const embeds = [];
        const headerEmbed = new EmbedBuilder()
          .setColor('#1e40af') // Tailwind blue-800
          .setTitle(`⚽ ${teamName}`)
          .setDescription(`**Lịch Thi Đấu Sắp Tới**\n${fixtures.length} trận`)
          .setTimestamp()
          .setFooter({ text: 'Football Bot | Updated' });
        
        embeds.push(headerEmbed);
        
        // Create individual embed for each fixture block
        let currentText = '';
        let matchCount = 0;
        
        fixtures.slice(0, 10).forEach((f, idx) => {
          const date = new Date(f.utcDate);
          const dateStr = date.toLocaleString('vi-VN', {
            weekday: 'short',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
          const opponent = f.homeTeam.id === teamId ? f.awayTeam.name : f.homeTeam.name;
          const isHome = f.homeTeam.id === teamId ? '🏠' : '✈️';
          const competition = f.inChampionsLeague ? '🏆 Champions League' : (f.competition?.name || 'Unknown');
          
          const matchStr = `\`${idx + 1}.\` ${isHome} **${opponent}**\n└─ 📅 ${dateStr} • ${competition}\n`;
          
          currentText += matchStr;
          matchCount++;
          
          // Create new embed every 5 matches to avoid character limit
          if (matchCount === 5 || idx === fixtures.length - 1) {
            const fixturesEmbed = new EmbedBuilder()
              .setColor('#059669') // Tailwind green-600
              .setDescription(currentText.trim())
              .setFooter({ text: `Trận ${matchCount === 5 ? (idx - 4) + '-' + (idx + 1) : (idx - matchCount + 2) + '-' + (idx + 1)} của ${fixtures.length}` });
            
            embeds.push(fixturesEmbed);
            currentText = '';
            matchCount = 0;
          }
        });
        
        await interaction.editReply({ embeds });
        
        // Disable menu after selection
        const disabledRow = new ActionRowBuilder()
          .addComponents(selectMenu.setDisabled(true));
        await response.edit({ components: [disabledRow] }).catch(() => {});
        
        // Stop collector after first selection
        collector.stop();
      });
      
      collector.on('end', () => {
        // Menu is already disabled above
      });
      
      replied = true;
      return;
    }

    // New movies command
    if (command === 'newmovies' || command === 'newphim') {
      console.log('🎬 New movies command triggered');
      
      // Check if asking for help first
      const firstArg = args.length > 0 ? args[0].toLowerCase() : '';
      if (firstArg === 'help') {
        const helpText = `
📌 **Hướng Dẫn Lệnh Phim **

**Cú pháp:**
\`!newmovies\` hoặc \`!newphim\`

**Ví dụ:**
• \`!newmovies\` - Hiển thị 10 phim mới nhất
• Click button để xem chi tiết phim
• Click server để xem danh sách tập

**Tính năng:**
✅ Hiển thị 10 phim mới nhất
✅ Hiển thị tên Việt + tên Anh + năm phát hành
✅ Click button để xem chi tiết (năm, chất lượng, ngôn ngữ, số tập)
✅ Chọn server để xem danh sách tập
✅ Phân trang tập (10 tập/trang)
✅ Nút quay lại để điều hướng

**Lệnh khác:**
• \`!search <tên phim>\` - Tìm phim theo từ khóa
• \`!help\` - Xem tất cả lệnh
`;
        message.reply(helpText);
        replied = true;
        return;
      }
      
      let currentPage = 1;
      
      // Parse page number if provided
      if (args.length > 0 && !isNaN(parseInt(args[0]))) {
        currentPage = parseInt(args[0]);
        if (currentPage < 1) currentPage = 1;
      }

      try {
        const newMovies = await getNewMovies(1);
        console.log(`✅ Found ${newMovies.length} new movies`);
        
        if (!newMovies || newMovies.length === 0) {
          await message.reply(`❌ Không tìm thấy phim mới`);
          replied = true;
          return;
        }

        // Limit to 10 results
        const movies = newMovies.slice(0, 10);
        
        const embed = new EmbedBuilder()
          .setColor('#e50914') // Netflix red
          .setTitle(`🎬 Phim Mới Cập Nhật`)
          .setDescription(`Hiển thị **${movies.length}** phim mới nhất`)
          .setTimestamp();

        // Build movie list
        let description = '';
        for (let idx = 0; idx < movies.length; idx++) {
          const movie = movies[idx];
          const slug = movie.slug || '';
          const title = movie.name || movie.title || 'Unknown';
          const englishTitle = movie.original_name || '';
          const year = movie.year || 'N/A';
          
          // Fetch detail for category and episode count
          let totalEpisodes = 'N/A';
          let category = 'N/A';
          try {
            if (slug) {
              const detail = await getMovieDetail(slug);
              if (detail) {
                if (detail.total_episodes) {
                  totalEpisodes = detail.total_episodes.toString();
                }
                // Extract category from detail
                if (detail.category && detail.category[1]) {
                  const categoryList = detail.category[1].list;
                  if (categoryList && categoryList.length > 0) {
                    category = categoryList[0].name;
                  }
                }
              }
            }
          } catch (e) {
            console.log(`⚠️ Could not fetch detail for ${slug}`);
          }
          
          const movieNum = idx + 1;
          
          // Build the title with English name if available
          let titleDisplay = `**${movieNum}. ${title}**`;
          if (englishTitle && englishTitle !== title) {
            titleDisplay += ` (${englishTitle})`;
          }
          
          description += `${titleDisplay}\n`;
          
          let infoLine = '';
          
          // Show year if available
          if (year !== 'N/A') {
            infoLine += `📅 ${year}`;
          }
          
          // Show category if available
          if (category !== 'N/A') {
            infoLine += infoLine ? ` | 📺 ${category}` : `📺 ${category}`;
          }
          
          // Show episode count
          if (totalEpisodes !== 'N/A') {
            infoLine += infoLine ? ` | 🎬 ${totalEpisodes} tập` : `🎬 ${totalEpisodes} tập`;
          }
          
          if (infoLine) {
            description += infoLine + '\n';
          }
          
          description += '\n';
        }

        embed.setDescription(description);
        
        // Create buttons for all movies (up to 10) - Discord allows max 5 buttons per row
        const buttons = [];
        for (let i = 1; i <= Math.min(10, movies.length); i++) {
          const movieTitle = movies[i - 1].name.substring(0, 15);
          buttons.push(
            new ButtonBuilder()
              .setCustomId(`newmovies_detail_${i}_${message.author.id}`)
              .setLabel(`${i}. ${movieTitle}`)
              .setStyle(1) // Primary style
          );
        }

        // Split buttons into rows (max 5 per row)
        const buttonRows = [];
        for (let i = 0; i < buttons.length; i += 5) {
          buttonRows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
        }

        const response = await message.reply({ 
          embeds: [embed],
          components: buttonRows.length > 0 ? buttonRows : []
        });

        // Collector for movie selection
        const movieCollector = response.createMessageComponentCollector({
          filter: (interaction) => interaction.user.id === message.author.id && interaction.customId.startsWith('newmovies_detail_'),
          time: 5 * 60 * 1000 // 5 minutes
        });

        movieCollector.on('collect', async (interaction) => {
          // Extract movie number from customId
          const movieNum = parseInt(interaction.customId.split('_')[2]);
          const selectedMovie = movies[movieNum - 1];
          const slug = selectedMovie.slug;

          try {
            const detail = await getMovieDetail(slug);
            
            if (!detail) {
              await interaction.reply({ content: '❌ Không thể lấy thông tin phim', flags: 64 });
              return;
            }

            // Show movie detail with server selection buttons
            const movieDetail = new EmbedBuilder()
              .setColor('#e50914')
              .setTitle(`🎬 ${detail.name}`)
              .setThumbnail(detail.thumb_url)
              .setDescription(detail.description?.substring(0, 300) || 'Không có mô tả')
              .addFields(
                { name: '📅 Năm phát hành', value: String(detail.year || 'N/A'), inline: true },
                { name: '🎭 Chất lượng', value: String(detail.quality || 'N/A'), inline: true },
                { name: '🗣️ Ngôn ngữ', value: String(detail.language || 'N/A'), inline: true },
                { name: '📺 Số tập', value: String(detail.total_episodes || 'N/A'), inline: true },
                { name: '▶️ Tập hiện tại', value: String(detail.current_episode || 'N/A'), inline: true }
              )
              .setTimestamp()
              .setFooter({ text: 'Movie Detail' });

            // Create server selection buttons
            const serverButtons = [];
            for (let i = 0; i < detail.episodes.length; i++) {
              serverButtons.push(
                new ButtonBuilder()
                  .setCustomId(`server_select_${i}_${slug}_${message.author.id}`)
                  .setLabel(detail.episodes[i].server_name.substring(0, 20))
                  .setStyle(2) // Secondary style
              );
            }

            // Add back button
            serverButtons.push(
              new ButtonBuilder()
                .setCustomId(`back_to_newmovies_${message.author.id}`)
                .setLabel('⬅️ Quay lại')
                .setStyle(4) // Danger style (red)
            );

            const serverRow = serverButtons.length > 0 ? new ActionRowBuilder().addComponents(serverButtons) : null;

            await interaction.update({
              embeds: [movieDetail],
              components: serverRow ? [serverRow] : []
            });

            // Collector for server selection
            const serverCollector = response.createMessageComponentCollector({
              filter: (inter) => inter.user.id === message.author.id && inter.customId.startsWith('server_select_'),
              time: 5 * 60 * 1000
            });

            // Collector for back button from movie detail to newmovies
            const backFromDetailCollector = response.createMessageComponentCollector({
              filter: (inter) => inter.user.id === message.author.id && inter.customId === `back_to_newmovies_${message.author.id}`,
              time: 5 * 60 * 1000
            });

            backFromDetailCollector.on('collect', async (backInteraction) => {
              await backInteraction.update({
                embeds: [embed],
                components: buttonRows.length > 0 ? buttonRows : []
              });
              serverCollector.stop();
            });

            serverCollector.on('collect', async (serverInteraction) => {

              const serverIndex = parseInt(serverInteraction.customId.split('_')[2]);
              let currentEpisodePage = 1;

              const createEpisodesEmbed = async (page) => {
                const result = await getEpisodes(slug, page, serverIndex);
                
                if (!result.episodes || result.episodes.length === 0) {
                  return null;
                }

                const episodeEmbed = new EmbedBuilder()
                  .setColor('#e50914')
                  .setTitle(`🎬 ${result.movieName}`)
                  .setDescription(`📺 Server: **${result.serverName}**`)
                  .setTimestamp()
                  .setFooter({ text: `Trang ${result.currentPage}/${result.totalPages} | Tổng ${result.totalEpisodes} tập` });

                let episodeList = '';
                for (const episode of result.episodes) {
                  const episodeNum = episode.name;
                  episodeList += `**Tập ${episodeNum}**: [Xem →](${episode.embed})\n`;
                }

                episodeEmbed.addFields({ name: 'Danh sách tập', value: episodeList });
                return episodeEmbed;
              };

              const initialEmbed = await createEpisodesEmbed(1);
              
              if (!initialEmbed) {
                await serverInteraction.reply({
                  content: `❌ Không tìm thấy tập phim`,
                  flags: 64
                });
                return;
              }

              const epResult = await getEpisodes(slug, 1, serverIndex);

              // Create pagination buttons
              const createPaginationButtons = () => {
                const paginationButtons = [];
                
                if (currentEpisodePage > 1) {
                  paginationButtons.push(
                    new ButtonBuilder()
                      .setCustomId(`ep_prev_${serverIndex}_${slug}_${message.author.id}`)
                      .setLabel('⬅️ Trang trước')
                      .setStyle(1)
                  );
                }

                paginationButtons.push(
                  new ButtonBuilder()
                    .setCustomId(`ep_page_${serverIndex}_${slug}_${message.author.id}`)
                    .setLabel(`${currentEpisodePage}/${epResult.totalPages}`)
                    .setStyle(2)
                    .setDisabled(true)
                );

                if (currentEpisodePage < epResult.totalPages) {
                  paginationButtons.push(
                    new ButtonBuilder()
                      .setCustomId(`ep_next_${serverIndex}_${slug}_${message.author.id}`)
                      .setLabel('Trang sau ➡️')
                      .setStyle(1)
                  );
                }

                // Add back button
                paginationButtons.push(
                  new ButtonBuilder()
                    .setCustomId(`back_to_detail_${serverIndex}_${slug}_${message.author.id}`)
                    .setLabel('⬅️ Quay lại')
                    .setStyle(4)
                );

                return paginationButtons;
              };

              await serverInteraction.update({
                embeds: [initialEmbed],
                components: createPaginationButtons().length > 0 ? [new ActionRowBuilder().addComponents(createPaginationButtons())] : []
              });

              // Collector for pagination
              const pageCollector = response.createMessageComponentCollector({
                filter: (inter) => inter.user.id === message.author.id && inter.customId.includes(`_${serverIndex}_${slug}_`) && !inter.customId.startsWith('back_to_detail_'),
                time: 5 * 60 * 1000
              });

              // Collector for back button from episodes to movie detail
              const backFromEpisodesCollector = response.createMessageComponentCollector({
                filter: (inter) => inter.user.id === message.author.id && inter.customId === `back_to_detail_${serverIndex}_${slug}_${message.author.id}`,
                time: 5 * 60 * 1000
              });

              backFromEpisodesCollector.on('collect', async (backInteraction) => {
                await backInteraction.update({
                  embeds: [movieDetail],
                  components: serverRow ? [serverRow] : []
                });
                pageCollector.stop();
                backFromEpisodesCollector.stop();
              });

              pageCollector.on('collect', async (pageInteraction) => {
                if (pageInteraction.customId.includes('ep_prev_')) {
                  if (currentEpisodePage > 1) currentEpisodePage--;
                } else if (pageInteraction.customId.includes('ep_next_')) {
                  currentEpisodePage++;
                }

                const newEmbed = await createEpisodesEmbed(currentEpisodePage);
                
                if (!newEmbed) {
                  await pageInteraction.reply({
                    content: `❌ Không tìm thấy tập trên trang **${currentEpisodePage}**`,
                    flags: 64
                  });
                  return;
                }

                const newResult = await getEpisodes(slug, currentEpisodePage, serverIndex);
                
                const newPaginationButtons = [];
                
                if (currentEpisodePage > 1) {
                  newPaginationButtons.push(
                    new ButtonBuilder()
                      .setCustomId(`ep_prev_${serverIndex}_${slug}_${message.author.id}`)
                      .setLabel('⬅️ Trang trước')
                      .setStyle(1)
                  );
                }

                newPaginationButtons.push(
                  new ButtonBuilder()
                    .setCustomId(`ep_page_${serverIndex}_${slug}_${message.author.id}`)
                    .setLabel(`${currentEpisodePage}/${newResult.totalPages}`)
                    .setStyle(2)
                    .setDisabled(true)
                );

                if (currentEpisodePage < newResult.totalPages) {
                  newPaginationButtons.push(
                    new ButtonBuilder()
                      .setCustomId(`ep_next_${serverIndex}_${slug}_${message.author.id}`)
                      .setLabel('Trang sau ➡️')
                      .setStyle(1)
                  );
                }

                newPaginationButtons.push(
                  new ButtonBuilder()
                    .setCustomId(`back_to_detail_${serverIndex}_${slug}_${message.author.id}`)
                    .setLabel('⬅️ Quay lại')
                    .setStyle(4)
                );

                await pageInteraction.update({
                  embeds: [newEmbed],
                  components: newPaginationButtons.length > 0 ? [new ActionRowBuilder().addComponents(newPaginationButtons)] : []
                });
              });
            });

          } catch (error) {
            console.error('❌ Lỗi khi chọn phim:', error.message);
            await interaction.reply({ content: '❌ Có lỗi xảy ra. Vui lòng thử lại!', flags: 64 });
          }
        });

        console.log('✅ New movies sent successfully with pagination buttons');
        
      } catch (error) {
        console.error('❌ Lỗi lấy phim mới:', error.message);
        await message.reply('❌ Có lỗi xảy ra khi lấy phim mới. Vui lòng thử lại!');
      }
      
      replied = true;
      return;
    }

    // Search phim command
    if (command === 'search') {
      console.log('🔍 Search command triggered');
      
      // Get remaining text after "search" command (preserves spaces and quotes)
      const searchText = afterPrefix.slice('search'.length).trim();
      
      // Extract keyword (remove quotes if present, otherwise use as-is)
      let keyword = searchText;
      if (searchText.startsWith('"') && searchText.endsWith('"')) {
        keyword = searchText.slice(1, -1).trim();
      }
      
      // Check if no keyword - show help
      if (!keyword) {
        const helpText = `
📌 **Hướng Dẫn Lệnh Tìm Kiếm Phim**

**Cú pháp:**
\`!search tên phim\`

**Ví dụ:**
• \`!search avatar\` - Tìm phim "avatar"
• \`!search mưa đỏ\` - Tìm phim "mưa đỏ"
• \`!search the marvel\` - Tìm phim "the marvel"

**Tính năng:**
✅ Hiển thị tên Việt + tên Anh + năm phát hành
✅ Tối đa 10 kết quả trên mỗi lần tìm
✅ Link xem phim trực tiếp

**Lệnh khác:**
• \`!newmovies [trang]\` - Xem phim mới cập nhật
• \`!help\` - Xem tất cả lệnh
`;
        message.reply(helpText);
        replied = true;
        return;
      }
      
      if (keyword.length < 2) {
        message.reply('❌ Tên phim phải có ít nhất 2 ký tự!');
        replied = true;
        return;
      }

      try {
        const searchResults = await searchMovies(keyword);
        console.log(`✅ Found ${searchResults.length} results`);
        
        if (!searchResults || searchResults.length === 0) {
          await message.reply(`❌ Không tìm thấy phim nào với từ khóa: **${keyword}**`);
          replied = true;
          return;
        }

        // Limit to 10 results
        const movies = searchResults.slice(0, 10);
        
        const embed = new EmbedBuilder()
          .setColor('#e50914') // Netflix red
          .setTitle(`🎬 Kết Quả Tìm Kiếm: "${keyword}"`)
          .setDescription(`Tìm thấy **${searchResults.length}** phim`)
          .setTimestamp();

        // Build movie list with detailed info
        let description = '';
        const movieLinks = {};
        const watchSources = {};
        
        for (let idx = 0; idx < movies.length; idx++) {
          const movie = movies[idx];
          const slug = movie.slug || '';
          const link = slug ? `https://phim.nguonc.com/phim/${slug}` : 'N/A';
          const title = movie.name || movie.title || 'Unknown';
          const englishTitle = movie.original_name || '';
          const year = movie.year || 'N/A';
          
          // Fetch detail for watch source and episode count
          let watchSource = null;
          let totalEpisodes = 'N/A';
          let category = 'N/A';
          try {
            if (slug) {
              const detail = await getMovieDetail(slug);
              if (detail) {
                if (detail.watchSource) {
                  watchSource = detail.watchSource;
                }
                if (detail.total_episodes) {
                  totalEpisodes = detail.total_episodes.toString();
                }
                // Extract category from detail
                if (detail.category && detail.category[1]) {
                  const categoryList = detail.category[1].list;
                  if (categoryList && categoryList.length > 0) {
                    category = categoryList[0].name;
                  }
                }
              }
            }
          } catch (e) {
            console.log(`⚠️ Could not fetch detail for ${slug}`);
          }
          
          // Store links for button use
          movieLinks[idx + 1] = link;
          if (watchSource) {
            watchSources[idx + 1] = watchSource;
          }
          
          // Truncate long titles
          const displayTitle = title.length > 50 ? title.substring(0, 47) + '...' : title;
          
          // Build the title with English name if available
          let titleDisplay = `**${idx + 1}. ${displayTitle}**`;
          if (englishTitle && englishTitle !== title) {
            titleDisplay += ` (${englishTitle})`;
          }
          
          description += `\n${titleDisplay}\n`;
          
          let infoLine = '';
          
          // Show year if available
          if (year !== 'N/A') {
            infoLine += `📅 ${year}`;
          }
          
          // Show category if available
          if (category !== 'N/A') {
            infoLine += infoLine ? ` | 📺 ${category}` : `📺 ${category}`;
          }
          
          // Show episode count
          if (totalEpisodes !== 'N/A') {
            infoLine += infoLine ? ` | 🎬 ${totalEpisodes} tập` : `🎬 ${totalEpisodes} tập`;
          }
          
          if (infoLine) {
            description += infoLine + '\n';
          }
          
          description += '\n';
          
          // Store slug for button use
          movieLinks[idx + 1] = slug;
        }

        embed.setDescription(description);
        
        // Create buttons for all movies (up to 10) - Discord allows max 5 buttons per row
        const buttons = [];
        for (let i = 1; i <= Math.min(10, movies.length); i++) {
          const movieTitle = movies[i - 1].name.substring(0, 15);
          buttons.push(
            new ButtonBuilder()
              .setCustomId(`movie_detail_${i}_${message.author.id}`)
              .setLabel(`${i}. ${movieTitle}`)
              .setStyle(1) // Primary style
          );
        }

        // Split buttons into rows (max 5 per row)
        const buttonRows = [];
        for (let i = 0; i < buttons.length; i += 5) {
          buttonRows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
        }

        const response = await message.reply({ 
          embeds: [embed],
          components: buttonRows.length > 0 ? buttonRows : []
        });

        // Collector for movie selection
        const movieCollector = response.createMessageComponentCollector({
          filter: (interaction) => interaction.user.id === message.author.id && interaction.customId.startsWith('movie_detail_'),
          time: 5 * 60 * 1000 // 5 minutes
        });

        movieCollector.on('collect', async (interaction) => {
          // Extract movie number from customId
          const movieNum = parseInt(interaction.customId.split('_')[2]);
          const selectedMovie = movies[movieNum - 1];
          const slug = selectedMovie.slug;

          try {
            const detail = await getMovieDetail(slug);
            
            if (!detail) {
              await interaction.reply({ content: '❌ Không thể lấy thông tin phim', flags: 64 });
              return;
            }

            // Show movie detail with server selection buttons
            const movieDetail = new EmbedBuilder()
              .setColor('#e50914')
              .setTitle(`🎬 ${detail.name}`)
              .setThumbnail(detail.thumb_url)
              .setDescription(detail.description?.substring(0, 300) || 'Không có mô tả')
              .addFields(
                { name: '📅 Năm phát hành', value: String(detail.year || 'N/A'), inline: true },
                { name: '🎭 Chất lượng', value: String(detail.quality || 'N/A'), inline: true },
                { name: '🗣️ Ngôn ngữ', value: String(detail.language || 'N/A'), inline: true },
                { name: '📺 Số tập', value: String(detail.total_episodes || 'N/A'), inline: true },
                { name: '▶️ Tập hiện tại', value: String(detail.current_episode || 'N/A'), inline: true }
              )
              .setTimestamp()
              .setFooter({ text: 'Movie Detail' });

            // Create server selection buttons
            const serverButtons = [];
            for (let i = 0; i < detail.episodes.length; i++) {
              serverButtons.push(
                new ButtonBuilder()
                  .setCustomId(`server_select_${i}_${slug}_${message.author.id}`)
                  .setLabel(detail.episodes[i].server_name.substring(0, 20))
                  .setStyle(2) // Secondary style
              );
            }

            // Add back button
            serverButtons.push(
              new ButtonBuilder()
                .setCustomId(`back_to_search_${message.author.id}`)
                .setLabel('⬅️ Quay lại')
                .setStyle(4) // Danger style (red)
            );

            const serverRow = serverButtons.length > 0 ? new ActionRowBuilder().addComponents(serverButtons) : null;

            await interaction.update({
              embeds: [movieDetail],
              components: serverRow ? [serverRow] : []
            });

            // Collector for server selection
            const serverCollector = response.createMessageComponentCollector({
              filter: (inter) => inter.user.id === message.author.id && inter.customId.startsWith('server_select_'),
              time: 5 * 60 * 1000
            });

            // Collector for back button from movie detail to search
            const backFromDetailCollector = response.createMessageComponentCollector({
              filter: (inter) => inter.user.id === message.author.id && inter.customId === `back_to_search_${message.author.id}`,
              time: 5 * 60 * 1000
            });

            backFromDetailCollector.on('collect', async (backInteraction) => {
              await backInteraction.update({
                embeds: [embed],
                components: buttonRows.length > 0 ? buttonRows : []
              });
              serverCollector.stop();
              // Don't stop backFromDetailCollector - let it handle back from episodes too
            });

            serverCollector.on('collect', async (serverInteraction) => {
              const serverIndex = parseInt(serverInteraction.customId.split('_')[2]);
              let currentPage = 1;

              const createEpisodesEmbed = async (page) => {
                const result = await getEpisodes(slug, page, serverIndex);
                
                if (!result.episodes || result.episodes.length === 0) {
                  return null;
                }

                const episodeEmbed = new EmbedBuilder()
                  .setColor('#e50914')
                  .setTitle(`🎬 ${result.movieName}`)
                  .setDescription(`📺 Server: **${result.serverName}**`)
                  .setTimestamp()
                  .setFooter({ text: `Trang ${result.currentPage}/${result.totalPages} | Tổng ${result.totalEpisodes} tập` });

                let episodeList = '';
                for (const episode of result.episodes) {
                  const episodeNum = episode.name;
                  episodeList += `**Tập ${episodeNum}**: [Xem →](${episode.embed})\n`;
                }

                episodeEmbed.addFields({ name: 'Danh sách tập', value: episodeList });
                return episodeEmbed;
              };

              const initialEmbed = await createEpisodesEmbed(1);
              
              if (!initialEmbed) {
                await serverInteraction.reply({
                  content: `❌ Không tìm thấy tập phim`,
                  flags: 64
                });
                return;
              }

              const epResult = await getEpisodes(slug, 1, serverIndex);

              // Create pagination buttons
              const createPaginationButtons = () => {
                const paginationButtons = [];
                
                if (currentPage > 1) {
                  paginationButtons.push(
                    new ButtonBuilder()
                      .setCustomId(`ep_prev_${serverIndex}_${slug}_${message.author.id}`)
                      .setLabel('⬅️ Trang trước')
                      .setStyle(1)
                  );
                }

                paginationButtons.push(
                  new ButtonBuilder()
                    .setCustomId(`ep_page_${serverIndex}_${slug}_${message.author.id}`)
                    .setLabel(`${currentPage}/${epResult.totalPages}`)
                    .setStyle(2)
                    .setDisabled(true)
                );

                if (currentPage < epResult.totalPages) {
                  paginationButtons.push(
                    new ButtonBuilder()
                      .setCustomId(`ep_next_${serverIndex}_${slug}_${message.author.id}`)
                      .setLabel('Trang sau ➡️')
                      .setStyle(1)
                  );
                }

                // Add back button
                paginationButtons.push(
                  new ButtonBuilder()
                    .setCustomId(`back_to_detail_${serverIndex}_${slug}_${message.author.id}`)
                    .setLabel('⬅️ Quay lại')
                    .setStyle(4)
                );

                return paginationButtons;
              };

              await serverInteraction.update({
                embeds: [initialEmbed],
                components: createPaginationButtons().length > 0 ? [new ActionRowBuilder().addComponents(createPaginationButtons())] : []
              });

              // Collector for pagination
              const pageCollector = response.createMessageComponentCollector({
                filter: (inter) => inter.user.id === message.author.id && inter.customId.includes(`_${serverIndex}_${slug}_`) && !inter.customId.startsWith('back_to_detail_'),
                time: 5 * 60 * 1000
              });

              // Collector for back button from episodes to movie detail
              const backFromEpisodesCollector = response.createMessageComponentCollector({
                filter: (inter) => inter.user.id === message.author.id && inter.customId === `back_to_detail_${serverIndex}_${slug}_${message.author.id}`,
                time: 5 * 60 * 1000
              });

              backFromEpisodesCollector.on('collect', async (backInteraction) => {
                await backInteraction.update({
                  embeds: [movieDetail],
                  components: serverRow ? [serverRow] : []
                });
                pageCollector.stop();
                backFromEpisodesCollector.stop();
              });

              pageCollector.on('collect', async (pageInteraction) => {
                if (pageInteraction.customId.includes('ep_prev_')) {
                  if (currentPage > 1) currentPage--;
                } else if (pageInteraction.customId.includes('ep_next_')) {
                  currentPage++;
                }

                const newEmbed = await createEpisodesEmbed(currentPage);
                
                if (!newEmbed) {
                  await pageInteraction.reply({
                    content: `❌ Không tìm thấy tập trên trang **${currentPage}**`,
                    flags: 64
                  });
                  return;
                }

                const newResult = await getEpisodes(slug, currentPage, serverIndex);
                
                const newPaginationButtons = [];
                
                if (currentPage > 1) {
                  newPaginationButtons.push(
                    new ButtonBuilder()
                      .setCustomId(`ep_prev_${serverIndex}_${slug}_${message.author.id}`)
                      .setLabel('⬅️ Trang trước')
                      .setStyle(1)
                  );
                }

                newPaginationButtons.push(
                  new ButtonBuilder()
                    .setCustomId(`ep_page_${serverIndex}_${slug}_${message.author.id}`)
                    .setLabel(`${currentPage}/${newResult.totalPages}`)
                    .setStyle(2)
                    .setDisabled(true)
                );

                if (currentPage < newResult.totalPages) {
                  newPaginationButtons.push(
                    new ButtonBuilder()
                      .setCustomId(`ep_next_${serverIndex}_${slug}_${message.author.id}`)
                      .setLabel('Trang sau ➡️')
                      .setStyle(1)
                  );
                }

                newPaginationButtons.push(
                  new ButtonBuilder()
                    .setCustomId(`back_to_detail_${serverIndex}_${slug}_${message.author.id}`)
                    .setLabel('⬅️ Quay lại')
                    .setStyle(4)
                );

                await pageInteraction.update({
                  embeds: [newEmbed],
                  components: newPaginationButtons.length > 0 ? [new ActionRowBuilder().addComponents(newPaginationButtons)] : []
                });
              });
            });

          } catch (error) {
            console.error('❌ Lỗi khi chọn phim:', error.message);
            await interaction.reply({ content: '❌ Có lỗi xảy ra. Vui lòng thử lại!', flags: 64 });
          }
        });

        console.log('✅ Search results sent successfully');
        
      } catch (error) {
        console.error('❌ Lỗi tìm kiếm phim:', error.message);
        await message.reply('❌ Có lỗi xảy ra khi tìm kiếm phim. Vui lòng thử lại!');
      }
      
      replied = true;
      return;
    }

    // Episodes command
    if (command === 'episodes' || command === 'ep') {
      const slug = args.join('-').toLowerCase();
      
      if (!slug) {
        await message.reply('❌ Vui lòng nhập slug phim! Ví dụ: `!episodes hoa-thien-cot`');
        replied = true;
        return;
      }

      try {
        let currentPage = 1;

        const createEpisodesEmbed = async (page) => {
          const result = await getEpisodes(slug, page);
          
          if (!result.episodes || result.episodes.length === 0) {
            return null;
          }

          const embed = new EmbedBuilder()
            .setColor('#e50914')
            .setTitle(`🎬 ${result.movieName}`)
            .setDescription(`📅 Năm phát hành: ${result.movieYear}`)
            .setTimestamp()
            .setFooter({ text: `Trang ${result.currentPage}/${result.totalPages} | Tổng ${result.totalEpisodes} tập` });

          let episodeList = '';
          for (const episode of result.episodes) {
            const episodeNum = episode.name;
            episodeList += `**Tập ${episodeNum}**: [Xem →](${episode.embed})\n`;
          }

          embed.addFields({ name: 'Danh sách tập', value: episodeList });
          return embed;
        };

        const initialEmbed = await createEpisodesEmbed(1);
        
        if (!initialEmbed) {
          await message.reply(`❌ Không tìm thấy phim với slug: **${slug}**`);
          replied = true;
          return;
        }

        const result = await getEpisodes(slug, 1);

        // Buttons for pagination
        const createButtons = () => {
          const buttons = [];
          
          if (currentPage > 1) {
            buttons.push(
              new ButtonBuilder()
                .setCustomId(`episodes_prev_${message.author.id}`)
                .setLabel('⬅️ Trang trước')
                .setStyle(1)
            );
          }

          buttons.push(
            new ButtonBuilder()
              .setCustomId(`episodes_page_${message.author.id}`)
              .setLabel(`Trang ${currentPage}/${result.totalPages}`)
              .setStyle(2)
              .setDisabled(true)
          );

          if (currentPage < result.totalPages) {
            buttons.push(
              new ButtonBuilder()
                .setCustomId(`episodes_next_${message.author.id}`)
                .setLabel('Trang sau ➡️')
                .setStyle(1)
            );
          }

          return buttons;
        };

        const response = await message.reply({
          embeds: [initialEmbed],
          components: createButtons().length > 0 ? [new ActionRowBuilder().addComponents(createButtons())] : []
        });

        const collector = response.createMessageComponentCollector({
          filter: (interaction) => interaction.user.id === message.author.id,
          time: 5 * 60 * 1000 // 5 minutes
        });

        collector.on('collect', async (interaction) => {
          if (interaction.customId === `episodes_prev_${message.author.id}`) {
            if (currentPage > 1) currentPage--;
          } else if (interaction.customId === `episodes_next_${message.author.id}`) {
            currentPage++;
          }

          const newEmbed = await createEpisodesEmbed(currentPage);
          
          if (!newEmbed) {
            await interaction.reply({
              content: `❌ Không tìm thấy tập trên trang **${currentPage}**`,
              flags: 64
            });
            return;
          }

          const newResult = await getEpisodes(slug, currentPage);
          
          const newButtons = [];
          
          if (currentPage > 1) {
            newButtons.push(
              new ButtonBuilder()
                .setCustomId(`episodes_prev_${message.author.id}`)
                .setLabel('⬅️ Trang trước')
                .setStyle(1)
            );
          }

          newButtons.push(
            new ButtonBuilder()
              .setCustomId(`episodes_page_${message.author.id}`)
              .setLabel(`Trang ${currentPage}/${newResult.totalPages}`)
              .setStyle(2)
              .setDisabled(true)
          );

          if (currentPage < newResult.totalPages) {
            newButtons.push(
              new ButtonBuilder()
                .setCustomId(`episodes_next_${message.author.id}`)
                .setLabel('Trang sau ➡️')
                .setStyle(1)
            );
          }

          await interaction.update({
            embeds: [newEmbed],
            components: newButtons.length > 0 ? [new ActionRowBuilder().addComponents(newButtons)] : []
          });
        });

        collector.on('end', () => {
          console.log('Episode pagination ended');
        });

      } catch (error) {
        console.error('❌ Lỗi lấy danh sách tập:', error.message);
        await message.reply('❌ Có lỗi xảy ra khi lấy danh sách tập. Vui lòng thử lại!');
      }

      replied = true;
      return;
    }
    
    message.reply(`Lệnh \`${PREFIX}${command}\` không tồn tại!`);
    replied = true;
    return;
  }

  // Auto-reply channel
  if (!replied && AUTO_REPLY_CHANNELS.includes(message.channelId)) {
    if (content) {
      message.reply(`Bạn vừa nói: "${content}"`);
      replied = true;
      return;
    }
  }

  // Keyword triggers
  if (!replied && lower.includes('chào bot')) {
    message.reply(`Chào ${message.author.username}! Hôm nay ổn không?`);
    replied = true;
    return;
  }

  if (!replied && lower.includes('buồn quá')) {
    message.reply('Sao vậy? Kể lại đi nào');
    replied = true;
    return;
  }

  if (!replied && lower.includes('vui quá')) {
    message.reply('Quá đã luôn! Chia sẻ đi');
    replied = true;
    return;
  }

  if (!replied && lower.includes('chelsea')) {
    message.reply('Fan chồn xanh!');
    replied = true;
    return;
  }


});

process.on('SIGINT', () => {
  console.log('\n⏹️ Bot đang tắt...');
  saveConfig();
  process.exit(0);
});

client.login(TOKEN);
// Cache buster: 1763716200
