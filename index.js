const { Client, GatewayIntentBits, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;
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
    // Try to get from team endpoint first
    let response = await axios.get(`${FOOTBALL_API_URL}/teams/${teamId}/matches`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
      params: { 
        status: 'SCHEDULED,LIVE',
        limit: next
      }
    });
    
    let matches = response.data.matches || [];
    
    // If no recent matches or they're too far in the future, try competition endpoint
    if (matches.length === 0 || (matches.length > 0 && new Date(matches[0].utcDate) > new Date(Date.now() + 90 * 24 * 60 * 60 * 1000))) {
      console.log(`ℹ️ Team endpoint returned future matches, trying competition endpoint...`);
      
      // Get team info to find their competition
      const teamRes = await axios.get(`${FOOTBALL_API_URL}/teams/${teamId}`, {
        headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
      });
      
      const activeCompetition = teamRes.data.runningCompetitions?.[0];
      if (!activeCompetition) {
        return [];
      }
      
      // Get competition matches
      const compRes = await axios.get(`${FOOTBALL_API_URL}/competitions/${activeCompetition.code}/matches?status=SCHEDULED,LIVE`, {
        headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
        params: { limit: 50 }
      });
      
      // Filter for this team only
      matches = (compRes.data.matches || []).filter(m => 
        m.homeTeam.id === teamId || m.awayTeam.id === teamId
      );
    }
    
    if (matches.length === 0) {
      console.log(`ℹ️ Không có trận sắp tới cho team ${teamId}`);
      return [];
    }
    
    // Sort by date (ascending - earliest first)
    const sorted = matches.sort((a, b) => 
      new Date(a.utcDate) - new Date(b.utcDate)
    );
    
    return sorted.slice(0, next);
  } catch (e) {
    console.error(`❌ Lỗi lấy lịch thi đấu (team ${teamId}):`, e.response?.data?.message || e.message);
    return [];
  }
}

