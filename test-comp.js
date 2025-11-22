const axios = require('axios');
require('dotenv').config();

const FOOTBALL_API_URL = process.env.FOOTBALL_API_URL || 'https://api.football-data.org/v4'\;
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;

async function test() {
  try {
    // Get Chelsea info
    const teamRes = await axios.get(`${FOOTBALL_API_URL}/teams/61`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
    });
    
    console.log('Chelsea info:');
    console.log('Name:', teamRes.data.name);
    console.log('Running competitions:', teamRes.data.runningCompetitions?.length || 0);
    
    // Try PL
    console.log('\nChecking Premier League matches...');
    const plRes = await axios.get(`${FOOTBALL_API_URL}/competitions/PL/matches`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
      params: { 
        status: 'SCHEDULED,LIVE',
        limit: 100
      }
    });
    
    const chelseaMatches = plRes.data.matches.filter(m => 
      m.homeTeam.id === 61 || m.awayTeam.id === 61
    );
    
    console.log('Total PL matches:', plRes.data.matches.length);
    console.log('Chelsea matches in PL:', chelseaMatches.length);
    
    if (chelseaMatches.length > 0) {
      console.log('\nUpcoming Chelsea matches:');
      chelseaMatches.slice(0, 3).forEach(m => {
        console.log(`${m.utcDate}: ${m.homeTeam.name} vs ${m.awayTeam.name}`);
      });
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

test();
