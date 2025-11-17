const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;
const AUTO_REPLY_CHANNELS = ['713109490878120026', '694577581298810940'];
const LIVESCORE_CHANNEL = '694577581298810946';
const LIVESCORE_UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutes
const PREFIX = '!';

const CONFIG_FILE = path.join(__dirname, 'config.json');
const PID_FILE = path.join(__dirname, '.bot.pid');

// Pidfile guard - prevent multiple bot instances
function checkPidFile() {
  if (fs.existsSync(PID_FILE)) {
    try {
      const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
      const isProcessRunning = process.kill(oldPid, 0);
      if (isProcessRunning) {
        console.error(`❌ Bot đang chạy với PID ${oldPid}. Không thể khởi động lại!`);
        process.exit(1);
      }
    } catch (e) {
      // Process không còn chạy, tiếp tục
    }
  }
  // Ghi PID hiện tại
  fs.writeFileSync(PID_FILE, process.pid.toString());
  console.log(`📌 PID ${process.pid} được ghi vào pidfile`);
}

// Football API functions
const FOOTBALL_API_URL = process.env.FOOTBALL_API_URL || 'https://api.football-data.org/v4';

async function getTeamById(teamId) {
  try {
    const response = await axios.get(`${FOOTBALL_API_URL}/teams/${teamId}`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
    });
    return response.data;
  } catch (e) {
    console.error(`❌ Lỗi lấy thông tin team ${teamId}:`, e.response?.data?.message || e.message);
    return null;
  }
}

async function getCompetitionMatches(competitionId) {
  try {
    const response = await axios.get(`${FOOTBALL_API_URL}/competitions/${competitionId}/matches`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
      params: { status: 'LIVE' }
    });
    return response.data.matches || [];
  } catch (e) {
    console.error(`❌ Lỗi lấy trận đấu live (comp ${competitionId}):`, e.response?.data?.message || e.message);
    return [];
  }
}

async function getLiveScore(teamId) {
  try {
    const response = await axios.get(`${FOOTBALL_API_URL}/teams/${teamId}/matches`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
      params: { status: 'LIVE' }
    });
    
    if (!response.data.matches || response.data.matches.length === 0) {
      console.log(`⚠️ Không có trận đấu nào cho team ID ${teamId}`);
      return null;
    }
    
    return response.data.matches[0];
  } catch (e) {
    console.error(`❌ Lỗi lấy livescore (team ${teamId}):`, e.response?.data?.message || e.message);
    return null;
  }
}

async function getStandings(competitionId) {
  try {
    console.log(`📊 Fetching standings for competition ${competitionId}...`);
    const response = await axios.get(`${FOOTBALL_API_URL}/competitions/${competitionId}/standings`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
    });
    
    if (!response.data.standings || response.data.standings.length === 0) {
      console.log(`⚠️ Không có dữ liệu standings cho competition ID ${competitionId}.`);
      return null;
    }
    
    return response.data;
  } catch (e) {
    console.error(`❌ Lỗi lấy bảng xếp hạng (comp ${competitionId}):`, e.response?.data?.message || e.message);
    return null;
  }
}

async function getFixtures(teamId, next = 10) {
  try {
    const response = await axios.get(`${FOOTBALL_API_URL}/teams/${teamId}/matches`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
      params: { 
        status: 'SCHEDULED,LIVE',
        limit: next
      }
    });
    
    if (!response.data.matches || response.data.matches.length === 0) {
      console.log(`ℹ️ Không có trận sắp tới cho team ${teamId}`);
      return [];
    }
    
    return response.data.matches.slice(0, next);
  } catch (e) {
    console.error(`❌ Lỗi lấy lịch thi đấu (team ${teamId}):`, e.response?.data?.message || e.message);
    return [];
  }
}

async function getLiveMatches(competitionId) {
  try {
    console.log(`🔴 Fetching live matches for competition ${competitionId}...`);
    const response = await axios.get(`${FOOTBALL_API_URL}/competitions/${competitionId}/matches`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
      params: { status: 'LIVE' }
    });
    
    console.log(`✅ Found ${response.data.matches?.length || 0} live matches`);
    return response.data.matches || [];
  } catch (e) {
    console.error(`❌ Lỗi lấy trận đấu live (comp ${competitionId}):`, e.response?.data?.message || e.message);
    return [];
  }
}

let config = {
  allowedUsers: [],
  aiEnabled: false
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

checkPidFile();

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
  
  // Start auto-update livescore
  startLivescoreUpdate(client);
});

