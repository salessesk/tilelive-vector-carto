"use strict";

var url = require("url");
var carto = require("carto");
var async = require("async");

var PREFIX = "vector-carto";

module.exports = function(tilelive, options) {
  var VectorCarto = function(uri, callback) {
    uri = url.parse(clone(uri), true);

    uri.protocol = uri.protocol.replace(PREFIX, "");

    if (!tilelive.protocols["vector:"]) {
      return setImmediate(callback, new Error("tilelive-vector is unavailable."));
    }

    var filename = uri.pathname;

    return fs.readFile(filename, function(err, mml) {
      if (err) {
        return callback(err);
      }

      try {
        mml = JSON.parse(mml);
      } catch (e) {
        return callback(e);
      }

      return async.map(mml.Stylesheet, function(mss, done) {
        if (typeof(mss) === "object") {
          // stylesheet was inlined, by millstone or otherwise
          return done(null, mss);
        }

        return fs.readFile(path.join(path.dirname(filename), mss), "utf8", function(err, style) {
          if (err) {
            return done(err);
          }

          return done(null, {
            id: mss,
            data: style
          });
        });
      }, function(err, styles) {
        if (err) {
          return callback(err);
        }

        mml.Stylesheet = styles;

        var xml;
        var source = mml.Layer[0].Datasource.file;
        delete mml.Layer[0].Datasource;

        try {
          xml = new carto.Renderer().render(mml);
        } catch (err) {
          if (Array.isArray(err)) {
            err.forEach(function(e) {
              // TODO what's this?
              carto.writeError(e, options);
            });
          } else {
            return callback(err);
          }
        }

        return new tilelive.protocols["vector:"]({ xml: xml, source: source }, callback);
      });
    });
  };

  VectorCarto.registerProtocols = function(tilelive) {
    tilelive.protocols[PREFIX] = this;
  };

  VectorCarto.registerProtocols(tilelive);

  return VectorCarto;
};