// Get fixtures including Champions League
async function getFixturesWithCL(teamId, next = 10) {
  try {
    const matches = [];
    
    // Get regular league fixtures
    const leagueMatches = await getFixtures(teamId, next);
    matches.push(...leagueMatches);
    
    // Try to get Champions League fixtures
    try {
      const clRes = await axios.get(`${FOOTBALL_API_URL}/competitions/CL/matches?status=SCHEDULED,LIVE`, {
        headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
        params: { limit: 50 }
      });
      
      const clMatches = (clRes.data.matches || []).filter(m => 
        m.homeTeam.id === teamId || m.awayTeam.id === teamId
      ).map(m => ({ ...m, inChampionsLeague: true }));
      
      if (clMatches.length === 0) {
        console.log(`ℹ️ Team ${teamId} not in Champions League or no scheduled matches`);
      } else {
        matches.push(...clMatches);
      }
    } catch (e) {
      if (e.response?.status === 429) {
        console.warn(`⚠️ CL API rate limit hit: ${e.response.data.message}`);
      } else {
        console.log(`ℹ️ CL data unavailable: ${e.response?.data?.message || e.message}`);
      }
    }
    
    // Sort by date and return top next
    return matches
      .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
      .slice(0, next);
  } catch (e) {
    console.error(`❌ Lỗi lấy lịch thi đấu với CL:`, e.message);
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

// Movie search function
async function searchMovies(keyword) {
  try {
    const response = await axios.get('https://phim.nguonc.com/api/films/search', {
      params: { keyword: keyword }
    });
    
    const items = response.data.items || [];
    
    // Extract year from description or created date
    return items.map(item => ({
      ...item,
      year: extractYearFromMovie(item)
    }));
  } catch (error) {
    console.error('❌ Lỗi API tìm kiếm phim:', error.response?.data?.message || error.message);
    return [];
  }
}

function extractYearFromMovie(movie) {
  // Try to extract year from description or use year from created date
  if (movie.description) {
    const yearMatch = movie.description.match(/(\d{4})/);
    if (yearMatch) return yearMatch[1];
  }
  
  // Fallback: extract year from created date
  if (movie.created) {
    return movie.created.split('-')[0];
  }
  
  return 'N/A';
}

// Get newly updated movies
async function getNewMovies(page = 1) {
  try {
    const response = await axios.get(`https://phim.nguonc.com/api/films/phim-moi-cap-nhat?page=${page}`);
    
    const items = response.data.items || [];
    
    // Extract year from description or created date
    return items.map(item => ({
      ...item,
      year: extractYearFromMovie(item)
    }));
  } catch (error) {
    console.error('❌ Lỗi API lấy phim mới:', error.response?.data?.message || error.message);
    return [];
  }
}

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
  
  // Start auto-update livescore
  startLivescoreUpdate(client);
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
// Check for upcoming matches 1 day before

// Get match lineup (3 hours before match)
async function getMatchLineup(matchId) {
  try {
    const response = await axios.get(`${FOOTBALL_API_URL}/matches/${matchId}`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
    });
    
    const match = response.data.match;
    return {
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      utcDate: match.utcDate,
      competition: match.competition,
      status: match.status
    };
  } catch (e) {
    console.error(`❌ Lỗi lấy line-up (match ${matchId}):`, e.response?.data?.message || e.message);
    return null;
  }
}

// Track live match updates (every 5 minutes during match)
const liveMatchTracking = new Map(); // matchId -> { lastUpdate, lastGoals, lastBookings }

async function checkLiveMatches(client) {
  try {
    if (!config.trackedTeams || config.trackedTeams.length === 0) return;
    
    const now = new Date();
    
    for (const teamId of config.trackedTeams) {
      try {
        const response = await axios.get(`${FOOTBALL_API_URL}/teams/${teamId}/matches`, {
          headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
          params: { status: 'IN_PLAY' }
        });
        
        const matches = response.data.matches || [];
        
        for (const match of matches) {
          const matchId = match.id;
          
          // Get full match details for goals and bookings
          const fullMatch = await axios.get(`${FOOTBALL_API_URL}/matches/${matchId}`, {
            headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
          }).then(r => r.data.match).catch(e => null);
          
          if (!fullMatch) continue;
          
          const tracked = liveMatchTracking.get(matchId) || {
            lastUpdate: now,
            lastGoals: [],
            lastBookings: [],
            lastSubstitutions: []
          };
          
          // Check for new goals
          const newGoals = (fullMatch.goals || []).filter(g => 
            !tracked.lastGoals.some(lg => lg.minute === g.minute && lg.scorer.id === g.scorer.id)
          );
          
          // Check for new bookings
          const newBookings = (fullMatch.bookings || []).filter(b =>
            !tracked.lastBookings.some(lb => lb.minute === b.minute && lb.player.id === b.player.id)
          );
          
          // Check for new substitutions
          const newSubstitutions = (fullMatch.substitutions || []).filter(s =>
            !tracked.lastSubstitutions.some(ls => ls.minute === s.minute && ls.playerOut.id === s.playerOut.id)
          );
          
          // Send updates if there are new events
          if (newGoals.length > 0 || newBookings.length > 0 || newSubstitutions.length > 0) {
            const team = config.livescoreTeams.find(t => t.id === teamId);
            const teamName = team?.name || `Team ${teamId}`;
            
            // Find notification channel
            const guilds = client.guilds.cache;
            for (const guild of guilds.values()) {
              const textChannels = guild.channels.cache.filter(ch => ch.isTextBased());
              const notifyChannel = textChannels.first();
              
              if (notifyChannel) {
                let updateText = `🔴 **LIVE UPDATE: ${teamName}** (${fullMatch.homeTeam.name} ${fullMatch.score?.fullTime?.home || 0} - ${fullMatch.score?.fullTime?.away || 0} ${fullMatch.awayTeam.name})\n\n`;
                
                if (newGoals.length > 0) {
                  updateText += `⚽ **BÀNG THẮNG!**\n`;
                  newGoals.forEach(goal => {
                    updateText += `   ${goal.minute}' - **${goal.scorer.name}** (${goal.team.name})`;
                    if (goal.assist) updateText += ` [Hỗ trợ: ${goal.assist.name}]`;
                    updateText += `\n`;
                  });
                  updateText += `\n`;
                }
                
                if (newBookings.length > 0) {
                  updateText += `🟨 **THẺ PHẠT!**\n`;
                  newBookings.forEach(booking => {
                    const cardType = booking.card === 'YELLOW_CARD' ? '🟨 Thẻ vàng' : '🟥 Thẻ đỏ';
                    updateText += `   ${booking.minute}' - ${cardType} - ${booking.player.name} (${booking.team.name})\n`;
                  });
                  updateText += `\n`;
                }
                
                if (newSubstitutions.length > 0) {
                  updateText += `🔄 **THAY NGƯỜI!**\n`;
                  newSubstitutions.forEach(sub => {
                    updateText += `   ${sub.minute}' - ${sub.playerOut.name} ❌ → ✅ ${sub.playerIn.name} (${sub.team.name})\n`;
                  });
                  updateText += `\n`;
                }
                
                try {
                  await notifyChannel.send(updateText);
                  console.log(`✅ Sent live update for ${teamName} match #${matchId}`);
                } catch (err) {
                  console.error(`❌ Failed to send live update: ${err.message}`);
                }
                
                break; // Only send to first guild
              }
            }
            
            // Update tracking data
            tracked.lastGoals = [...tracked.lastGoals, ...newGoals];
            tracked.lastBookings = [...tracked.lastBookings, ...newBookings];
            tracked.lastSubstitutions = [...tracked.lastSubstitutions, ...newSubstitutions];
            tracked.lastUpdate = now;
          }
          
          liveMatchTracking.set(matchId, tracked);
        }
      } catch (err) {
        console.error(`❌ Error checking live matches for team ${teamId}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error('❌ Error in checkLiveMatches:', err.message);
  }
}

// Check for upcoming matches 3 hours before (send lineup)
async function checkUpcomingLineups(client) {
  try {
    if (!config.trackedTeams || config.trackedTeams.length === 0) return;
    
    const now = new Date();
    const in3Hours = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const in2Hours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    
    console.log(`📋 Checking for upcoming lineups... (${config.trackedTeams.length} tracked teams)`);
    
    for (const teamId of config.trackedTeams) {
      try {
        const fixtures = await getFixtures(teamId, 20);
        
        // Find matches scheduled for next 3 hours
        const upcomingMatches = fixtures.filter(match => {
          const matchDate = new Date(match.utcDate);
          return matchDate >= in2Hours && matchDate <= in3Hours;
        });
        
        if (upcomingMatches.length > 0) {
          const team = config.livescoreTeams.find(t => t.id === teamId);
          const teamName = team?.name || `Team ${teamId}`;
          
          // Get full match data with lineup
          for (const match of upcomingMatches) {
            try {
              const fullMatch = await getMatchLineup(match.id);
              if (!fullMatch) continue;
              
              // Find notification channel
              const guilds = client.guilds.cache;
              for (const guild of guilds.values()) {
                const textChannels = guild.channels.cache.filter(ch => ch.isTextBased());
                const notifyChannel = textChannels.first();
                
                if (notifyChannel) {
                  const matchDate = new Date(fullMatch.utcDate).toLocaleString('vi-VN', {
                    weekday: 'long',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                  
                  const isHome = fullMatch.homeTeam.id === teamId;
                  const opponent = isHome ? fullMatch.awayTeam : fullMatch.homeTeam;
                  
                  let lineupText = `📋 **LINE-UP: ${teamName} vs ${opponent.name}**\n`;
                  lineupText += `🕐 ${matchDate} • 🏆 ${fullMatch.competition?.name || 'Unknown'}\n`;
                  lineupText += `═════════════════════════════════════\n\n`;
                  
                  // Home team lineup
                  lineupText += `🏠 **${fullMatch.homeTeam.name}**\n`;
                  lineupText += `👨‍💼 Coach: ${fullMatch.homeTeam.coach?.name || 'Unknown'}\n`;
                  lineupText += `**Line-up:**\n`;
                  
                  (fullMatch.homeTeam.lineup || []).slice(0, 11).forEach((player, idx) => {
                    lineupText += `  ${idx + 1}. ${player.name} (${player.position})\n`;
                  });
                  
                  lineupText += `\n**Bench:**\n`;
                  (fullMatch.homeTeam.bench || []).slice(0, 7).forEach(player => {
                    lineupText += `  • ${player.name} (${player.position})\n`;
                  });
                  
                  lineupText += `\n\n`;
                  
                  // Away team lineup
                  lineupText += `✈️ **${fullMatch.awayTeam.name}**\n`;
                  lineupText += `👨‍💼 Coach: ${fullMatch.awayTeam.coach?.name || 'Unknown'}\n`;
                  lineupText += `**Line-up:**\n`;
                  
                  (fullMatch.awayTeam.lineup || []).slice(0, 11).forEach((player, idx) => {
                    lineupText += `  ${idx + 1}. ${player.name} (${player.position})\n`;
                  });
                  
                  lineupText += `\n**Bench:**\n`;
                  (fullMatch.awayTeam.bench || []).slice(0, 7).forEach(player => {
                    lineupText += `  • ${player.name} (${player.position})\n`;
                  });
                  
                  try {
                    // Split into chunks if too long (Discord 2000 char limit)
                    const chunks = lineupText.match(/[\s\S]{1,1900}/g) || [lineupText];
                    for (const chunk of chunks) {
                      await notifyChannel.send(chunk);
                    }
                    console.log(`✅ Sent lineup for ${teamName} vs ${opponent.name}`);
                  } catch (err) {
                    console.error(`❌ Failed to send lineup: ${err.message}`);
                  }
                  
                  break; // Only send to first guild
                }
              }
            } catch (err) {
              console.error(`❌ Error getting lineup for match ${match.id}: ${err.message}`);
            }
          }
        }
      } catch (err) {
        console.error(`❌ Error checking fixtures for team ${teamId}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error('❌ Error in checkUpcomingLineups:', err.message);
  }
}

async function checkOneDayNotifications(client) {
  try {
    // Only notify if there are tracked teams
    if (!config.trackedTeams || config.trackedTeams.length === 0) return;
    
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    // Log: Starting notification check
    console.log(`🔔 Checking 1-day notifications... (${config.trackedTeams.length} tracked teams)`);
    
    for (const teamId of config.trackedTeams) {
      try {
        const fixtures = await getFixtures(teamId, 20);
        
        // Find matches scheduled for tomorrow (within 24 hours)
        const upcomingMatches = fixtures.filter(match => {
          const matchDate = new Date(match.utcDate);
          const hoursDiff = (matchDate - now) / (1000 * 60 * 60);
          return hoursDiff > 0 && hoursDiff <= 24;
        });
        
        if (upcomingMatches.length > 0) {
          const team = config.livescoreTeams.find(t => t.id === teamId);
          const teamName = team?.name || `Team ${teamId}`;
          
          // Find notification channel (use first text channel in guild)
          const guilds = client.guilds.cache;
          for (const guild of guilds.values()) {
            const textChannels = guild.channels.cache.filter(ch => ch.isTextBased());
            const notifyChannel = textChannels.first();
            
            if (notifyChannel) {
              let notifyText = `🔔 **THÔNG BÁO: ${teamName} có trận đấu sắp tới trong 24 giờ!**\n\n`;
              
              upcomingMatches.forEach((match, idx) => {
                const date = new Date(match.utcDate).toLocaleString('vi-VN', {
                  weekday: 'long',
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                });
                const opponent = match.homeTeam.id === teamId ? match.awayTeam.name : match.homeTeam.name;
                const competition = match.competition?.name || 'Unknown';
                
                notifyText += `${idx + 1}. ${teamName} vs ${opponent}\n`;
                notifyText += `   📅 ${date}\n`;
                notifyText += `   🏆 ${competition}\n\n`;
              });
              
              try {
                await notifyChannel.send(notifyText);
                console.log(`✅ Sent 1-day notification for ${teamName}`);
              } catch (err) {
                console.error(`❌ Failed to send notification: ${err.message}`);
              }
              
              break; // Only send to first guild
            }
          }
        }
      } catch (err) {
        console.error(`❌ Error checking fixtures for team ${teamId}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error('❌ Error in checkOneDayNotifications:', err.message);
  }
}

async function startLivescoreUpdate(client) {
  console.log('💡 Auto-livescore update disabled (use !live, !fixtures, !livescore commands instead)');
  
  // Check for 1-day notifications every 1 hour
  setInterval(() => {
    checkOneDayNotifications(client);
  }, 60 * 60 * 1000); // 1 hour
  
  // Check for upcoming lineups (3 hours before match) every 30 minutes
  setInterval(() => {
    checkUpcomingLineups(client);
  }, 30 * 60 * 1000); // 30 minutes
  
  // Check for live match updates every 5 minutes
  setInterval(() => {
    checkLiveMatches(client);
  }, 5 * 60 * 1000); // 5 minutes
  
  console.log('🔔 1-day notification checker started (checks every hour)');
  console.log('📋 Lineup checker started (checks every 30 minutes)');
  console.log('🔴 Live match tracker started (checks every 5 minutes)');
}


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
    const args = content.slice(PREFIX.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();
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
\`!newmovies [trang]\` hoặc \`!newphim [trang]\`

**Ví dụ:**
• \`!newmovies\` - Hiển thị phim mới trang 1
• \`!newmovies 2\` - Hiển thị phim mới trang 2
• \`!newmovies 3\` - Hiển thị phim mới trang 3

**Tính năng:**
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
      
      let currentPage = args.length > 0 ? parseInt(args[0]) : 1;
      
      if (isNaN(currentPage) || currentPage < 1) {
        message.reply('❌ Trang phải là số nguyên dương! Ví dụ: `!newmovies 1`\n\n💡 Gõ `!newmovies help` để xem hướng dẫn chi tiết');
        replied = true;
        return;
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
            
            // Build the title with English name if available
            let titleDisplay = `**${idx + 1}. ${displayTitle}**`;
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
      console.log('🔍 Search command triggered with args:', args);
      
      // Combine args into keyword first
      const keyword = args.join(' ').trim();
      
      // Check if asking for help
      if (!keyword || keyword.toLowerCase() === 'help') {
        const helpText = `
📌 **Hướng Dẫn Lệnh Tìm Kiếm Phim**

**Cú pháp:**
\`!search <tên phim>\`

**Ví dụ:**
• \`!search avatar\` - Tìm phim "avatar"
• \`!search the marvel\` - Tìm phim "the marvel"
• \`!search mưa đỏ\` - Tìm phim "mưa đỏ"

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
      
      console.log('📝 Searching for:', keyword);
      
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

        // Limit to 10 results
        const movies = searchResults.slice(0, 10);
        
        const embed = new EmbedBuilder()
          .setColor('#e50914') // Netflix red
          .setTitle(`🎬 Kết Quả Tìm Kiếm: "${keyword}"`)
          .setDescription(`Tìm thấy **${movies.length}** phim`)
          .setTimestamp()
          .setFooter({ text: 'Movie Search | phim.nguonc.com' });

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
          
          // Build the title with English name if available
          let titleDisplay = `**${idx + 1}. ${displayTitle}**`;
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

        await message.reply({ embeds: [embed] });
        console.log('✅ Search results sent successfully');
        
      } catch (error) {
        console.error('❌ Lỗi tìm kiếm phim:', error.message);
        await message.reply('❌ Có lỗi xảy ra khi tìm kiếm phim. Vui lòng thử lại!');
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
