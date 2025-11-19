const axios = require('axios');

// Movie search function with release year from detail endpoint
async function searchMovies(keyword) {
  try {
    const response = await axios.get('https://phim.nguonc.com/api/films/search', {
      params: { keyword: keyword }
    });
    
    const items = response.data.items || [];
    
    // Fetch release year from detail endpoint for each movie
    const moviesWithYear = await Promise.all(items.map(async (item) => {
      try {
        const detail = await getMovieDetail(item.slug);
        if (detail && detail.year && detail.year !== 'N/A') {
          return {
            ...item,
            year: detail.year
          };
        }
      } catch (e) {
        console.log(`⚠️ Could not fetch detail for ${item.slug}: ${e.message}`);
      }
      
      // Fallback if detail fails
      return {
        ...item,
        year: extractYearFromMovie(item)
      };
    }));
    
    return moviesWithYear;
  } catch (error) {
    console.error('❌ Lỗi API tìm kiếm phim:', error.response?.data?.message || error.message);
    return [];
  }
}

// Search movies by release year
async function searchMoviesByYear(year, page = 1) {
  try {
    const response = await axios.get(`https://phim.nguonc.com/api/films/nam-phat-hanh/${year}?page=${page}`);
    
    const items = response.data.items || [];
    
    return items.map(item => ({
      ...item,
      year: year
    }));
  } catch (error) {
    console.error(`❌ Lỗi API tìm phim theo năm ${year}:`, error.response?.data?.message || error.message);
    return [];
  }
}

// Extract year from movie data
function extractYearFromMovie(movie) {
  // First try to get year field directly
  if (movie.year) {
    return movie.year;
  }
  
  // Try to extract year from description
  if (movie.description) {
    const yearMatch = movie.description.match(/(\d{4})/);
    if (yearMatch) return yearMatch[1];
  }
  
  // Try to extract from created date
  if (movie.created) {
    return movie.created.split('-')[0];
  }
  
  // Try to extract from modified date
  if (movie.modified) {
    return movie.modified.split('-')[0];
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

// Get detailed movie info (with watch source)
async function getMovieDetail(slug) {
  try {
    const response = await axios.get(`https://phim.nguonc.com/api/film/${slug}`);
    
    const movie = response.data.movie || {};
    
    // Extract year from movie - try multiple methods
    let year = movie.year;
    
    // If year field is null, try to extract from description
    if (!year && movie.description) {
      // Look for year patterns in description like "năm 2015", "2015", "bộ phim 2015" etc
      const patterns = [
        /năm\s+(\d{4})/i,           // "năm 2015"
        /phát hành\s+(\d{4})/i,     // "phát hành 2015"
        /release.*?(\d{4})/i,        // "release 2015"
        /(\d{4})\s+film/i,           // "2015 film"
        /^(\d{4})/,                  // Year at start of description
        /(\d{4})/                    // Any 4-digit number
      ];
      
      for (const pattern of patterns) {
        const match = movie.description.match(pattern);
        if (match && match[1]) {
          const possibleYear = parseInt(match[1]);
          // Only accept years between 1900 and current year
          if (possibleYear >= 1900 && possibleYear <= new Date().getFullYear()) {
            year = possibleYear.toString();
            break;
          }
        }
      }
    }
    
    // If still no year, fallback to created date
    if (!year && movie.created) {
      year = movie.created.split('-')[0];
    }
    
    return {
      name: movie.name,
      original_name: movie.original_name,
      slug: movie.slug,
      thumb_url: movie.thumb_url,
      poster_url: movie.poster_url,
      description: movie.description,
      quality: movie.quality,
      language: movie.language,
      time: movie.time,
      year: year || 'N/A',
      director: movie.director,
      casts: movie.casts,
      total_episodes: movie.total_episodes,
      current_episode: movie.current_episode,
      episodes: movie.episodes || [] // Array of episodes with watch sources
    };
  } catch (error) {
    console.error('❌ Lỗi API lấy chi tiết phim:', error.response?.data?.message || error.message);
    return null;
  }
}

module.exports = {
  searchMovies,
  searchMoviesByYear,
  getNewMovies,
  getMovieDetail,
  extractYearFromMovie
};
