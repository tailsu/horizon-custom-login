// Embedding Horizon server according to http://horizon.io/docs/embed/

const _ = require('lodash');
const path = require('path');
const fs = require('fs');
const toml = require('toml');
const express = require('express');
const horizon = require('@horizon/server');

const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;

const app = express();
app.use(require('cookie-parser')());
app.use(require('body-parser').urlencoded({ extended: true }));
app.use(require('express-session')({ secret: 'secret', resave: false, saveUninitialized: false}));

app.use(passport.initialize());
app.use(passport.session());

// Use passport-local authentication strategy. LevelDB will be used to store
// the user names and passwords of registered users. This part may be substituted
// with any other passport strategy or any other authentication middleware, it doesn't matter. The important part is to call `getHorizonUser` after successful authentication, as it ensures that the horizon server knows about our user and can accept auth tokens from him.
const levelUserDb = require('level-userdb')();
levelUserDb.addUser('admin', 'admin', function(){}); //prepopulate admin user for demo purposes

passport.use(new LocalStrategy(function(username, password, done) {
    levelUserDb.checkPassword(username, password, function(err) {
        if (err) {
            done(err);
        } else {
            getHorizonUser(username)
                .then(user => done(null, user)).catch(done);
        }
    });
}));

passport.serializeUser((user, done) => {
    done(null, user.hzid);
});
passport.deserializeUser((hzid, done) => {
    done(null, {hzid: hzid});
});

const jwt = require('jsonwebtoken');
const token_secret = toml.parse(fs.readFileSync(path.join(__dirname, '../.hz/secrets.toml'))).token_secret;
const httpServer = app.listen(8181);
const options = {
    project_name: 'myProject',
    permissions: false,
    auto_create_index: true,
    auto_create_collection: true,
    auth: { token_secret: token_secret }
};
const horizonServer = horizon(httpServer, options);
var conn, r;
horizonServer._reql_conn.ready().then(c => {
    conn = c.connection();
    r = horizon.r;
});

// helper function that converts ReQL queries into promises
function hzAsync(conn, query) {
    return new Promise((resolve, reject) => {
        query.run(conn, (err, cursor) => {
            if (err) {
                reject(err);
            } else {
                if (!_.isFunction(cursor.toArray)) {
                    resolve(cursor);
                } else {
                    cursor.toArray((err, result) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(result);
                        }
                    });
                }
            }
        });
    });
}

function getHorizonUser(username) {
    return new Promise(function(resolve, reject) {
        var q = () => r.db('myProject').table('users');
        hzAsync(conn, q().filter({id: username}))
            .then(function (hzUserQ) {
                var hzUser = hzUserQ[0];
                var sessionUser = {
                    hzid: username
                };
                var insertQ;  
                if (!hzUser) {
                    hzUser = {
                        groups: ['default', 'authenticated'],
                        id: username,
                    };
                    insertQ = hzAsync(conn, q().insert(hzUser));
                }
                return Promise.all([sessionUser, insertQ]);
            })
            .then(function (result) {
                resolve(result[0]);
            })
            .catch(reject);
    })
}

// Function creates token for the given user.
// Logic copied from `hz make-token` command
function makeLoginReply(tokensecret, id) {
    let token = jwt.sign(
        { id, provider: null },
        new Buffer(tokensecret, 'base64'),
        { expiresIn: '1h', algorithm: 'HS512' } // adjust expiration time to taste.
    );

    return {token: token};
}

app.post('/login', passport.authenticate('local'), function(req, res) {
    return res.json(req.user && makeLoginReply(token_secret, req.user.id));
});

app.use(express.static(path.join(__dirname, '../dist')));

console.log('Listening on port 8181.');
