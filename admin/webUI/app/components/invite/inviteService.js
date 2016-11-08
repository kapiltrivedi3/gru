(function() {

  function inviteService($q, $http, $rootScope, MainService) {

    var services = {}; //Object to return

    services.inviteCandidate = function(data) {
      return MainService.post('/candidate', data);
    }

    services.getInvitedCandidates = function(data) {
      return MainService.get('/candidates?quiz_id=' + data);
    }

    services.getCandidate = function(data) {
      return MainService.get('/candidate/' + data);
    }

    services.editInvite = function(data) {
      return MainService.put('/candidate/' + data.id, data);
    }

    services.getReport = function(candidateID) {
      return MainService.get('/candidate/report/' + candidateID);
    }

    services.alreadyInvited = function(quizId, email) {
      var deferred = $q.defer();
      // TODO - User filter on email after incorporating Dgraph schema.
      var query = "{\
                  quiz(_uid_: " + quizId + ") {\
                          quiz.candidate {\
                                  cancel\
                                  email\
                          }\
                  }\
          }"

      services.proxy(query).then(function(data) {
        var candidates = data.quiz[0]["quiz.candidate"];
        if (candidates) {
          for (var i = 0; i < candidates.length; i++) {
            if (candidates[i].cancel === 'true') {
              continue
            }
            if (candidates[i].email === email) {
              return deferred.resolve(true);
            }
          }
        }
        return deferred.resolve(false);
      });
      return deferred.promise;
    }

    services.resendInvite = function(candidateID) {
      var deferred = $q.defer();
      // TODO - User filter on email after incorporating Dgraph schema.
      var query = "{\
        quiz.candidate(_uid_: " + candidateID + ") {\
          email\
          token\
          validity\
        }\
      }"

      services.proxy(query).then(function(data) {
        var candidate = data["quiz.candidate"][0];
        if (candidate == null) {
          return deferred.resolve({
            success: false,
            message: "No candidate found."
          });
        }
        return candidate
      }).then(function(candidate) {
        var paylaod = {
          "email": candidate.email,
          "token": candidate.token,
          "validity": candidate.validity
        }
        MainService.post('/candidate/invite/' + candidateID, paylaod).then(function(data) {
          return deferred.resolve({
            sucess: true,
            message: data.Message
          })
        })
      });
      return deferred.promise;
    }

    services.cancelInvite = function(candidateID) {
      var deferred = $q.defer();
      var mutation = "mutation {\
                    set {\
                      <_uid_:" + candidateID + "> <cancel> \"true\" .\
                    }\
          }"

      services.proxy(mutation).then(function(data) {
        if (data.code == "ErrorOk") {
          return deferred.resolve(true);
        }
        return deferred.resolve(false);
      });
      return deferred.promise;
    }


    // TODO - Move to a location where other services can access this.
    services.proxy = function(data) {
      return MainService.post('/proxy', data);
    }

    return services;

  }

  var inviteServiceArray = [
    "$q",
    "$http",
    "$rootScope",
    "MainService",
    inviteService
  ];

  angular.module('GruiApp').service('inviteService', inviteServiceArray);

})();
