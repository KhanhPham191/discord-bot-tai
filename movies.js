const axios = require('axios');

// Movie search function - fetch year from detail endpoint with pagination support
async function searchMovies(keyword, maxResults = 100) {
  try {
    let allMovies = [];
    let page = 1;
    const itemsPerPage = 20; // API usually returns ~20 items per page
    const maxPages = Math.ceil(maxResults / itemsPerPage);
    
    while (allMovies.length < maxResults && page <= maxPages) {
      try {
        const response = await axios.get('https://phim.nguonc.com/api/films/search', {
          params: { 
            keyword: keyword,
            page: page
          }
        });
        
        const items = response.data.items || [];
        
        if (items.length === 0) {
          break; // No more results
        }
        
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
            console.log(`⚠️ Could not fetch detail for ${item.slug}`);
          }
          
          // Fallback to created year
          return {
            ...item,
            year: item.created ? item.created.split('-')[0] : 'N/A'
          };
        }));
        
        allMovies = allMovies.concat(moviesWithYear);
        page++;
      } catch (pageError) {
        console.log(`⚠️ Error fetching page ${page}:`, pageError.message);
        break; // Stop on error
      }
    }
    
    // Return maximum maxResults items
    return allMovies.slice(0, maxResults);
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

// Get detailed movie info (with watch source and release year from category)
async function getMovieDetail(slug) {
  try {
    const response = await axios.get(`https://phim.nguonc.com/api/film/${slug}`);
    
    const movie = response.data.movie || {};
    
    // Extract year from category > "Năm" group
    let year = movie.year;
    if (!year && movie.category) {
      // Find the category group with name "Năm"
      for (const key in movie.category) {
        if (movie.category[key].group.name === 'Năm' && movie.category[key].list.length > 0) {
          year = movie.category[key].list[0].name; // Get first year entry
          break;
        }
      }
    }
    
    // Extract watch source from first episode
    let watchSource = null;
    if (movie.episodes && movie.episodes.length > 0) {
      const firstServer = movie.episodes[0];
      if (firstServer.items && firstServer.items.length > 0) {
        watchSource = firstServer.items[0].embed; // Get first episode embed link
      }
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
      watchSource: watchSource,
      category: movie.category || {}, // Include category for type detection
      episodes: movie.episodes || [] // Array of episodes with watch sources
    };
  } catch (error) {
    console.error('❌ Lỗi API lấy chi tiết phim:', error.response?.data?.message || error.message);
    return null;
  }
}

// Get episodes for a movie with pagination and server selection
async function getEpisodes(slug, page = 1, serverIndex = 0) {
  try {
    const detail = await getMovieDetail(slug);
    if (!detail || !detail.episodes) {
      return { episodes: [], totalPages: 0, currentPage: 1, totalEpisodes: 0, serverName: '' };
    }

    // Get episodes from specified server (default: first server = Vietsub)
    const selectedServer = detail.episodes[serverIndex] || detail.episodes[0];
    const allEpisodes = selectedServer.items || [];

    const totalEpisodes = allEpisodes.length;
    const itemsPerPage = 10;
    const totalPages = Math.ceil(totalEpisodes / itemsPerPage);
    const startIdx = (page - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const paginatedEpisodes = allEpisodes.slice(startIdx, endIdx);

    return {
      episodes: paginatedEpisodes,
      totalPages,
      currentPage: page,
      totalEpisodes,
      movieName: detail.name,
      movieYear: detail.year,
      serverName: selectedServer.server_name,
      availableServers: detail.episodes.map(s => s.server_name)
    };
  } catch (error) {
    console.error('❌ Lỗi API lấy danh sách tập:', error.message);
    return { episodes: [], totalPages: 0, currentPage: 1, totalEpisodes: 0, serverName: '' };
  }
}

module.exports = {
  searchMovies,
  searchMoviesByYear,
  getNewMovies,
  getMovieDetail,
  getEpisodes,
  extractYearFromMovie
};
