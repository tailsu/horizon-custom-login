Third-party authentication for [horizon](http://horizon.io)
========

Horizon has always had only OAuth-based authentication for a few providers and provided no means to plug in a custom authentication scheme, like a user name/password. [This issue](https://github.com/rethinkdb/horizon/issues/176) tracks the developent of the idea of third-party authentication support.

The good news is that Horizon has already supported external authentication since its inception. It's just that noboby seems to have noticed that, not even the horizon authors themselves.

The authentication algorithm of Horizon works as follows:

* An OAuth workflow is started
* At the end of the workflow the horizon server generates an authentication token
* The client receives the authentication token and uses it to bootstrap its WebSocket.

A lot of people have asked how the can plug other schemes at step one and the answer has been that, well, you can't. But the client doesn't really care how the authentication token has been created, just that one is made eventually available to it. This is the core of the idea demonstrated in this project.

The custom authentication algorithm goes like so:

* Disregard horizon's auth and do whatever auth you want, e.g. passport.
* Once you have an authenticated user, create an entry for that user in the horizon 'users' table.
* Use `jsonwebtoken` to manually generate a token
* Provide that token over an authenticated HTTP endpoint
* Consume the token on the client (AJAX) and create a Horizon client using this token.

And there you go. This project does all abovementioned steps to authenticate the user and let them in on the horizon server. I would really like to see steps 2. and 3. provided by the horizon server API itself to reduce the pain of integrating third-party auth.

## Login provider
The login infrastructure is provided by `passport`.

The login scheme used here is based on `passport-local` and `level-userdb` - a layer on top of LevelDB for managing a user database. It can (and probably should) be switched with any other passport auth scheme.

## Project structure
The horizon server and login code are located in `src/index.js`

The horizon client and login form are located in `dist/index.html`

The token secret is read from `.hz/secrets.toml`. This file should be kept secret in regular projects.
