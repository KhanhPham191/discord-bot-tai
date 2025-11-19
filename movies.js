const axios = require('axios');

// Movie search function with release year
async function searchMovies(keyword) {
  try {
    const response = await axios.get('https://phim.nguonc.com/api/films/search', {
      params: { keyword: keyword }
    });
    
    const items = response.data.items || [];
    
    // Try to fetch release year from year endpoint for each movie
    const moviesWithYear = await Promise.all(items.map(async (item) => {
      try {
        // Try to get release year from nam-phat-hanh endpoint
        const yearResponse = await axios.get(`https://phim.nguonc.com/api/films/nam-phat-hanh/${item.created.split('-')[0]}?page=1`);
        const yearItems = yearResponse.data.items || [];
        const found = yearItems.find(m => m.slug === item.slug);
        
        if (found) {
          return {
            ...item,
            year: item.created.split('-')[0]
          };
        }
      } catch (e) {
        // Fallback if year endpoint fails
      }
      
      // Fallback: extract year from other sources
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
    
    // Extract year from description if year field is null
    let year = movie.year;
    if (!year && movie.description) {
      const yearMatch = movie.description.match(/(\d{4})/);
      if (yearMatch) year = yearMatch[1];
    }
    
    // If still no year, extract from created date
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
