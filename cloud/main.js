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
