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
