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

// Get match lineup
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

module.exports = {
  getTeamById,
  getCompetitionMatches,
  getLiveScore,
  getStandings,
  getFixtures,
  getFixturesWithCL,
  getLiveMatches,
  getMatchLineup,
  FOOTBALL_API_URL,
  FOOTBALL_API_KEY
};
