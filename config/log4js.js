module.exports = {
  "appenders": {
    "access": {
      "type": "dateFile",
      "filename": __dirname + "/../log/access.log",
      "pattern": "-yyyy-MM-dd",
      "category": "http"
    },
    "console": {
      "type": "console",
      "layout": {
        "type": "pattern",
        "pattern": '[%d] [%p] [%f{2}:%l] - %m',
      }
    },
    "app": {
      "type": "file",
      "filename": __dirname + "/../log/app.log",
      "maxLogSize": 10485760,
      "backups": 5,
      "layout": {
        "type": "pattern",
        "pattern": '[%d] [%p] [%f{2}:%l] - %m',
      }
    },
    "errorFile": {
      "type": "file",
      "filename": __dirname + "/../log/errors.log",
      "maxLogSize": 10485760,
      "backups": 5,
      "layout": {
        "type": "pattern",
        "pattern": '[%d] [%p] [%f{2}:%l] - %m',
      }
    },
    "errors": {
      "type": "logLevelFilter",
      "level": "ERROR",
      "appender": "errorFile"
    }
  },
  "categories": {
    "default": { "appenders": [ "console", "app", "errors" ], "level": "DEBUG", enableCallStack: true },
    "http": { "appenders": [ "access"], "level": "DEBUG" }
  }
}
