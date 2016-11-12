(function() {

  function inviteController($scope, $rootScope, $stateParams, $state, quizService, inviteService) {
    inviteVm = this;

    inviteVm.newInvite = {};
    mainVm.pageName = "invite-page"

    // FUNCTION DECLARATION
    inviteVm.getAllQuizes = getAllQuizes;
    inviteVm.inviteCandidate = inviteCandidate;
    inviteVm.removeSelectedQuiz = removeSelectedQuiz;
    inviteVm.setMinDate = setMinDate;
    inviteVm.resetForm = resetForm;
    inviteVm.invalidateInput = invalidateInput;
    inviteVm.preSeleteQuiz = preSeleteQuiz;


    function getAllQuizes(quizID) {
      if (!inviteVm.allQuizes) {
        quizService.getAllQuizes().then(function(data) {
          inviteVm.allQuizes = data.debug[0].quiz;

          preSeleteQuiz(quizID);
        }, function(err) {
          console.log(err);
        })
      } else {
        preSeleteQuiz(quizID);
      }
    }

    function preSeleteQuiz(quizID) {
      if (quizID) {
        var qLen = inviteVm.allQuizes.length;
        for (var i = 0; i < qLen; i++) {
          if (inviteVm.allQuizes[i]._uid_ == quizID) {
            inviteVm.newInvite.quiz = inviteVm.allQuizes[i];
            break;
          }
        }
      }
    }

    function setMinDate() {
      setTimeout(function() {
        $datePicker = $("#datePicker")
        var today = new Date();
        $datePicker.attr("min", formatDate(new Date()));


        inviteVm.newInvite.dates = new Date(today.setDate(today.getDate() + 7));
        // $datePicker.val(formatDate(inviteVm.newInvite.dates));
      }, 100);
    }

    // FUNCTION DEFINITION

    function inviteCandidate() {
      var invalidateInput = inviteVm.invalidateInput(inviteVm.newInvite);

      if (invalidateInput) {
        SNACKBAR({
          message: invalidateInput,
          messageType: "error",
        })
        return
      }

      var dateTime = formatDate(inviteVm.newInvite.dates);
      inviteVm.newInvite.quiz_id = inviteVm.newInvite.quiz._uid_;
      inviteVm.newInvite.validity = dateTime;

      inviteService.alreadyInvited(inviteVm.newInvite.quiz_id, inviteVm.newInvite.email).then(function(invited) {
        if (invited) {
          SNACKBAR({
            message: "Candidate has already been invited.",
            messageType: "error",
          })
          return
        } else {
          inviteService.inviteCandidate(inviteVm.newInvite).then(function(data) {
            SNACKBAR({
              message: data.Message,
              messageType: "success",
            });
            if (data.Success) {
              $state.transitionTo("invite.dashboard", {
                quizID: inviteVm.newInvite.quiz_id,
              })
              inviteVm.newInvite = {}
            }
          }, function(err) {
            console.log(err)
          });
        }
      })
    }

    function invalidateInput(inputs) {
      if (!isValidEmail(inputs.email)) {
        return "Please Enter Valid Email";
      }
      if (!inputs.dates) {
        return "Please Enter Valid Date";
      }
      return false
    }

    function removeSelectedQuiz() {
      delete inviteVm.newInvite.quiz;
    }
    $(document).ready(function() {
      $('#datePicker').val(new Date().toDateInputValue());
    })

    function resetForm() {
      inviteVm.removeSelectedQuiz();
    }
  }

  function addCandidatesController($state, $stateParams) {
    acVm = this;
    var quizID = $state.params.quizID;

    inviteVm.setMinDate();
    inviteVm.getAllQuizes(quizID);
  }


  function editInviteController($rootScope, $stateParams, $state, quizService, inviteService) {
    editInviteVm = this;
    var candidateUID = $stateParams.candidateID;
    editInviteVm.quizID = $stateParams.quizID;

    //Function Declation
    editInviteVm.editInvite = editInvite;
    editInviteVm.initAllQuiz = initAllQuiz;
    editInviteVm.selectedQuiz = selectedQuiz;
    editInviteVm.onQuizChange = onQuizChange;
    editInviteVm.goToDashboard = goToDashboard;

    inviteVm.setMinDate();
    inviteVm.getAllQuizes();

    if (!candidateUID) {
      SNACKBAR({
        message: "Not a valid candidate",
        messageType: "error",
      })
      $state.transitionTo("invite.add");
    }

    inviteService.getCandidate(candidateUID)
      .then(function(data) {
        editInviteVm.candidateBak = data['quiz.candidate'][0];
        editInviteVm.candidate = angular.copy(editInviteVm.candidateBak);
        editInviteVm.candidate.dates = new Date(getDate(editInviteVm.candidate.validity));

        editInviteVm.initAllQuiz();
      }, function(err) {
        console.log(err)
      });

    function editInvite() {
      editInviteVm.candidate.id = candidateUID;
      editInviteVm.candidate.quiz_id = "";
      editInviteVm.candidate.old_quiz_id = "";
      editInviteVm.candidate.validity = formatDate(editInviteVm.candidate.dates);

      var invalidateInput = inviteVm.invalidateInput(editInviteVm.candidate);
      if (invalidateInput) {
        SNACKBAR({
          message: invalidateInput,
          messageType: "error",
        })
        return
      }

      if (editInviteVm.candidate['candidate.quiz'][0].is_delete) {
        editInviteVm.candidate.quiz_id = editInviteVm.candidate.quiz._uid_;
        editInviteVm.candidate.old_quiz_id = editInviteVm.quizID;
      }

      var requestData = angular.copy(editInviteVm.candidate);

      function update() {
        inviteService.editInvite(requestData)
          .then(function(data) {
            SNACKBAR({
              message: data.Message,
              messageType: "success",
            })
            $state.transitionTo("invite.dashboard", {
              quizID: editInviteVm.quizID,
            })
          }, function(err) {
            console.log(err)
          })
      }

      // If either the email or the quiz changes, we wan't to validate that the email
      // shouldn't be already invited to this quiz.
      if (editInviteVm.candidateBak.email != editInviteVm.candidate.email || editInviteVm.candidate.quiz._uid_ != editInviteVm.candidateBak["candidate.quiz"][0]._uid_) {
        inviteService.alreadyInvited(editInviteVm.candidate.quiz._uid_, editInviteVm.candidate.email).then(function(invited) {
            if (invited) {
              SNACKBAR({
                message: "Candidate has already been invited.",
                messageType: "error",
              })
              return
            } else {
              // Not invited yet, update.
              update()
            }
          })
          // Both email and quiz are same so maybe validity changed, we update.
      } else {
        update()
      }
    }

    function initAllQuiz() {
      setTimeout(function() {
        editInviteVm.allQuizes = angular.copy(inviteVm.allQuizes);
        $rootScope.updgradeMDL();
        editInviteVm.selectedQuiz()
      }, 100);
    }

    function selectedQuiz() {
      var oldQuiz = editInviteVm.candidate['candidate.quiz'][0]
      var quizLen = editInviteVm.allQuizes.length;
      for (var i = 0; i < quizLen; i++) {
        var quiz = editInviteVm.allQuizes[i];
        if (oldQuiz._uid_ == quiz._uid_) {
          editInviteVm.candidate.quiz = quiz;
          break;
        }
      }
    }

    function onQuizChange(item, model) {
      var oldQuiz = editInviteVm.candidate['candidate.quiz'][0];
      var isOld = oldQuiz._uid_ == model._uid_;

      oldQuiz.is_delete = isOld ? false : true;
    }

    function goToDashboard() {
      $state.transitionTo("invite.dashboard", {
        quizID: editInviteVm.quizID,
      });
    }
  }

  function candidatesController($scope, $rootScope, $stateParams, $state, $timeout, $templateCache, inviteService, moment) {
    candidatesVm = this;
    candidatesVm.sortType = 'score';
    candidatesVm.sortReverse = true;

    candidatesVm.expires = expires;
    candidatesVm.showCancelModal = showCancelModal;
    candidatesVm.initiateCancel = initiateCancel;
    candidatesVm.showDeleteModal = showDeleteModal;
    candidatesVm.initiateDelete = initiateDelete;
    candidatesVm.deleteCandFromArray = deleteFromArray;
    candidatesVm.cancel = cancel;
    candidatesVm.resend = resend;
    candidatesVm.delete = deleteCand;

    candidatesVm.quizID = $stateParams.quizID;

    if (!candidatesVm.quizID) {
      SNACKBAR({
        message: "Not a valid Quiz",
        messageType: "error",
      });
      $state.transitionTo("invite.add");
    }
    inviteService.getInvitedCandidates(candidatesVm.quizID).then(function(data) {
      candidatesVm.quizCandidates = data.quiz[0]["quiz.candidate"];

      if (!candidatesVm.quizCandidates) {
        SNACKBAR({
          message: "Invite Candidate first to see all candidate",
          messageType: "error",
        });
        $state.transitionTo("invite.add", {
          quizID: candidatesVm.quizID,
        });
      } else {
        var i = candidatesVm.quizCandidates.length
        while (i--) {
          var cand = candidatesVm.quizCandidates[i]
          if (cand.deleted === 'true') {
            candidatesVm.quizCandidates.splice(i, 1)
          }
          // TODO
          //- Maybe store invite in a format that frontend directly
          // understands.
          if (cand.complete == "false") {
            cand.invite_sent = new Date(Date.parse(cand.invite_sent)) || '';
            continue;
          }
          cand.quiz_start = new Date(Date.parse(cand.quiz_start)) || '';
          var score = 0.0;
          for (var j = 0; j < cand["candidate.question"].length; j++) {
            score += parseFloat(cand["candidate.question"][j]["candidate.score"]) || 0;
          }
          cand.score = score;
        }
      }
    }, function(err) {
      console.log(err);
    });

    function showCancelModal(candidate) {
      // Timeout to let dirty checking done first then modal content get
      // updated variable text
      candidatesVm.currentCancel = {};
      candidatesVm.currentCancel = candidate;
      $timeout(function() {
        mainVm.openModal({
          template: "cancel-modal-template",
          showYes: true,
          hideClose: true,
          class: "cancel-invite-modal",
        });
      }, 10);
    }

    function initiateCancel() {
      if (candidatesVm.currentCancel) {
        candidatesVm.cancel(candidatesVm.currentCancel);
      }
    }

    function showDeleteModal(candidate) {
      candidatesVm.currentDeleteName = candidate.name;
      candidatesVm.currentDelete = candidate._uid_;
      $timeout(function() {
        mainVm.openModal({
          template: "delete-candidate-template",
          showYes: true,
          hideClose: true,
          class: "delete-candidate-modal",
        });
      }, 10);
    }

    function initiateDelete() {
      if (candidatesVm.currentDelete) {
        candidatesVm.delete(candidatesVm.currentDelete);
      }
    }

    function expires(validity) {
      var numDays = moment(validity).diff(moment(), 'days')
      if (numDays == 0) {
        return "Today"
      } else if (numDays > 0) {
        return numDays
      }
      return "Expired"
    }

    function deleteFromArray(candidateID) {
      var idx = -1
      for (var i = 0; i < candidatesVm.quizCandidates.length; i++) {
        if (candidatesVm.quizCandidates[i]._uid_ == candidateID) {
          idx = i;
          break;
        }
      }
      if (idx >= 0) {
        candidatesVm.quizCandidates.splice(idx, 1)
      }
    }

    function cancel(candidate) {
      inviteService.cancelInvite(candidate, candidatesVm.quizID).then(function(cancelled) {
        if (!cancelled) {
          SNACKBAR({
            message: "Invite could not be cancelled.",
            messageType: "error",
          })
          return
        }
        SNACKBAR({
          message: "Invite cancelled successfully.",
        })
        deleteFromArray(candidate._uid_)
        $state.transitionTo("invite.dashboard", {
          quizID: candidatesVm.quizID,
        })

        candidatesVm.currentCancel = {};
        mainVm.hideModal();
      })
    }

    function deleteCand(candidateId) {
      inviteService.deleteCand(candidateId).then(function(deleted) {
        if (!deleted) {
          SNACKBAR({
            message: "Candidate couldn't be deleted.",
            messageType: "error",
          })
          return
        }
        SNACKBAR({
          message: "Candidate deleted successfully.",
        })

        deleteFromArray(candidateId)
        $state.transitionTo("invite.dashboard", {
          quizID: candidatesVm.quizID,
        })

        candidatesVm.currentDelete = "";
        mainVm.hideModal();
      }, function(err) {
        console.log(error)
        candidatesVm.currentDelete = "";
        mainVm.hideModal();
      })
    }

    function resend(candidateID) {
      inviteService.resendInvite(candidateID).then(function(response) {
        if (!response.success) {
          SNACKBAR({
            message: response.message,
            messageType: "error",
          })
          return
        }
        SNACKBAR({
          message: response.message
        })
        $state.transitionTo("invite.dashboard", {
          quizID: candidatesVm.quizID,
        })
      })
    }
  }

  function candidateReportController($rootScope, $stateParams, $state, inviteService) {
    cReportVm = this;
    cReportVm.candidateID = $stateParams.candidateID;

    // Function
    cReportVm.initScoreCircle = initScoreCircle;

    if (!cReportVm.candidateID) {
      cReportVm.inValidID = true;
      return
    }

    inviteService.getReport(cReportVm.candidateID)
      .then(function(data) {
        for (var i = 0; i < data.questions.length; i++) {
          if (data.questions[i].time_taken != "-1") {
            data.questions[i].parsedTime = mainVm.parseGoTime(data.questions[i].time_taken)
          }
        }
        cReportVm.info = data;
        cReportVm.timeTaken = mainVm.parseGoTime(cReportVm.info.time_taken);
        cReportVm.info.feedback = unescape(cReportVm.info.feedback)

        cReportVm.initScoreCircle();
      }, function(error) {
        console.log(error);
      })

    function initScoreCircle() {
      var circleWidth = 2 * Math.PI * 30;

      var percentage = (cReportVm.info.total_score * 100) / cReportVm.info.max_score;

      var circlePercentage = (circleWidth * percentage) / 100;

      var circleProgressWidth = circleWidth - circlePercentage;

      $progressBar = $(".prograss-circle");
      if (cReportVm.info.total_score != 0) {
        $progressBar.css({
          'display': 'block'
        });
        if (cReportVm.info.total_score < 0) {
          $progressBar.css({
            'stroke': 'red'
          });
        }
      }
      setTimeout(function() {
        $progressBar.css({
          'stroke-dashoffset': circleProgressWidth
        });
      }, 100);
    }
  }

  var candidateReportDependency = [
    "$rootScope",
    "$stateParams",
    "$state",
    "inviteService",
    candidateReportController
  ];
  angular.module('GruiApp').controller('candidateReportController', candidateReportDependency);

  var candidatesDependency = [
    "$scope",
    "$rootScope",
    "$stateParams",
    "$state",
    "$timeout",
    "$templateCache",
    "inviteService",
    "moment",
    candidatesController
  ];
  angular.module('GruiApp').controller('candidatesController', candidatesDependency);

  var addCandidatesDependency = [
    "$state",
    addCandidatesController
  ];
  angular.module('GruiApp').controller('addCandidatesController', addCandidatesDependency);

  var editInviteDependency = [
    "$rootScope",
    "$stateParams",
    "$state",
    "quizService",
    "inviteService",
    editInviteController
  ];
  angular.module('GruiApp').controller('editInviteController', editInviteDependency);

  var inviteDependency = [
    "$scope",
    "$rootScope",
    "$stateParams",
    "$state",
    "quizService",
    "inviteService",
    inviteController
  ];
  angular.module('GruiApp').controller('inviteController', inviteDependency);

})();
