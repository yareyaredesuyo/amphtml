/**
 * Copyright 2015 The AMP HTML Authors. All Rights Reserved.
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
'use strict';

const argv = require('minimist')(process.argv.slice(2), {
  string: ['rtv_serve_mode'],
});
const colors = require('ansi-colors');
const log = require('fancy-log');
const nodemon = require('nodemon');
const path = require('path');
const {createCtrlcHandler} = require('../ctrlcHandler');
const {isRtvMode} = require('../app-utils');

const host = argv.host || 'localhost';
const port = argv.port || process.env.PORT || 8000;
const useHttps = argv.https != undefined;
const quiet = argv.quiet != undefined;
const sendCachingHeaders = argv.cache != undefined;
const noCachingExtensions = argv.noCachingExtensions != undefined;

/**
 * Starts a simple http server at the repository root
 * @param {boolean} lazyBuild
 */
function serve(lazyBuild) {
  createCtrlcHandler('serve');

  // Get the serve mode
  if (argv.compiled) {
    process.env.SERVE_MODE = 'compiled';
    log(colors.green('Serving minified js'));
  } else if (argv.cdn) {
    process.env.SERVE_MODE = 'cdn';
    log(colors.green('Serving current prod js'));
  } else if (argv.rtv_serve_mode) {
    const rtv = argv.rtv_serve_mode;
    if (isRtvMode(rtv)) {
      process.env.SERVE_MODE = rtv;
      log(colors.green(`Serving RTV ${rtv} js`));
    } else {
      throw new Error(`Invalid rtv_serve_mode: ${rtv}`);
    }
  } else {
    process.env.SERVE_MODE = 'default';
    log(colors.green('Serving unminified js'));
  }

  const config = {
    script: require.resolve('../server.js'),
    watch: [
      require.resolve('../app.js'),
      require.resolve('../routes/analytics.js'),
      require.resolve('../server.js'),

      // All devdash routes:
      path.dirname(require.resolve('../app-index')),
    ],
    env: {
      'NODE_ENV': 'development',
      'SERVE_PORT': port,
      'SERVE_HOST': host,
      'SERVE_USEHTTPS': useHttps,
      'SERVE_PROCESS_ID': process.pid,
      'SERVE_QUIET': quiet,
      'SERVE_CACHING_HEADERS': sendCachingHeaders,
      'SERVE_EXTENSIONS_WITHOUT_CACHING': noCachingExtensions,
      'LAZY_BUILD': lazyBuild,
    },
    stdout: !quiet,
  };

  if (argv.inspect) {
    Object.assign(config, {
      execMap: {
        js: 'node --inspect',
      },
    });
  }

  nodemon(config).once('quit', function() {
    log(colors.green('Shutting down server'));
  });
}

function getHost() {
  return (useHttps ? 'https' : 'http') + '://' + host + ':' + port;
}

module.exports = {
  serve,
};

/* eslint "google-camelcase/google-camelcase": 0 */

serve.description = 'Serves content in root dir over ' + getHost() + '/';
serve.flags = {
  'host': '  Hostname or IP address to bind to (default: localhost)',
  'port': '  Specifies alternative port (default: 8000)',
  'https': '  Use HTTPS server (default: false)',
  'quiet': '  Do not log HTTP requests (default: false)',
  'cache': '  Make local resources cacheable by the browser (default: false)',
  'inspect': '  Run nodemon in `inspect` mode',
};
