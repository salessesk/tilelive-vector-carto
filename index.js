"use strict";

var url = require("url"),
  carto = require("carto"),
  async = require("async"),
  fs = require("fs"),
  yaml = require("js-yaml"),
  mapnik = require("mapnik"),
  path = require("path");

var PREFIX = "vector-carto:";

// ensure mapnik as fonts available
mapnik.register_system_fonts();

module.exports = function(tilelive, options) {
  var VectorCarto = function(uri, callback) {
    uri = url.parse(uri, true);

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
        mml = yaml.safeLoad(mml);
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

        var source = url.parse(mml.vectorfile, true);
        // case when no / is used
        if (source.pathname === null) {
          source = source.protocol + '//' + path.join(path.dirname(filename), source.hostname);
        }
        delete mml.vectorfile;

        new tilelive.protocols["vector:"].Backend({uri: source}, function(err, backend) {
          if (err) return callback(err);
          if (!backend._vector_layers) return callback(new Error('source must contain a vector_layers property'));

          // populate mml with backend source data
          mml.name = mml.name || backend._source._info.name;
          mml.description = mml.description || backend._source._info.description;
          mml.bounds = mml.bounds || backend._source._info.bounds;
          mml.center = mml.center || backend._source._info.center;
          mml.maxzoom = mml.maxzoom || backend._source._info.maxzoom;
          mml.minzoom = mml.minzoom || backend._source._info.minzoom;

          mml.Layer = backend._vector_layers.map(function(vl) {
            return {id: vl.id};
          });

          var xml;
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

          new tilelive.protocols["vector:"]({
              xml: xml.data,
              backend: backend
          }, function(err, source) {
            if (err) return callback(err);
            return callback(null, source);
          });
        });
      });
    });
  };

  VectorCarto.registerProtocols = function(tilelive) {
    tilelive.protocols[PREFIX] = this;
  };

  VectorCarto.registerProtocols(tilelive);

  return VectorCarto;
};
