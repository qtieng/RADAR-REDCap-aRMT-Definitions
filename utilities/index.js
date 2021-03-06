var _ = require('underscore');
var request = require('request');
var GitHubApi = require('github');

function REDCapConvertor(redcap_json) {

    var self = this;
    this.splitChoices = function(rawContent) {

        var arrayOfObjectsAndCodes = [];
        _.each(rawContent, function(value, key) {
            if (rawContent[key].select_choices_or_calculations && rawContent[key].select_choices_or_calculations.split) {

                var arrayOfObjectsAndCodes = [];

                rawContent[key].select_choices_or_calculations = rawContent[key].select_choices_or_calculations.split('|');

                _.each(rawContent[key].select_choices_or_calculations, function(value2, key2) {
                    arrayOfObjectsAndCodes.push({
                        code: value2.split(",")[0],
                        label: value2.split(",")[1]
                    });
                })

                rawContent[key].select_choices_or_calculations = arrayOfObjectsAndCodes;
            }
        });
        return rawContent;
    };

    this.reformatBranchingLogic = function(branchingLogic) {
        var formattedBranchingLogic = null;
        if (branchingLogic) {
            formattedBranchingLogic =
                branchingLogic.replace(/\[/g, '|')
                .replace(/\]/g, '|')
                .replace(/=/g, '==|')
                .replace(/ or /g, '|or')
                .replace(/ and /g, '|and')
                .replace(/<>/g, '!=|')
                .split('|')
                .splice(1);
        }
        return formattedBranchingLogic
    };

    this.parseItemLogic = function(branchingLogicArray) {
        var logicToEvaluate = '';
        var checkboxOrRadio = '';
        var checkboxValue = '';

        if (branchingLogicArray && branchingLogicArray.length > 0) {
            _.each(branchingLogicArray, function(value2, key2) {
                if (key2 % 4 === 0) {
                    if (value2.indexOf('(') === -1) {
                        checkboxOrRadio = 'radio';
                    } else {
                        checkboxOrRadio = 'checkbox';
                        checkboxValue = value2.split('(')[1].split(')')[0];
                    }
                    logicToEvaluate += "responses['" + value2.split('(')[0] + "']";
                } else if (key2 % 4 === 2) {
                    //second variable
                    switch (checkboxOrRadio) {
                        case 'radio':
                            logicToEvaluate += value2 + ' != 0';
                            break;
                        case 'checkbox':
                            logicToEvaluate += checkboxValue + ' != 0';
                            break;
                    }
                } else if (key2 % 4 === 3) {
                    //comparator
                    if (value2 === 'or') {
                        logicToEvaluate += ' || ';
                    } else if (value2 === 'and') {
                        logicToEvaluate += ' && ';

                    }
                }
            });
        }
        return logicToEvaluate;
    };

    this.parseLogic = function(rawContent) {
        _.each(rawContent, function(value, key) {
            rawContent[key].evaluated_logic =
                self.parseItemLogic(self.reformatBranchingLogic(rawContent[key].branching_logic));
        });

        return rawContent;
    };

    this.parseRedCap = function(redcap_json) {
        return self.parseLogic(self.splitChoices(redcap_json));
    };


    return this.parseRedCap(redcap_json);

}

function postToGitHub (github_token, redcap_form_name, filename, file_content) {

  var github = new GitHubApi()

  github.authenticate({
    type: 'oauth',
    token: github_token
  })

  var github_details = {
      owner: 'RADAR-base',
      repo: 'RADAR-REDCap-aRMT-Definitions',
      path: 'questionnaires/'+ filename
  };

  var post_details = {
    owner: github_details.owner, repo:github_details.repo, path:github_details.path , message:'Update Questionnaire ' + filename, content: new Buffer(file_content).toString('base64')
  }

  github.repos.getContent({
    owner: github_details.owner,
    repo: github_details.repo,
    path: github_details.path
  }, function(status,data){
    if(data !== undefined){
        post_details.sha = data.data.sha;
        github.repos.updateFile(post_details);
    } else {
        github.repos.createFile(post_details);
    }

  });

}

function postRADARJSON(redcap_url, redcap_token, redcap_form_name, github_token, type) {
    var redcap_url = redcap_url || '';
    var redcap_token = redcap_token || '';
    var redcap_form_name = redcap_form_name || '';
    var post_form = {
        token: redcap_token,
        content: 'metadata',
        format: 'json',
        returnFormat: 'json',
        forms: [redcap_form_name]
    };

    request.post({url:redcap_url, form: post_form}, function(err,httpResponse,body){
      var redcap_json = JSON.parse(body);
      var armt_json = REDCapConvertor(redcap_json);
      switch(type) {
          case 'redcap':
             postToGitHub(github_token,redcap_form_name,redcap_form_name + "/"+ redcap_form_name + "_redcap.json", JSON.stringify(redcap_json,null,4));
          break;
          default:
            postToGitHub(github_token,redcap_form_name,redcap_form_name + "/"+ redcap_form_name + "_armt.json", JSON.stringify(armt_json,null,4));
      }
    });
}

var args = process.argv.slice(2);
postRADARJSON(args[0], args[1], args[2], args[3], args[4]);
