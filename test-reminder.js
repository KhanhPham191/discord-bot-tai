const axios = require('axios');
require('dotenv').config();

const FOOTBALL_API_URL = process.env.FOOTBALL_API_URL || 'https://api.football-data.org/v4'\;
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;

async function getFixtures(teamId) {
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
      
      const teamMatches = (compRes.data.matches || []).filter(m => 
        m.homeTeam.id === teamId || m.awayTeam.id === teamId
      );
      
      allMatches.push(...teamMatches);
    } catch (e) {}
  }
  
  return allMatches.sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
}

async function test() {
  const now = new Date();
  const ninetyMinutesLater = new Date(now.getTime() + 90 * 60000);
  
  console.log('🕐 Current time (UTC):', now.toISOString());
  console.log('⏰ 90 min later (UTC):', ninetyMinutesLater.toISOString());
  console.log('🇻🇳 Current time (VN):', new Date(now.getTime() + 7*60*60000).toLocaleString());
  console.log('');
  
  // Test Chelsea (ID: 61)
  const matches = await getFixtures(61);
  const upcoming = matches.filter(m => {
    const matchTime = new Date(m.utcDate);
    return matchTime >= now && matchTime <= ninetyMinutesLater;
  });
  
  console.log('📅 Chelsea upcoming matches in 90 min:');
  upcoming.forEach(m => {
    const matchTime = new Date(m.utcDate);
    console.log(`  🔥 ${matchTime.toISOString()}: ${m.homeTeam.name} vs ${m.awayTeam.name}`);
  });
  
  if (upcoming.length === 0) {
    console.log('  ❌ No matches in 90 min window');
  }
}

test();
