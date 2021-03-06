var moment = require('cloud/moment');

var tmdbKey = '0d1d0cc3c4aec9ca1c2c8c9e781a7ef1';

Parse.Cloud.define('getSeriesEpisodes', function(request, reply) {
  var seriesId = request.params.seriesId;
  Parse.Cloud.httpRequest({
    url: 'https://api.themoviedb.org/3/tv/' + seriesId,
    params: {
      api_key: tmdbKey
    }
  }).then(function(seriesResponse) {
    var queries = [];
    seriesResponse.data.seasons.forEach(function(season) {
      queries.push(Parse.Cloud.httpRequest({
        url: 'https://api.themoviedb.org/3/tv/' + seriesId + '/season/' + season.season_number,
        params: {
          api_key: tmdbKey
        }
      }));
    }.bind(this));

    Parse.Promise.when(queries).then(function() {
      var args = Array.prototype.slice.call(arguments);
      episodes = [];
      args.forEach(function(season) {
        season.data.episodes.forEach(function(episode) {
          episodes.push(episode);
        }.bind(this));
      }.bind(this));
      reply.success(episodes);
    }.bind(this));
  });
});

Parse.Cloud.define('getSeriesSeasons', function(request, reply) {
  var seriesId = request.params.seriesId;
  Parse.Cloud.httpRequest({
    url: 'https://api.themoviedb.org/3/tv/' + seriesId,
    params: {
      api_key: tmdbKey
    }
  }).then(function(seriesResponse) {
    var queries = [];
    seriesResponse.data.seasons.forEach(function(season) {
      queries.push(Parse.Cloud.httpRequest({
        url: 'https://api.themoviedb.org/3/tv/' + seriesId + '/season/' + season.season_number,
        params: {
          api_key: tmdbKey
        }
      }));
    }.bind(this));

    Parse.Promise.when(queries).then(function() {
      var args = Array.prototype.slice.call(arguments);
      var seasons = [];
      var index = 1;
      args.forEach(function(response) {
        var season = response.data;
        if (!season.name) {
          season.name = 'Season ' + index;
        }
        index++;
        seasons.push(season);
      }.bind(this));
      reply.success(seasons);
    }.bind(this));
  });
});

Parse.Cloud.define('getNextEpisode', function(request, reply) {
  Parse.Cloud.run('getSeriesEpisodes', {seriesId: request.params.seriesId}).then(function(episodes) {
    var result = null;
    episodes.forEach(function(episode) {
      var air_date = moment(episode.air_date);
      if (!result && episode && air_date.isAfter(moment())) {
        result = episode;
      }
    }.bind(this));
    if (result) {
      result.seriesId = request.params.seriesId;
      result.seriesName = request.params.seriesName;
    }
    else {
      result = {
        seriesId: request.params.seriesId,
        seriesName: request.params.seriesName
      }
    }
    return reply.success(result);
  });
});

Parse.Cloud.define('userNextEpisodes', function(request, reply) {
  var user = request.user;
  if (request.params.userId) {
    user = Parse.User.createWithoutData(request.params.userId);
  }
  var query = new Parse.Query('Favorite');
  query.equalTo('user', user);
  query.exists('tmdb_series_id');
  query.find({
    success: function(favorites) {
      var queries = [];

      favorites.forEach(function(favorite) {
        queries.push(Parse.Cloud.run('getNextEpisode', {seriesId: favorite.get('tmdb_series_id'), seriesName: favorite.get('title')}));
      }.bind(this));

      Parse.Promise.when(queries).then(function() {
        var args = Array.prototype.slice.call(arguments);
        reply.success(args);
      });
    }
  });
});

Parse.Cloud.define('similarSeries', function(request, reply) {
  var seriesId = request.params.seriesId;
  Parse.Cloud.httpRequest({
    url: 'https://api.themoviedb.org/3/tv/' + seriesId + '/similar',
    params: {
      api_key: tmdbKey
    }
  }).then(function(apiResponse) {
    reply.success(apiResponse.data);
  }).fail(function() {
    reply.error();
  })
});

