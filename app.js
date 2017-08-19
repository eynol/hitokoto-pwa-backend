const restify = require('restify');
const corsMiddleware = require('restify-cors-middleware')
const validator = require('validator');

const mongoServer = require('./mongo');
const emailServer = require('./mailpush/index.js');
const authMiddleware = require('./middleware/auth')
const appUtil = require('./util');

let trace = console
  .log
  .bind(console);

const cors = corsMiddleware({origins: ['*'], allowHeaders: ['API-Token'], exposeHeaders: ['API-Token-Expiry']})
// var $regist = require('./routes/regist.js');

const server = restify.createServer({name: 'hitokoto', version: '1.0.0'});

server.pre(cors.preflight)
server.use(cors.actual)
server.use(restify.plugins.acceptParser(server.acceptable));
server.use(restify.plugins.queryParser());
server.use(restify.plugins.bodyParser());
server.use(authMiddleware())
// $regist(server);

server.get('/', function (req, res, next) {
  res.send(appUtil.generateCode4());
  return next();
});

server.get('/test/email/:email', function (req, res, next) {
  let {email} = req.params
  let code = appUtil.generateCode4();
  mongoServer
    .storeEmailVerify(email, code)
    .then(code => {
      res.send(code);
      next();
    })
});
server.get('/test/email/:email/:code', function (req, res, next) {
  let {email, code} = req.params

  mongoServer
    .doEmailVerify(email, code)
    .then(e => {
      res.send(e)
      next()
    })
});

server.get('/api', function (req, res, next) {
  res.send(req.params);
  return next();
});

server.post('/api/regist', function (req, res, next) {
  let {username, email, password, nickname, code} = req.body;

  //防止注入
  username = validator.trim(username);
  password = validator.trim(password);
  nickname = validator.trim(nickname);
  if (typeof code !== 'undefined') {
    code = validator.trim(code);
  }

  let returnStupid = () => {
    res.send({you: "stupid", err: '418'})
    next(false)
  }
  if (!validator.isEmail(email)) {
    returnStupid();
    return;
  }
  if (code && !/^[a-zA-Z0-9]{4}$/gim.test(code)) {
    returnStupid();
    return;
  }

  let test = !code;

  if (test) {
    mongoServer.creatUser({
      username,
      password,
      email,
      nickname
    }, true).then(() => {
      return mongoServer.storeEmailVerify(email, appUtil.generateCode4())
    }).then((code) => {
      return emailServer.sendVerifyCodeTo(email, code)
    }).then((detail) => {
      if (detail.accepted.length != 1) {
        res.send({accepted: detail.accepted.length, rejected: detail.rejected.length, err: '邮件似乎发送失败'})
        next(false);
      } else {
        res.send({message: '邮件发送成功！'})
        next();
      }
    }).catch(e => {
      trace('send email catch', e)
      res.send({
        err: '执行错误：' + e
      });
      next(false)
    });

  } else {
    mongoServer
      .doEmailVerify(email, code)
      .then(() => mongoServer.creatUser({
        username,
        password,
        email,
        nickname
      }, false))
      .then(user => {
        let uid = user._id;
        trace('创建用户成功', user);
        return req
          .hitoAuthActive(uid)
          .then(token => {
            res.send({token: token, nickname: user.nickname});
            next()
          })
      })
      .catch(e => {
        res.send({
          where: 'newUser',
          err: '执行错误：' + e
        });
        next(false)
      })
  }
});

server.post('/api/login', function (req, res, next) {
  try {

    let {username, password} = req.body;
    username = validator.trim(username);
    password = validator.trim(password);

    mongoServer
      .userLogin(username, password)
      .then(({uid, nickname}) => req.hitoAuthActive(uid).then(token => {
        res.send({token: token, nickname: nickname});
        next()
      }))
      .catch(e => {
        res.send({err: e});
        next()
      })

  } catch (e) {
    res.send({
      where: 'login',
      err: '执行错误：' + e
    });
    next(false)
  }

})
server.listen(9999, function () {
  console.log('%s listening at %s', server.name, server.url);
});