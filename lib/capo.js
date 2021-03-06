var fs = require('fs'),
	glob = require('glob'),
	path = require('path'),
	async = require('async'),
	Report =  require('./reports/HtmlReport');

module.exports = function(filePath, mediatorObjectName){
	return new Capo(filePath, mediatorObjectName);
}

function Capo(filePath, mediatorObjectName){
	this.filePath = filePath;
	this.subscriptions = {};
	this.triggers = {};
	this.callback = undefined;
	this.currentFileName = undefined;
	this.reportType = undefined;
	this.mediatorObjectName = mediatorObjectName || 'mediator';
}

Capo.prototype.event = function(eventName) {
	this.eventName = eventName;
	return this;
};

Capo.prototype.report = function(format) {
	if (format === 'html'){
		fs.mkdir('capo', function(err){
			this.reportType = 'html';
		}.bind(this));
	}
	return this;
};

Capo.prototype.find = function(callback){
	this.callback = callback;
	var filePath = path.normalize(this.filePath);
	var extname = path.extname(filePath);
	if (!extname){
		glob(filePath + '/**/*.js', this.readFiles_.bind(this));
	} else if (extname === '.js'){
		this.readFiles_(false, [filePath]);
	} else {
		this.callback(new Error('first parameter should be either a folder or a js file'));
	}
};

Capo.prototype.readFiles_ = function(err, files) {
	if (files.length === 0){ this.callback(new Error('No files were found by provided route. ' +
		'Report was not built')); }
	async.map(files, fs.readFile, function(err, data){
		if (err === null){ err = false;}
		else {this.callback(err); return;}
		var linefeed;
		for (var i = 0, l = files.length; i < l; i++){
			this.currentFileName = files[i];
			var contents = String(data[i]);
			linefeed = contents.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
			var lines = contents.split(linefeed);
			this.walkThroughLines_(lines);
		}

		var result = {
			subscriptions: this.subscriptions,
			triggers: this.triggers,
			files: files
		};

		if (this.reportType){
			var report = new Report(result, this.callback);
		}

		this.callback(err, result);
	}.bind(this));
};

Capo.prototype.walkThroughLines_ = function(lines) {
	var subscribePattern = this.mediatorObjectName + "\\.(subscribe|on|once)\\(\[\'\"]",
		subscribePatternMemorySafe = "listen.*" + this.mediatorObjectName + '.*[\'\"]',
		triggerPattern = this.mediatorObjectName + "\\.(trigger|publish|emit)\\(\[\'\"]",
		index,
		indexOfClosingQuote;
	if (typeof this.eventName === 'string'){
		subscribePattern += this.eventName;
		subscribePatternMemorySafe += this.eventName;
		triggerPattern += this.eventName;
	}
	var subscribeRegex = new RegExp(subscribePattern, 'i'),
		subscribeRegexMemorySafe = new RegExp(subscribePatternMemorySafe, 'i'),
		triggerRegex = new RegExp(triggerPattern, 'i');
	for (var i = 0, l = lines.length; i < l; i++){
		//not taking into consideration minified files
		if (lines[i].length > 200) break;
		index = lines[i].search(subscribeRegex);
		if (index !== -1){
			this.searchSucceeded_('subscriptions', lines[i], index, i);
		}
		index = lines[i].search(subscribeRegexMemorySafe);
		if (index !== -1){
			this.searchSucceeded_('subscriptions', lines[i], index, i);
		}
		index = lines[i].search(triggerRegex);
		if (index !== -1){
			this.searchSucceeded_('triggers', lines[i], index, i);
		}
	}
};

Capo.prototype.searchSucceeded_ = function(collectionName, line, index, lineNumber) {
	var indexOfOpeningQuote = line.indexOf('\'', index),
		quoteType = '\'';
	if (indexOfOpeningQuote === -1){
		indexOfOpeningQuote = line.indexOf('\"', index);
		quoteType = '\"';
	}
	var indexOfClosingQuote = line.indexOf(quoteType, indexOfOpeningQuote + 1);
	if (indexOfClosingQuote !== -1){
		if (!this.eventName) {
			eventName = line.substring(indexOfOpeningQuote + 1, indexOfClosingQuote);
		} else {
			eventName = this.eventName;
		}
		if (!this[collectionName][eventName]) this[collectionName][eventName] = [];
		this[collectionName][eventName].push({file: this.currentFileName, line: lineNumber});
	}
};