Parse.Cloud.define('getVideos', function(request, reply) {
  var mediaId = request.params.mediaId;
  var videoType = request.params.videoType;

  if (videoType == "tv") {
    Parse.Cloud.httpRequest({
      url: 'https://api.themoviedb.org/3/tv/' + mediaId + '/videos',
      params: {
        api_key: tmdbKey
      }
    }).then(function(apiResponse) {
      reply.success(apiResponse.data);
    }).fail(function() {
      reply.error();
    });
  }
  else {
    Parse.Cloud.httpRequest({
      url: 'https://api.themoviedb.org/3/movie/' + mediaId + '/videos',
      params: {
        api_key: tmdbKey
      }
    }).then(function(apiResponse) {
      reply.success(apiResponse.data);
    }).fail(function() {
      reply.error();
    });
  }
});

Parse.Cloud.define('viewedSeriesSeason', function(request, reply) {
  var seriesId = request.params.seriesId;
  var seasonNumber = request.params.seasonNumber;
  Parse.Cloud.httpRequest({
    url: 'https://api.themoviedb.org/3/tv/' + seriesId + '/season/' + seasonNumber,
    params: {
      api_key: tmdbKey
    }
  }).then(function(apiResponse) {
    batch = [];
    apiResponse.data.episodes.forEach(function(episode) {
      var viewed = new Parse.Object('ViewedTvSeriesEpisodes', {
        User: request.user,
        SerieId: parseInt(seriesId),
        SeasonNumber: parseInt(seasonNumber),
        EpisodeNumber: parseInt(episode.episode_number),
        EpisodeId: parseInt(episode.id),
        AirDate: episode.air_date
      });
      var acl = new Parse.ACL();
      acl.setPublicReadAccess(true);
      acl.setPublicWriteAccess(false);
      acl.setWriteAccess(request.user, true);
      viewed.setACL(acl);
      batch.push(viewed);
    }.bind(this));
    console.log(batch);
    Parse.Object.saveAll(batch).then(function() {
      reply.success();
    }).fail(function(error) {
      console.log(error);
      reply.error();
    })
  }.bind(this)).fail(function() {
    reply.error();
  });
});

function getFollowingsFavorites(followings) {
    var result = [];
    var queries = [];
    followings.forEach(function(following) {
      var subquery = new Parse.Query('Favorite');
      subquery.equalTo('user', following.get('other_user'));
      queries.push(subquery);
    }.bind(this));
    var query = Parse.Query.or.apply(Parse.Query, queries);
    query.include('user');
    query.addDescending('updatedAt');
    return query.find();
}

function parseFollowingFavorites(favorites) {
  var result = [];
  favorites.forEach(function(favorite) {
    var date = new Date(favorite.get('updatedAt')).toISOString();
    var image = favorite.get('poster_path');
    var message = favorite.get('user').getUsername() + ' favorited ' + favorite.get('title');
    if (favorite.has('tmdb_movie_id')) {
      var uri = 'kubrick://media/movie/' + favorite.get('tmdb_movie_id');
    }
    else {
      var uri = 'kubrick://media/tv/' + favorite.get('tmdb_series_id');
    }
    result.push({date: date, image: image, message: message, uri: uri});
  }.bind(this));
  return result;
}

Parse.Cloud.define('getTimeline', function(request, response) {
  var followingsQuery = new Parse.Query('Follow');
  followingsQuery.equalTo('user', request.user);
  followingsQuery.find().then(function(followings) {
    if (followings.length == 0) {
      return response.error('User is not following anyone');
    }
    getFollowingsFavorites(followings).then(function(favorites) {
      response.success(parseFollowingFavorites(favorites));
    }.bind(this));
  }.bind(this));
});

