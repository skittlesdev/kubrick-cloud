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
      seasons = [];
      args.forEach(function(season) {
        seasons.push(season.data);
      }.bind(this));
      reply.success(seasons);
    }.bind(this));
  });
});