// Auto-update livescore function
async function startLivescoreUpdate(client) {
  const updateLivescore = async () => {
    try {
      const channel = await client.channels.fetch(LIVESCORE_CHANNEL);
      if (!channel) {
        console.error('❌ Không tìm thấy channel livescore');
        return;
      }
      
      // Get enabled teams from config
      const enabledTeams = config.livescoreTeams ? config.livescoreTeams.filter(t => t.enabled) : [];
      
      for (const team of enabledTeams) {
        try {
          // Get live score
          const score = await getLiveScore(team.id);
          if (score) {
            const fixture = score;
            const homeTeam = fixture.homeTeam.name;
            const awayTeam = fixture.awayTeam.name;
            const homeGoals = fixture.score?.fullTime?.home || 0;
            const awayGoals = fixture.score?.fullTime?.away || 0;
            const status = fixture.status;
            
            const scoreMsg = `⚽ **${homeTeam} ${homeGoals} - ${awayGoals} ${awayTeam}**\nStatus: ${status}`;
            await channel.send(scoreMsg);
          }
          
          // Get fixtures
          const fixtures = await getFixtures(team.id, 3);
          if (fixtures.length > 0) {
            let fixturesText = `📅 **${team.name} - Lịch thi đấu sắp tới:**\n`;
            fixtures.forEach((f, idx) => {
              const date = new Date(f.utcDate).toLocaleString('vi-VN');
              fixturesText += `${idx + 1}. ${f.homeTeam.name} vs ${f.awayTeam.name}\n   ${date}\n`;
            });
            await channel.send(fixturesText);
          }
        } catch (e) {
          console.error(`Lỗi update team ${team.name}:`, e.message);
        }
      }
      
      // Get standings for enabled leagues
      const enabledLeagues = config.leagues ? config.leagues.filter(l => l.enabled) : [];
      
      for (const league of enabledLeagues) {
        try {
          const standings = await getStandings(league.id);
          if (standings) {
            const table = standings.standings[0];
            let standingsText = `📊 **${standings.league.name} - Top 5**\n`;
            table.slice(0, 5).forEach((team, idx) => {
              standingsText += `${idx + 1}. ${team.team.name} - ${team.points}pts\n`;
            });
            await channel.send(standingsText);
          }
        } catch (e) {
          console.error(`Lỗi update league ${league.name}:`, e.message);
        }
      }
      
      console.log(`✅ Đã update livescore vào lúc ${new Date().toLocaleTimeString()}`);
    } catch (e) {
      console.error('Lỗi auto-update livescore:', e.message);
    }
  };
  
  // Run immediately on startup
  await updateLivescore();
  
  // Then run every LIVESCORE_UPDATE_INTERVAL
  setInterval(updateLivescore, LIVESCORE_UPDATE_INTERVAL);
  console.log(`⏰ Livescore sẽ tự động update mỗi ${LIVESCORE_UPDATE_INTERVAL / 60000} phút`);
}

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
    const args = content.slice(PREFIX.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();
    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator) || message.author.id === message.guild?.ownerId;

    if (command === 'ping') {
      message.reply('Pong! 🏓');
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
          'Admin:',
          `\`${PREFIX}adduser <@user>\` - thêm user vào danh sách`,
          `\`${PREFIX}removeuser <@user>\` - xóa user khỏi danh sách`,
          `\`${PREFIX}listusers\` - xem danh sách user`,
          '',
          '⚽ Livescore:',
          `\`${PREFIX}live [league_id]\` - xem trận đang diễn ra (default: 39=Premier)`,
          `\`${PREFIX}livescore <team>\` - xem kết quả live`,
          `\`${PREFIX}standings [league_name/id]\` - bảng xếp hạng (không argument = danh sách giải)`,
          `\`${PREFIX}fixtures <team>\` - lịch thi đấu sắp tới`,
          `\`${PREFIX}findteam <name>\` - tìm Team ID để thêm vào config`
        ].join('\n')
      );
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

    if (command === 'adduser') {
      if (!isAdmin) {
        message.reply('Không có quyền!');
        replied = true;
        return;
      }
      const userInput = args[0];
      if (!userInput) {
        message.reply(`Cách dùng: \`${PREFIX}adduser <@user>\``);
        replied = true;
        return;
      }
      
      let userId = userInput;
      if (message.mentions.users.size > 0) {
        userId = message.mentions.users.first().id;
      } else if (userInput.startsWith('<@') && userInput.endsWith('>')) {
        userId = userInput.replace(/[<@!>]/g, '');
      } else if (isNaN(userInput)) {
        const member = message.guild.members.cache.find(m => 
          m.user.username === userInput || m.displayName === userInput
        );
        if (member) {
          userId = member.id;
        } else {
          message.reply(`Không tìm thấy user "${userInput}"`);
          replied = true;
          return;
        }
      }
      
      if (config.allowedUsers.includes(userId)) {
        message.reply(`User này đã được add rồi!`);
        replied = true;
        return;
      }
      config.allowedUsers.push(userId);
      saveConfig();
      message.reply(`Thêm <@${userId}> vào danh sách thành công!`);
      replied = true;
      return;
    }

    if (command === 'removeuser') {
      if (!isAdmin) {
        message.reply('Không có quyền!');
        replied = true;
        return;
      }
      const userId = args[0];
      if (!userId) {
        message.reply(`Cách dùng: \`${PREFIX}removeuser <@user>\``);
        replied = true;
        return;
      }
      if (!config.allowedUsers.includes(userId)) {
        message.reply(`User này không có trong danh sách!`);
        replied = true;
        return;
      }
      config.allowedUsers = config.allowedUsers.filter(id => id !== userId);
      saveConfig();
      message.reply(`Xóa user ${userId} thành công!`);
      replied = true;
      return;
    }

    if (command === 'listusers') {
      if (!isAdmin) {
        message.reply('Không có quyền!');
        replied = true;
        return;
      }
      if (config.allowedUsers.length === 0) {
        message.reply('Chưa có user nào!');
        replied = true;
        return;
      }
      message.reply(`Danh sách user: ${config.allowedUsers.join(', ')}`);
      replied = true;
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
      if (args.length === 0) {
        message.reply(`Cách dùng: \`${PREFIX}fixtures <team_id>\``);
        replied = true;
        return;
      }
      
      message.reply('⏳ Đang lấy lịch thi đấu...');
      const teamId = args[0];
      const fixtures = await getFixtures(teamId, 10);
      
      if (fixtures.length === 0) {
        message.reply('❌ Không tìm thấy đội bóng hoặc lịch thi đấu!');
        replied = true;
        return;
      }
      
      let fixturesText = `📅 **LỊCH THI ĐẤU SẮP TỚI**\n`;
      fixturesText += `═══════════════════════════════════\n\n`;
      
      fixtures.forEach((f, idx) => {
        const date = new Date(f.utcDate).toLocaleString('vi-VN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
        const home = f.homeTeam.name;
        const away = f.awayTeam.name;
        const competition = f.competition?.name || 'Unknown';
        const status = f.status;
        
        fixturesText += `${idx + 1}. **${home}** vs **${away}**\n`;
        fixturesText += `   📅 ${date}\n`;
        fixturesText += `   🏆 ${competition} | Status: ${status}\n`;
        fixturesText += `\n`;
      });
      
      fixturesText += `═══════════════════════════════════`;
      message.reply(fixturesText);
      replied = true;
      return;
    }

    if (command === 'findteam') {
      if (args.length === 0) {
        message.reply(`Cách dùng: \`${PREFIX}findteam <team_name>\``);
        replied = true;
        return;
      }
      
      message.reply('⏳ Đang tìm đội bóng...');
      
      try {
        // Search for team by name
        const response = await axios.get(`${FOOTBALL_API_URL}/teams`, {
          headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
        });
        
        const searchTerm = args.join(' ').toLowerCase();
        const matches = response.data.teams.filter(t => 
          t.name.toLowerCase().includes(searchTerm) ||
          t.shortName.toLowerCase().includes(searchTerm) ||
          (t.tla && t.tla.toLowerCase().includes(searchTerm))
        ).slice(0, 5);
        
        if (matches.length === 0) {
          message.reply('❌ Không tìm thấy đội bóng!');
          replied = true;
          return;
        }
        
        let teamList = `🔍 **TÌM KIẾM ĐỘI BÓNG**\n`;
        teamList += `═══════════════════════════════════\n\n`;
        
        matches.forEach((t, idx) => {
          teamList += `${idx + 1}. **${t.name}**\n`;
          teamList += `   ID: \`${t.id}\`\n`;
          teamList += `   Quốc gia: ${t.area?.name || 'N/A'}\n`;
          teamList += `\n`;
        });
        
        teamList += `═══════════════════════════════════\n`;
        teamList += `💡 Copy ID để thêm vào config.json`;
        
        message.reply(teamList);
      } catch (e) {
        message.reply(`❌ Lỗi: ${e.response?.data?.message || e.message}`);
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
  if (fs.existsSync(PID_FILE)) {
    fs.unlinkSync(PID_FILE);
    console.log('🗑️ Pidfile đã bị xóa');
  }
  process.exit(0);
});

client.login(TOKEN);
