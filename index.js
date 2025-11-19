const { Client, GatewayIntentBits, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Import movie functions
const { searchMovies, searchMoviesByYear, getNewMovies, getMovieDetail, getEpisodes, extractYearFromMovie } = require('./movies');

// Import football functions
const { getTeamById, getCompetitionMatches, getLiveScore, getStandings, getFixtures, getFixturesWithCL, getLiveMatches, getMatchLineup } = require('./football');

// Load .env only when running locally (not on Railway)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const TOKEN = process.env.DISCORD_TOKEN;
const LIVESCORE_CHANNEL = '694577581298810946';
const LIVESCORE_UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutes
const PREFIX = '!';
let AUTO_REPLY_CHANNELS = ['713109490878120026', '694577581298810940'];

const CONFIG_FILE = path.join(__dirname, 'config.json');

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
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log('✅ Config đã được lưu vào config.json');
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

client.once('ready', () => {
  console.log(`✅ Bot đã đăng nhập với tư cách: ${client.user.tag}`);
  loadConfig();
});

// Handle interactions (select menu, buttons)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  
  if (interaction.customId === 'track_team_select') {
    // This is handled in the track command collector
    // No need to handle again here
  }
});


// Auto-update livescore function - DISABLED to prevent API quota issues
// Users can manually use !live, !fixtures, !livescore commands instead

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  const content = message.content.trim();
  const lower = content.toLowerCase();
  let replied = false;
  
  // DEBUG: Log mỗi message
  console.log(`📨 [${message.author.username}] ${content}`);

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
          '⚽ Livescore:',
          `\`${PREFIX}live [league_id]\` - xem trận đang diễn ra`,
          `\`${PREFIX}standings [league_code]\` - bảng xếp hạng`,
          `\`${PREFIX}fixtures <team_id>\` - lịch thi đấu sắp tới`,
          `\`${PREFIX}findteam <name>\` - tìm Team ID`,
          '',
          '📍 Team Tracking:',
          `\`${PREFIX}teams\` - hiển thị danh sách team có sẵn`,
          `\`${PREFIX}track\` - chọn team để theo dõi (UI dropdown)`,
          `\`${PREFIX}untrack <team_id>\` - hủy theo dõi team`,
          `\`${PREFIX}mytracks\` - xem danh sách team đang theo dõi`,
          `\`${PREFIX}dashboard\` - xem dashboard với lịch thi đấu`,
          '',
          '🎬 Movie Search:',
          `\`${PREFIX}search <tên phim>\` - tìm phim (hiển thị 10 kết quả)`,
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
      if (args.length === 0) {
        message.reply(`Ví dụ: \`${PREFIX}echo xin chào\``);
        replied = true;
        return;
      }
      message.reply(args.join(' '));
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
      if (args.length === 0) {
        message.reply(`Cách dùng: \`${PREFIX}livescore <team_id>\``);
        replied = true;
        return;
      }
      
      message.reply('⏳ Đang lấy dữ liệu...');
      const teamId = args[0];
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
      
      if (args.length === 0) {
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
      
      const compCode = args[0].toUpperCase();
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

    if (command === 'fixtures') {
      const userId = message.author.id;
      const now = Date.now();
      
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
      
      const userTrackedTeams = getUserTrackedTeams(userId);
      
      if (userTrackedTeams.length === 0) {
        message.reply('❌ Bạn chưa theo dõi team nào. Dùng `!track` để thêm team.');
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
📌 **Hướng Dẫn Lệnh Phim Mới**

**Cú pháp:**
\`!newmovies\` hoặc \`!newphim\`

**Ví dụ:**
• \`!newmovies\` - Hiển thị phim mới (trang 1 mặc định)
• \`!newmovies 2\` - Chuyển sang trang 2
• \`!newmovies 3\` - Chuyển sang trang 3

**Tính năng:**
✅ Mặc định trang 1 khi không nhập số
✅ Hiển thị 10 phim mới nhất trên mỗi trang
✅ Hiển thị tên Việt + tên Anh + năm phát hành
✅ Nút điều hướng: ⬅️ Trước | Sau ➡️
✅ Link xem phim trực tiếp

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
        const createMovieEmbed = async (page) => {
          const newMovies = await getNewMovies(page);
          console.log(`✅ Found ${newMovies.length} new movies on page ${page}`);
          
          if (!newMovies || newMovies.length === 0) {
            return null;
          }

          // Limit to 10 results
          const movies = newMovies.slice(0, 10);
          
          const embed = new EmbedBuilder()
            .setColor('#e50914') // Netflix red
            .setTitle(`🎬 Phim Mới Cập Nhật - Trang ${page}`)
            .setDescription(`Hiển thị **${movies.length}** phim mới nhất`)
            .setTimestamp()
            .setFooter({ text: 'New Movies | phim.nguonc.com' });

          // Build movie list
          let description = '';
          movies.forEach((movie, idx) => {
            const year = movie.year || 'N/A';
            const slug = movie.slug || '';
            const link = slug ? `https://phim.nguonc.com/phim/${slug}` : 'N/A';
            const title = movie.name || movie.title || 'Unknown';
            const englishTitle = movie.original_name || '';
            
            // Truncate long titles
            const displayTitle = title.length > 50 ? title.substring(0, 47) + '...' : title;
            
            // Calculate running number: (page-1)*10 + idx + 1
            const runningNumber = (page - 1) * 10 + idx + 1;
            
            // Build the title with English name if available
            let titleDisplay = `**${runningNumber}. ${displayTitle}**`;
            if (englishTitle && englishTitle !== title) {
              titleDisplay += ` (${englishTitle})`;
            }
            titleDisplay += ` (${year})`;
            
            description += `\n${titleDisplay}\n`;
            
            if (link !== 'N/A') {
              description += `└─ [Xem phim →](${link})\n`;
            }
          });

          embed.setDescription(description);
          return embed;
        };

        const initialEmbed = await createMovieEmbed(currentPage);
        
        if (!initialEmbed) {
          await message.reply(`❌ Không tìm thấy phim mới trên trang **${currentPage}**`);
          replied = true;
          return;
        }

        const createButtons = () => {
          return new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`newmovies_prev_${message.author.id}`)
                .setLabel('⬅️ Trước')
                .setStyle(2)
                .setDisabled(currentPage <= 1),
              new ButtonBuilder()
                .setCustomId(`newmovies_next_${message.author.id}`)
                .setLabel('Sau ➡️')
                .setStyle(2)
            );
        };

        const response = await message.reply({
          embeds: [initialEmbed],
          components: [createButtons()]
        });

        const collector = response.createMessageComponentCollector({
          filter: (interaction) => interaction.user.id === message.author.id,
          time: 10 * 60 * 1000 // 10 minutes
        });

        collector.on('collect', async (interaction) => {
          if (interaction.customId === `newmovies_prev_${message.author.id}`) {
            if (currentPage > 1) currentPage--;
          } else if (interaction.customId === `newmovies_next_${message.author.id}`) {
            currentPage++;
          }

          const newEmbed = await createMovieEmbed(currentPage);
          
          if (!newEmbed) {
            await interaction.reply({
              content: `❌ Không tìm thấy phim mới trên trang **${currentPage}**`,
              flags: 64
            });
            return;
          }

          await interaction.update({
            embeds: [newEmbed],
            components: [createButtons()]
          }).catch(() => {});
        });

        collector.on('end', async () => {
          const disabledRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`newmovies_prev_${message.author.id}`)
                .setLabel('⬅️ Trước')
                .setStyle(2)
                .setDisabled(true),
              new ButtonBuilder()
                .setCustomId(`newmovies_next_${message.author.id}`)
                .setLabel('Sau ➡️')
                .setStyle(2)
                .setDisabled(true)
            );
          await response.edit({ components: [disabledRow] }).catch(() => {});
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
      
      console.log('📝 Raw keyword:', keyword); // Debug log
      
      // Check if asking for help or no keyword
      if (!keyword || keyword.toLowerCase() === 'help') {
        const helpText = `
📌 **Hướng Dẫn Lệnh Tìm Kiếm Phim**

**Cú pháp:**
\`!search tên phim\`

**Ví dụ:**
• \`!search avatar\` - Tìm phim "avatar"
• \`!search mưa đỏ\` - Tìm phim "mưa đỏ"
• \`!search the marvel\` - Tìm phim "the marvel"

**Tính năng:**
✅ Tìm kiếm phim từ API phim.nguonc.com
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
        message.reply('❌ Tên phim phải có ít nhất 2 ký tự!\n\n💡 Gõ `!search help` để xem hướng dẫn chi tiết');
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

        // Limit to 25 results (Discord max 5 rows x 5 buttons)
        const movies = searchResults.slice(0, 25);
        
        const embed = new EmbedBuilder()
          .setColor('#e50914') // Netflix red
          .setTitle(`🎬 Kết Quả Tìm Kiếm: "${keyword}"`)
          .setDescription(`Tìm thấy **${searchResults.length}** phim, hiển thị **${movies.length}** kết quả`)
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
          
          // Show year if available
          if (year !== 'N/A') {
            description += `📅 Năm phát hành: ${year}`;
          }
          
          // Show episode count
          if (totalEpisodes !== 'N/A') {
            description += totalEpisodes !== 'N/A' ? ` | 📺 ${totalEpisodes} tập` : '';
          }
          
          description += '\n';
          
          // Store slug for button use
          movieLinks[idx + 1] = slug;
        }

        embed.setDescription(description);
        
        // Create buttons for all movies (up to 25) - Discord allows max 5 buttons per row (5 rows)
        const buttons = [];
        for (let i = 1; i <= Math.min(25, movies.length); i++) {
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
                { name: '📅 Năm phát hành', value: detail.year || 'N/A', inline: true },
                { name: '🎭 Chất lượng', value: detail.quality || 'N/A', inline: true },
                { name: '🗣️ Ngôn ngữ', value: detail.language || 'N/A', inline: true },
                { name: '📺 Số tập', value: detail.total_episodes?.toString() || 'N/A', inline: true },
                { name: '▶️ Tập hiện tại', value: detail.current_episode || 'N/A', inline: true }
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
