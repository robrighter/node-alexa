var events = require("events");
var util = require("util");
var crypto = require('crypto');

var TYPE_LAUNCH_REQUEST = 'LaunchRequest';
var TYPE_INTENT_REQUEST = 'IntentRequest';
var TYPE_SESSION_ENDED_REQUEST = 'SessionEndedRequest';
var TYPE_WEB_USER_DISPLAY = 'WebUserDisplay';
var TYPE_WEB_USER_INPUT = 'WebUserInput';


var AES_ALGORITHM = 'aes-256-ctr';
 
function AmazonEchoApp(redisClient, appName, aesKey){
	var that = this;
	function decorateAppWithRoutes(appUrl, app){
		app.post(appUrl, incomingSpeaking);
		app.get(appUrl+'/user/:userId/:command', incomingWebGet);
		app.post(appUrl+'/user/:userId/:command', incomingWebPost);
		
		app.get(appUrl, function(request,response){
			response.json(makeReply(false, "test speech", "Card Title", "card sub title", "some card contents", false));
		});

	}

	function incomingWebGet(request, response, userId){
		var userId = request.params.userId;
		var command = request.params.command;
		var callback = function(html){
			response.send(html);
		};
		getUserObjectFromRedis(userId, function(err, userObject){
			that.emit(TYPE_WEB_USER_DISPLAY, callback, userId, command, userObject);
		});
	}

	function incomingWebPost(request, response, userId){
		var userId = request.params.userId;
		var command = request.params.command;
		var inputObj = request.body;
		var callback = function(html, userObject){
			if(userObject){
				setUserObjectInRedis(userId, userObject, function(err, result){
					if(err){
						console.log("Error Saving User Object for User "+userId+" on app "+ appName);
						console.log(err);
					}
					else{
						console.log("Saved User Object for User "+userId+" on app "+ appName);
					}	
				});
			}
			response.send(html);
		};
		getUserObjectFromRedis(userId, function(err, userObject){
			that.emit(TYPE_WEB_USER_INPUT, callback, userId, command, inputObj, userObject);
		});
	}

	function incomingSpeaking(request,response){

		var userId = null;
		var callback = function(shouldEndSession, speechText, cardTitle, cardSubtitle, cardContents, sessionObject, userObject){
			if( (userId !== null) && (userObject !== null) ){
				setUserObjectInRedis(userId, userObject, function(err, result){
					if(err){
						console.log("Error Saving User Object for User "+userId+" on app "+ appName);
						console.log(err);
					}
					else{
						console.log("Saved User Object for User "+userId+" on app "+ appName);
					}
				});
			}
			response.json(makeReply(shouldEndSession, speechText, cardTitle, cardSubtitle, cardContents, sessionObject));
		};

		try{

			if(!request.hasOwnProperty('body') || !request.body.hasOwnProperty('request')){
				returnErrorResponse(callback,'Echo sent a malformed request.');
				return;
			}

			var requestType = request.body.request.type;
			userId = request.body.session.user.userId;
			var sessionInfo = {
				isNew: request.body.session.new,
				attributes: request.body.session.hasOwnProperty('attributes') ? request.body.session.attributes : {}
			};

			//todo: get the user object out of redis (if it exists), decrypt it and then send it on
			getUserObjectFromRedis(userId, function(err, userObject){
				if(err){
					console.log(err);
				}
				if(requestType === TYPE_LAUNCH_REQUEST){
					that.emit(TYPE_LAUNCH_REQUEST, callback, userId, sessionInfo, userObject);
					return;
				}
				if(requestType === TYPE_INTENT_REQUEST){
					that.emit(TYPE_INTENT_REQUEST, callback, userId, sessionInfo, userObject, request.body.request.intent);
					return;
				}
				if(requestType === TYPE_SESSION_ENDED_REQUEST){
					that.emit(TYPE_SESSION_ENDED_REQUEST, callback, userId, sessionInfo, userObject);
					return;
				}
			});
			return;
		}
		catch(e){
			console.error(e);
			returnErrorResponse(callback, 'Exception occured.');
		}


		//should never get here unless we got a malformed request
		returnErrorResponse(callback, 'Echo sent a malformed request.');
	}


	function returnErrorResponse(callback, errorText){
		 return callback(true, errorText, 'Oops, we encountered a problem', 'error occured', errorText);
	}

	function makeReply(shouldEndSession, speechText, cardTitle, cardSubtitle, cardContents, sessionObject){
		var ret = {
			"version" : "1.0",
			"response" : {
				"outputSpeech" : {
					"type" : "PlainText",
					"text" : speechText
				},
				"card" : {
					"type" : "Simple",
					"title" : cardTitle,
					"subtitle" : cardSubtitle,
					"content" : cardContents
				},
				"shouldEndSession" : shouldEndSession
			}
		};
		if(sessionObject){
			ret['sessionAttributes'] = sessionObject;
		}
		return ret;
	}

	function makeRedisKey(appName, userId){
		return appName+":"+userId;
	}

	function getUserObjectFromRedis(userId, callback){
		redisClient.get(makeRedisKey(appName,userId), function(err, result){
			if(err){
				callback("Error reading from Redis: "+err);
				return;
			}
			if(result !== null){
				callback(null, decryptUserObject(result, aesKey));
				return;
			}
			else{
				callback(null,false);
			}
		});
	}

	function setUserObjectInRedis(userId, userObject, callback){
		if(!userObject){
			callback(null, true);
			return;
		}
		var toSet = encryptUserObject(userObject, aesKey);
		redisClient.set(makeRedisKey(appName,userId), toSet, function(err, result){
			if(err){
				callback && callback("Error writting result to Redis: "+err);
				return;
			}
			else{
				callback && callback(null, true);
			}
		});
	}

	function encryptUserObject(userObject, secret){
		var text = JSON.stringify(userObject);
		var cipher = crypto.createCipher(AES_ALGORITHM,secret)
		var crypted = cipher.update(text,'utf8','hex')
		crypted += cipher.final('hex');
		return crypted;
	}
	 
	function decryptUserObject(cypherText, secret){
		var decipher = crypto.createDecipher(AES_ALGORITHM,secret)
		var dec = decipher.update(cypherText,'hex','utf8')
		dec += decipher.final('utf8');
		var ret = JSON.parse(dec);
		return ret;
	}

	this.makeReply = makeReply;
	this.returnErrorResponse = returnErrorResponse;
	this.decorateAppWithRoutes = decorateAppWithRoutes;
	this.TYPE_INTENT_REQUEST = TYPE_INTENT_REQUEST;
	this.TYPE_LAUNCH_REQUEST = TYPE_LAUNCH_REQUEST;
	this.TYPE_SESSION_ENDED_REQUEST = TYPE_SESSION_ENDED_REQUEST;
	this.TYPE_WEB_USER_INPUT = TYPE_WEB_USER_INPUT;
	this.TYPE_WEB_USER_DISPLAY = TYPE_WEB_USER_DISPLAY;
}

util.inherits(AmazonEchoApp, events.EventEmitter);
module.exports = AmazonEchoApp;

