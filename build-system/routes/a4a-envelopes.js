/**
 * Copyright 2019 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const app = require('express').Router();
const BBPromise = require('bluebird');
const fs = BBPromise.promisifyAll(require('fs'));
const request = require('request');
const {replaceUrls} = require('../app-utils');
const {SERVE_MODE} = process.env;

// In-a-box envelope.
// Examples:
// http://localhost:8000/inabox/examples/animations.amp.html
// http://localhost:8000/inabox/proxy/s/www.washingtonpost.com/amphtml/news/post-politics/wp/2016/02/21/bernie-sanders-says-lower-turnout-contributed-to-his-nevada-loss-to-hillary-clinton/
app.use('/inabox/', (req, res) => {
  const templatePath =
    process.cwd() + '/build-system/server-inabox-template.html';
  fs.readFileAsync(templatePath, 'utf8').then(template => {
    template = template.replace(/SOURCE/g, 'AD_URL');
    const url = getInaboxUrl(req);
    res.end(fillTemplate(template, url.href, req.query));
  });
});

// In-a-box friendly iframe and safeframe envelope.
// Examples:
// http://localhost:8000/inabox-friendly/examples/animations.amp.html
// http://localhost:8000/inabox-friendly/proxy/s/www.washingtonpost.com/amphtml/news/post-politics/wp/2016/02/21/bernie-sanders-says-lower-turnout-contributed-to-his-nevada-loss-to-hillary-clinton/
app.use('/inabox-(friendly|safeframe)', (req, res) => {
  const templatePath = '/build-system/server-inabox-template.html';
  fs.readFileAsync(process.cwd() + templatePath, 'utf8')
    .then(template => {
      let url;
      if (req.baseUrl == '/inabox-friendly') {
        url = getInaboxUrl(req, 'inabox-viewport-friendly');
        template = template.replace('SRCDOC_ATTRIBUTE', 'srcdoc="BODY"');
      } else {
        url = getInaboxUrl(req);
        template = template
          .replace(
            /NAME/g,
            '1-0-31;LENGTH;BODY{&quot;uid&quot;:&quot;test&quot;}'
          )
          .replace(
            /SOURCE/g,
            url.origin + '/test/fixtures/served/iframe-safeframe.html'
          );
      }
      return requestFromUrl(template, url.href, req.query);
    })
    .then(result => {
      res.end(result);
    });
});

// A4A envelope.
// Examples:
// http://localhost:8000/a4a[-3p]/examples/animations.amp.html
// http://localhost:8000/a4a[-3p]/proxy/s/www.washingtonpost.com/amphtml/news/post-politics/wp/2016/02/21/bernie-sanders-says-lower-turnout-contributed-to-his-nevada-loss-to-hillary-clinton/
app.use('/a4a(|-3p)/', (req, res) => {
  const force3p = req.baseUrl.startsWith('/a4a-3p');
  const templatePath = '/build-system/server-a4a-template.html';
  const url = getInaboxUrl(req);
  fs.readFileAsync(process.cwd() + templatePath, 'utf8').then(template => {
    const content = fillTemplate(template, url.href, req.query)
      .replace(/CHECKSIG/g, force3p || '')
      .replace(/DISABLE3PFALLBACK/g, !force3p);
    res.end(replaceUrls(SERVE_MODE, content));
  });
});

/**
 * @param {Request} req
 * @param {string|undefined} extraExperiment
 * @return {!URL}
 */
function getInaboxUrl(req, extraExperiment) {
  const urlStr = req.protocol + '://' + req.get('host') + req.url;
  const url = new URL(urlStr);
  // make it a cross domain URL
  if (url.hostname === 'localhost') {
    url.hostname = 'ads.localhost';
  }
  // this tells local server to convert the AMP document to AMP4ADS spec
  url.searchParams.set('inabox', '1');
  // turn on more logs if requested
  const logLevel = url.searchParams.get('log');
  if (logLevel) {
    url.searchParams.delete('log');
    url.hash = '#log=' + logLevel;
  }

  // turn on extra experiment
  if (extraExperiment) {
    const exp = url.searchParams.get('exp');
    if (exp) {
      extraExperiment += ',' + exp;
    }
    url.searchParams.set('exp', extraExperiment);
  }
  return url;
}

/**
 * Fetch a page from the target URL and fill its content into the template.
 * If the URL does not return text, returns null.
 * @param {string} template
 * @param {string} url
 * @param {Object} query
 * @return {!Promise<?string>}
 */
function requestFromUrl(template, url, query) {
  return new Promise((resolve, reject) => {
    request(url, (error, response, body) => {
      if (error) {
        reject(error);
      }
      if (
        !response.headers['content-type'] ||
        response.headers['content-type'].startsWith('text/html')
      ) {
        resolve(fillTemplate(template, url, query, body));
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Fill out a template with some common variables.
 * @param {string} template
 * @param {string} url
 * @param {Object} query
 * @param {string|undefined} body
 * @return {string}
 */
function fillTemplate(template, url, query, body) {
  let newBody;
  let length;
  if (body) {
    newBody = body
      .replace(/&/g, '&amp;')
      .replace(/'/g, '&apos;')
      .replace(/"/g, '&quot;');
    length = body.length;
  } else {
    length = 0;
  }
  return (
    template
      .replace(/BODY/g, newBody)
      .replace(/LENGTH/g, length)
      .replace(/AD_URL/g, url)
      .replace(/OFFSET/g, query.offset || '0px')
      .replace(/AD_WIDTH/g, query.width || '300')
      .replace(/AD_HEIGHT/g, query.height || '250')
      // Clear out variables that are not already replaced beforehand.
      .replace(/NAME/g, 'inabox')
      .replace(/SOURCE/g, '')
      .replace('SRCDOC_ATTRIBUTE', '')
  );
}

module.exports = app;
