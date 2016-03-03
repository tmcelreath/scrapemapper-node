'use strict'

var fs = require('fs');
var request = require('request');
var cheerio = require('cheerio');

/**
 * Rate limiter to prevent connection failures
 * @param rateLimitPerSecond
 * @constructor
 */
function Throttler(rateLimitPerSecond) {
    this.rateLimitPerSecond = rateLimitPerSecond;
    this.waitTimeMS = (1 / this.rateLimitPerSecond) * 100;
    this.tasks = [];
    this.paused = false;
    this.stopped = false;
}

Throttler.prototype.start = function(callback) {
    this._executeTask();
    callback();
};

Throttler.prototype._stop = function() {
    this.stopped = true;
}

Throttler.prototype._addTask = function addTask(context, func, args) {
    this.tasks.push({'context': context, 'func': func, 'args': args});
}

Throttler.prototype._isPaused = function() {
    return this.paused;
}

Throttler.prototype._executeTask = function() {
    var self = this;
    if (self._isPaused()) {
        return;
    } else {
        if (self.tasks.length > 0) {
            var currentTask = self.tasks.shift();
            var arglist = [];
            arglist.push(currentTask.args);
            currentTask.func.apply(currentTask.context, arglist);
        }
    }
    setTimeout(function() {
        self._executeTask();
    }, self.waitTimeMS);
};

/**
 * Site crawler designed to map internal, external, and image links
 * @param url
 * @constructor
 */
function ScrapeMapper(url) {
    this.url = url;
    this.results = [];
}

ScrapeMapper.prototype.start = function start(callback) {
    this.throttler = new Throttler(2, callback);
    this.throttler._addTask(this, this._scrape, this.url);
    this.throttler.start(callback);
}

ScrapeMapper.prototype._isInternalPageLink = function isInternalPageLink(href, baseurl) {
    return (href.startsWith("#")
    || href.startsWith("/#")
    || href.startsWith(baseurl + "/#"));
}

ScrapeMapper.prototype._isAlreadyScraped = function isAlreadyScraped(url) {
    for (var i in this.results) {
        if(this.results[i].url === url || this.results[i].url === url + "/") {
            return true;
        }
    }
    return false;
}

ScrapeMapper.prototype._scrape = function _scrape(url) {
    var self = this;
    request(url, function (error, response, html) {

        if (!error) {
            var page = new Page(url);
            var $ = cheerio.load(html);
            page['title'] = $('title').text();

            $('img').map(function(i, img) {
                var src = $(img).attr('src');
                page.images.push(src);
                //console.log("IMAGE! : " + src);
            });

            $('a').map(function(i, link) {
                var href = $(link).attr('href');
                if(href) {
                    if(!self._isInternalPageLink(href, url)) {
                        if (href.startsWith(self.url)) {
                            page.internalLinks.push(href);
                            //console.log("INTERNAL! : " + href);
                            if(!self._isAlreadyScraped(href)) {
                                self.throttler._addTask(self, self._scrape, href);
                                //self._scrape(href);
                            }
                        } else {
                            page.externalLinks.push(href);
                            //console.log("EXTERNAL! : " + href);
                        }
                    }
                }
            });
            self.results.push(page);
        } else {
            self.currentRequests = self.currentRequests - 1;
        }
        console.log(url);
        //console.log(self.results);
        self.currentRequests = self.currentRequests - 1;
    });
}

function Page(url)  {
    this.title = '';
    this.url = url;
    this.internalLinks = [];
    this.externalLinks = [];
    this.images = [];
}

var wiproScraper = new ScrapeMapper("http://wiprodigital.com");

wiproScraper.start(function() { console.log(wiproScraper.results) });