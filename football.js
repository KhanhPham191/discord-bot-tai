const axios = require('axios');

const FOOTBALL_API_URL = process.env.FOOTBALL_API_URL || 'https://api.football-data.org/v4';
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;

// Get team info
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

// Get competition matches
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

// Get live score for a team
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

// Get standings for a competition
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

// Get fixtures for a team
async function getFixtures(teamId, next = 10) {
  try {
    // First try team endpoint (requires higher subscription tier)
    try {
      const response = await axios.get(`${FOOTBALL_API_URL}/teams/${teamId}/matches`, {
        headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
        params: { 
          status: 'SCHEDULED,LIVE',
          limit: 50
        }
      });
      
      let matches = response.data.matches || [];
      if (matches.length > 0) {
        console.log(`✅ Got ${matches.length} matches from team endpoint for team ${teamId}`);
        return matches.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate)).slice(0, next);
      }
    } catch (teamError) {
      console.log(`ℹ️ Team endpoint restricted (free tier). Switching to competitions endpoint...`);
    }
    
    // Fallback: fetch from competitions for free tier
    const competitions = ['PL', 'EL1', 'SA', 'BL1', 'FL1', 'CL', 'ELC'];
    const allMatches = [];
    
    for (const compCode of competitions) {
      try {
        const compRes = await axios.get(`${FOOTBALL_API_URL}/competitions/${compCode}/matches`, {
          headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
          params: { 
            status: 'SCHEDULED,LIVE',
            limit: 50
          }
        });
        
        // Filter matches for this team
        const teamMatches = (compRes.data.matches || []).filter(m => 
          m.homeTeam.id === teamId || m.awayTeam.id === teamId
        );
        
        allMatches.push(...teamMatches);
      } catch (e) {
        // Skip if competition not available
      }
    }
    
    const matches = allMatches.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
    console.log(`✅ Found ${matches.length} matches from competitions for team ${teamId}`);
    
    if (matches.length === 0) {
      console.log(`ℹ️ No upcoming matches for team ${teamId}`);
      return [];
    }
    
    return matches.slice(0, next);
  } catch (e) {
    console.error(`❌ Error fetching fixtures (team ${teamId}):`, e.response?.data?.message || e.message);
    return [];
  }
}

// Get fixtures including Champions League
async function getFixturesWithCL(teamId, next = 10) {
  try {
    // The team endpoint already includes all competitions (league + CL)
    // So we just call getFixtures directly
    const matches = await getFixtures(teamId, next);
    return matches;
  } catch (e) {
    console.error(`❌ Error fetching fixtures:`, e.message);
    return [];
  }
}

// Get live matches for a competition
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

// Get match lineup (full details with formations and players)
// Note: Lineup data is only available after match starts (status = IN_PLAY or finished)
async function getMatchLineup(matchId) {
  try {
    const response = await axios.get(`${FOOTBALL_API_URL}/matches/${matchId}`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
    });
    
    const match = response.data;
    
    // Check if lineup data is available (only for live/finished matches)
    if (!match.homeTeamLineup && !match.awayTeamLineup) {
      // Try to get from /teams/{id}/matches endpoint for more detail
      const homeTeamResponse = await axios.get(`${FOOTBALL_API_URL}/teams/${match.homeTeam.id}/matches/${matchId}`, {
        headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
      }).catch(() => null);
      
      if (!homeTeamResponse) {
        return {
          id: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          utcDate: match.utcDate,
          competition: match.competition,
          status: match.status,
          homeTeamLineup: [],
          awayTeamLineup: [],
          homeTeamFormation: 'N/A',
          awayTeamFormation: 'N/A',
          lineupNotAvailable: true,
          message: `Line-up chưa được công bố. Trạng thái: ${match.status}`
        };
      }
      
      return {
        id: match.id,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        utcDate: match.utcDate,
        competition: match.competition,
        status: match.status,
        homeTeamLineup: homeTeamResponse.data.homeTeamLineup || [],
        awayTeamLineup: homeTeamResponse.data.awayTeamLineup || [],
        homeTeamFormation: homeTeamResponse.data.homeTeamFormation || 'N/A',
        awayTeamFormation: homeTeamResponse.data.awayTeamFormation || 'N/A'
      };
    }
    
    return {
      id: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      utcDate: match.utcDate,
      competition: match.competition,
      status: match.status,
      homeTeamLineup: match.homeTeamLineup || [],
      awayTeamLineup: match.awayTeamLineup || [],
      homeTeamFormation: match.homeTeamFormation || 'N/A',
      awayTeamFormation: match.awayTeamFormation || 'N/A'
    };
  } catch (e) {
    console.error(`❌ Lỗi lấy line-up (match ${matchId}):`, e.response?.data?.message || e.message);
    return null;
  }
}

// Get match events (goals, cards, corners)
async function getMatchEvents(matchId) {
  try {
    const response = await axios.get(`${FOOTBALL_API_URL}/matches/${matchId}`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
    });
    
    const match = response.data;
    
    return {
      id: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      score: match.score,
      goals: match.goals || [],
      cards: match.cards || [],
      corners: match.corners || []
    };
  } catch (e) {
    console.error(`❌ Lỗi lấy match events (match ${matchId}):`, e.response?.data?.message || e.message);
    return null;
  }
}

// Format match events for Discord embed
function formatMatchEvents(match) {
  const events = [];
  
  // Goals
  if (match.goals && match.goals.length > 0) {
    for (const goal of match.goals) {
      const team = goal.team.name;
      const minute = goal.minute + (goal.minuteExtra ? `+${goal.minuteExtra}` : '');
      const assist = goal.assist ? ` (Assist: ${goal.assist.name})` : '';
      events.push(`⚽ **${minute}'** - ${goal.scorer.name} (${team})${assist}`);
    }
  }
  
  // Cards
  if (match.cards && match.cards.length > 0) {
    for (const card of match.cards) {
      const team = card.team.name;
      const minute = card.minute + (card.minuteExtra ? `+${card.minuteExtra}` : '');
      const cardType = card.cardType === 'YELLOW_CARD' ? '🟨' : '🟥';
      events.push(`${cardType} **${minute}'** - ${card.player.name} (${team})`);
    }
  }
  
  // Corners
  if (match.corners && match.corners.length > 0) {
    for (const corner of match.corners) {
      const team = corner.team.name;
      const minute = corner.minute + (corner.minuteExtra ? `+${corner.minuteExtra}` : '');
      events.push(`🏁 **${minute}'** - Corner (${team})`);
    }
  }
  
  return events;
}

module.exports = {
  getTeamById,
  getCompetitionMatches,
  getLiveScore,
  getStandings,
  getFixtures,
  getFixturesWithCL,
  getLiveMatches,
  getMatchLineup,
  getMatchEvents,
  formatMatchEvents,
  FOOTBALL_API_URL,
  FOOTBALL_API_KEY
};
