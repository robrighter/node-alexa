
node-alexa
===========

node-alexa allows you to build amazon echo skills via a simple node.js event emitter pattern. Features include:

	* Simple integration with Express.js
	* Handler for Launch Requests
	* Handler for Intent Requests
	* Handler for Session Ended Requests
	* Handler to display web content (useful for collecting login information)
	* Built in long term encrypted storage for individual users


*Examples* 


		var express = require('express');
		var app = express();
		var bodyParser = require('body-parser');
		var AmazonEchoApp = require('node-alexa');
		var redis = require('redis');
		var url = require('url');
		var redisURL = url.parse(process.env.REDISCLOUD_URL); //Heroku Redis
		var client = redis.createClient(redisURL.port, redisURL.hostname, {no_ready_check: true});
		client.auth(redisURL.auth.split(":")[1]);


		app.use(bodyParser.json()); // for parsing application/json
		app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
		app.set('port', (process.env.PORT || 5000));
		app.use(express.static(__dirname + '/public'));


		var echoApp = new AmazonEchoApp(client, "hello-world", "shhhhhhhhhhhh!");
		echoApp.decorateAppWithRoutes('/hello-world', app);

		echoApp.on(echoApp.TYPE_LAUNCH_REQUEST, function(callback, userId, sessionInfo, userObject){
			var shouldEndSession = false;
			var speechText = "I'm Alive.";
			var cardTitle = "Hello World";
			var cardSubtitle = "userId " + userId;
			var cardContents = "Hello Echo Iphone App";
			var sessionObject = false;
			if(!userObject){
				//no long term persistance for this use
			}
			else{
				//this user has a long term storage session	
			}
			callback(shouldEndSession, speechText, cardTitle, cardSubtitle, cardContents, sessionObject);
		});

		echoApp.on(echoApp.TYPE_INTENT_REQUEST, function(callback, userId, sessionInfo, userObject, intent){
			if(intent.name === 'Hello'){
				var shouldEndSession = true;
				var speechText = "I heard the command " + intent.name;
				var cardTitle = "Test Echo App Launch Request";
				var cardSubtitle = "userId " + userId;
				var cardContents = "sessionInfo = "+ JSON.stringify(sessionInfo);
				var sessionObject = false;
				callback(shouldEndSession, speechText, cardTitle, cardSubtitle, cardContents, sessionObject);
				return;
			}
			echoApp.returnErrorResponse(callback, "Sorry, nobody has implemented the command "+intent.name);
			return;

		});

		echoApp.on(echoApp.TYPE_WEB_USER_DISPLAY, function(callback, userId, command, userObject){
			//This route is called when a user is directed to:
			// https://myurl.com/approute/input/"+userId;
			html = '<h1>Hello World</h1>';	
			callback(html);
		});

		echoApp.on(echoApp.TYPE_WEB_USER_INPUT, function(callback, userId, command, inputObj, userObject){
			//This route is called when data is posted to:
			// https://myurl.com/approute/input/"+userId;
			
			var message = "Got posted data.";
			//for example, if you collect username and password for a third party integration
			userObject = {email: inputObj.email,password: inputObj.password};
			callback(message, userObject);
			//user object will now be encrypted and stored in redis. It will automatically be decrypted and passed into to future events invoked by this user	
		});


		app.listen(app.get('port'), function() {
			console.log("Node app is running at localhost:" + app.get('port'));
		});


