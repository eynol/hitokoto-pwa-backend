const path = require('path');
const bunyan = require('bunyan');
let logger,
  mongoLoger;

if (process.env.NODE_ENV == "production") {

  logger = bunyan.createLogger({
    name: 'hitokoto',
    streams: [
      {
        stream: process.stdout,
        level: bunyan.DEBUG
      }, {
        path: path.resolve(__dirname, 'info.log'),
        level: bunyan.INFO
      }, {
        path: path.resolve(__dirname, 'warn.log'),
        level: bunyan.WARN
      }, {
        path: path.resolve(__dirname, 'error.log'),
        level: bunyan.ERROR
      }
    ]
  });
} else {
  logger = bunyan.createLogger({
    name: 'hitokoto',
    streams: [
      {
        path: path.resolve(__dirname, 'info.log'),
        level: bunyan.INFO
      }, {
        path: path.resolve(__dirname, 'warn.log'),
        level: bunyan.WARN
      }, {
        path: path.resolve(__dirname, 'error.log'),
        level: bunyan.ERROR
      }
    ]
  });
}

exports.logger = logger;