Parse.Cloud.define('seasonProgress', function(request, response) {
  Parse.Cloud.run('getSeriesEpisodes', {seriesId: request.params.seriesId}).then(function(results) {
    var episodes = results.filter(function(result) {
      return result.season_number == request.params.seasonNumber;
    }.bind(this));

    var watchedQuery = new Parse.Query('ViewedTvSeriesEpisodes');
    watchedQuery.equalTo('User', request.user);
    watchedQuery.equalTo('SeasonNumber', request.params.seasonNumber);
    watchedQuery.count().then(function(watchedCount) {
      var progress = (watchedCount * 100) / episodes.length;
      return response.success(parseInt(progress));
    });
  }.bind(this));
});

Parse.Cloud.define('seriesProgress', function(request, response) {
  Parse.Cloud.run('getSeriesEpisodes', {seriesId: request.params.seriesId}).then(function(episodes) {
    var watchedQuery = new Parse.Query('ViewedTvSeriesEpisodes');
    var user = Parse.User.createWithoutData(request.params.userId);
    watchedQuery.equalTo('User', user);
    watchedQuery.count().then(function(watchedCount) {
      var progress = (watchedCount * 100) / episodes.length;
      return response.success(parseInt(progress));
    });
  }.bind(this));
});

Parse.Cloud.job("pushUserNext", function(request, status) {
  var query = new Parse.Query(Parse.User);
  query.each(function(user) {
    var pushQuery = new Parse.Query(Parse.Installation);
    pushQuery.equalTo('user', user);
    Parse.Cloud.run('userNextEpisodes', {userId: user.id}).then(function(result) {
      result.forEach(function(item) {
        if (item.air_date) {
          Parse.Push.send({
            where: pushQuery,
            data: {
              title: item.seriesName + ' is going to air',
              alert: item.seriesName + ' airs on ' + item.air_date,
              uri: 'kubrick://media/tv/' + item.seriesId
            }
          });
        }
      });
    });
  });
});

Parse.Cloud.afterSave('Follow', function(request) {
  var username = request.user.getUsername();
  var other_user = request.object.get('other_user');
  var pushQuery = new Parse.Query(Parse.Installation);
  pushQuery.equalTo('user', other_user);
  Parse.Push.send({
    where: pushQuery,
    data: {
      title: username + ' followed you',
      alert: 'Discover his favorites movies and series on Kubrick',
      uri: 'kubrick://profile/' + request.user.id
    }
  });
});

Parse.Cloud.afterSave('Favorite', function(request) {
  var followersQuery = new Parse.Query('Follow');
  console.log(request.object);
  if (request.object.has('tmdb_series_id')) {
    var data = {
      title: request.user.getUsername() + ' favorited ' + request.object.get('title') + ' tv show',
      alert: 'Tap to discover this TV show',
      uri: 'kubrick://media/tv/' + request.object.get('tmdb_series_id')
    }
  }
  else {
    var data = {
      title: request.user.getUsername() + ' favorited ' + request.object.get('title') + ' movie',
      alert: 'Tap to discover this movie',
      uri: 'kubrick://media/movie/' + request.object.get('tmdb_movie_id')
    }
  }
  followersQuery.equalTo('other_user', request.user);
  followersQuery.find().then(function(followers) {
    followers.forEach(function(follower) {
      var pushQuery = new Parse.Query(Parse.Installation);
      pushQuery.equalTo('user', follower.get('user'));
      Parse.Push.send({
        where: pushQuery,
        data: data
      });
    }.bind(this));
  }.bind(this));
});

Parse.Cloud.beforeSave('ViewedTvSeriesEpisodes', function(request, response) {
  var query = new Parse.Query('ViewedTvSeriesEpisodes');
  query.equalTo('User', request.user);
  query.equalTo('EpisodeId', request.object.get('EpisodeId'));
  query.count().then(function(count) {
    if (count > 0) {
      response.error('Episode already marked as watch for this user');
    }
    else {
      response.success();
    }
  }).fail(function(err) {
    console.log(err);
  });
});
