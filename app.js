const restify = require('restify');
const corsMiddleware = require('restify-cors-middleware')
const validator = require('validator');

const mongoServer = require('./mongo');
const emailServer = require('./mailpush/index.js');
const authMiddleware = require('./middleware/auth')
const appUtil = require('./util');

let trace = console.log.bind(console);

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
  mongoServer.storeEmailVerify(email, code).then(code => {
    res.send(code);
    next();
  })
});
server.get('/test/email/:email/:code', function (req, res, next) {
  let {email, code} = req.params

  mongoServer.doEmailVerify(email, code).then(e => {
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
      return mongoServer.storeEmailVerify(email, appUtil.generateCode4(), 'regist')
    }).then((code) => {
      return emailServer.sendVerifyCodeTo(email, code, 'regist')
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
    mongoServer.doEmailVerify(email, code, 'regist').then(() => mongoServer.creatUser({
      username,
      password,
      email,
      nickname
    }, false)).then(user => {
      let uid = user._id;
      trace('创建用户成功', user);
      return req.hitoAuthActive(uid).then(token => {
        res.send({token: token, nickname: user.nickname});
        next()
      })
    }).catch(e => {
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

    mongoServer.userLogin(username, password).then(({uid, nickname, email}) => req.hitoAuthActive(uid).then(token => {
      email = appUtil.hideEmail(email);
      res.send({token: token, nickname: nickname, email});
      next()
    })).catch(e => {
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

server.post('/api/password', function (req, res, next) {
  try {
    let {newpass, oldpass} = req.body;
    newpass = validator.trim(newpass);
    oldpass = validator.trim(oldpass);

    req.hitoAuthCheck().then(ret => mongoServer.updateUserPassword(ret.uid, oldpass, newpass)).then(user => {
      return emailServer.notifyChangePassword(user.email)
    }).then(detail => {
      if (detail.accepted.length != 1) {} else {
        //TODO:记录到数据库邮件发送成功！
      }
      res.send({message: '修改密码成功！'});
      next();
    }).catch(e => {
      res.send({
        code: e.code,
        err: e.message || e
      });
      next()
    })
  } catch (e) {
    res.send({
      where: '执行错误',
      err: '执行错误：' + e
    });
    next(false)
  }
})

server.get('/api/useremail', function (req, res, next) {
  try {
    req.hitoAuthCheck().then(ret => mongoServer.getUserByUid(ret.uid)).then(user => {
      trace('得到用户邮箱', user);
      return appUtil.hideEmail(user.email);
    }).then(email => {
      res.send({email})
      next();
    }).catch(e => {
      res.send({
        code: e.code,
        err: e.message || e
      });
      next()
    })
  } catch (e) {
    res.send({
      where: '执行错误',
      err: '执行错误：' + e
    });
    next(false)
  }
})

/**
 * get 是发送验证码给旧邮箱，post是验证旧验证码
 */
server.get('/api/oldemailcode', function (req, res, next) {
  try {
    req.hitoAuthCheck().then(ret => {
      return mongoServer.getUserByUid(ret.uid).then(user => {
        console.log(user);
        let email = user.email;

        return mongoServer.storeEmailVerify(email, appUtil.generateCode4(), 'oldemailcode', ret.uid).then(code => {
          return emailServer.sendVerifyCodeTo(email, code, 'oldemailcode')
        })
      })
    }).then(detail => {
      if (detail.accepted.length != 1) {
        res.send({accepted: detail.accepted.length, rejected: detail.rejected.length, err: '邮件似乎发送失败'})
        next(false);
      } else {
        res.send({message: '邮件发送成功！'})
        next();
      }
    }).catch(e => {
      res.send({
        code: e.code,
        err: e.message || e
      });
      next()
    })
  } catch (e) {
    res.send({
      where: '执行错误',
      err: '执行错误：' + e
    });
    next(false)
  }
})

/**
 * 验证旧邮箱收到的验证码
 */
server.post('/api/oldemailcode', function (req, res, next) {
  try {
    let {code} = req.body;
    code = validator.trim(code);

    req.hitoAuthCheck().then(ret => {
      return mongoServer.getUserByUid(ret.uid).then(user => {
        console.log(user);
        let email = user.email;
        return mongoServer.doEmailVerify(email, code, 'oldemailcode', ret.uid)
      })
    }).then(() => {
      res.send({message: "验证成功！"});
      next()
    }).catch(e => {
      res.send({
        code: e.code,
        err: e.message || e
      });
      next()
    })
  } catch (e) {
    res.send({
      where: '执行错误',
      err: '执行错误：' + e
    });
    next(false)
  }
})

/**
 * get 是发送验证码给新邮箱
 */
server.get('/api/newemailcode', function (req, res, next) {
  try {
    let {email} = req.query;
    email = validator.trim(email);

    if (validator.isEmail(email)) {
      req.hitoAuthCheck().then(ret => {
        return mongoServer.getUserByEmail(email).then(user => {
          if (user) {
            return Promise.reject('该邮箱已存在用户');
          } else {
            return mongoServer.storeEmailVerify(email, appUtil.generateCode4(), 'newemailcode', ret.uid).then(code => {
              return emailServer.sendVerifyCodeTo(email, code, 'newemailcode')
            })
          }
        })
      }).then(detail => {
        if (detail.accepted.length != 1) {
          res.send({accepted: detail.accepted.length, rejected: detail.rejected.length, err: '邮件似乎发送失败'})
          next(false);
        } else {
          res.send({message: '邮件发送成功！'})
          next();
        }
      }).catch(e => {
        res.send({
          code: e.code,
          err: e.message || e
        });
        next()
      })
    } else {
      throw new Error('邮箱格式不正确！');
    }

  } catch (e) {
    res.send({
      where: '执行错误',
      err: '执行错误：' + e
    });
    next(false)
  }
})

/**
 * 验证新邮箱收到的验证码
 */
server.post('/api/newemailcode', function (req, res, next) {
  try {
    let {email, code} = req.body;
    email = validator.trim(email);
    code = validator.trim(code);

    if (validator.isEmail(email)) {
      req.hitoAuthCheck().then(ret => {
        return mongoServer.getUserByUid(ret.uid).then(user => {
          return mongoServer.doEmailVerify(email, code, 'newemailcode', ret.uid).then(() => {
            return mongoServer.updateUserEmail(ret.uid, email);
          })
        })
      }).then(() => {
        res.send({message: "验证成功！"});
        next()
      }).catch(e => {
        res.send({
          code: e.code,
          err: e.message || e
        });
        next()
      })
    } else {
      throw new Error('邮箱格式不正确！');
    }
  } catch (e) {
    res.send({
      where: '执行错误',
      err: '执行错误：' + e
    });
    next(false);
  }
})
server.get('/api/collections', function (req, res, next) {
  try {
    req.hitoAuthCheck().then(ret => mongoServer.userCollections(ret.uid)).then(collections => {
      console.log(collections);
      res.send({
        collections: collections.map(col => {
          if (col.name == '默认句集') {
            col.default = true;
          };
          return col;
        })
      });
      next()
    }).catch(e => {
      res.send({
        code: e.code,
        err: e.message || e
      });
      next()
    })
  } catch (e) {
    res.send({
      where: '执行错误',
      err: '执行错误：' + e
    });
    next(false)
  }
})

server.put('/api/collections', function (req, res, next) {
  try {
    let {name} = req.body;
    name = validator.trim(name);

    if (name === '默认句集') {
      res.send({err: '默认句集无法添加！'});
      next(false)
      return;
    }
    req.hitoAuthCheck().then(ret => mongoServer.newUserCollection(ret.uid, name)).then(collections => {
      console.log(collections);
      res.send({collections: collections});
      next()
    }).catch(e => {
      res.send({
        code: e.code,
        err: e.message || e
      });
      next()
    })
  } catch (e) {
    res.send({
      where: '执行错误',
      err: '执行错误：' + e
    });
    next(false)
  }
})

server.post('/api/collections', function (req, res, next) {
  try {
    let {oldname, newname} = req.body;
    oldname = validator.trim(oldname);
    newname = validator.trim(newname);
    if (oldname === newname) {
      res.send({err: '修改的名称相等！无需修改！'});
      next(false)
      return;
    }
    req.hitoAuthCheck().then(ret => mongoServer.updateUserCollectionName(ret.uid, oldname, newname)).then(collections => {
      console.log(collections);
      res.send({collections: collections});
      next()
    }).catch(e => {
      res.send({
        code: e.code,
        err: e.message || e
      });
      next()
    })
  } catch (e) {
    res.send({
      where: '执行错误',
      err: '执行错误：' + e
    });
    next(false)
  }
})

server.del('/api/collections', function (req, res, next) {
  try {
    let {name} = req.body;
    name = validator.trim(name);

    if (name === '默认句集') {
      res.send({err: '默认句集无法删除！'});
      next(false)
      return;
    }
    req.hitoAuthCheck().then(ret => mongoServer.deleteUserCollection(ret.uid, name)).then(collections => {
      console.log(collections);
      res.send({collections: collections});
      next()
    }).catch(e => {
      res.send({
        code: e.code,
        err: e.message || e
      });
      next()
    })
  } catch (e) {
    res.send({
      where: '执行错误',
      err: '执行错误：' + e
    });
    next(false)
  }
})

/***
 *
 *
 *
 */

server.get('/api/collections/:name', function (req, res, next) {
  try {

    let name = req.params.name;
    name = validator.trim(name);
    req.hitoAuthCheck().then(ret => mongoServer.viewUserCollection(ret.uid, name)).then(hitokotos => {
      console.log(hitokotos);
      res.send({hitokotos: hitokotos});
      next()
    }).catch(e => {
      res.send({
        code: e.code,
        err: e.message || e
      });
      next()
    })
  } catch (e) {
    res.send({
      where: '执行错误',
      err: '执行错误：' + e
    });
    next(false)
  }
})

server.put('/api/collections/:name', function (req, res, next) {
  try {

    let name = req.params.name;
    name = validator.trim(name);

    let {hitokoto, 'from': source, category, creator} = req.body;
    hitokoto = validator.trim(hitokoto);
    source = validator.trim(source);
    category = validator.trim(category);
    creator = validator.trim(creator);

    req.hitoAuthCheck().then(ret => {
      return mongoServer.createHitokoto({
        id: 1,
        from: source,
        category,
        hitokoto,
        creator,
        creator_id: ret.uid,
        state: 'public',
        collec: [name]
      }, ret.uid, name)
    }).then(hitokoto => {
      console.log(hitokoto);
      res.send({hitokoto: hitokoto});
      next()
    }).catch(e => {
      res.send({
        code: e.code,
        err: e.message || e
      });
      next()
    })
  } catch (e) {
    res.send({
      where: '执行错误',
      err: '执行错误：' + e
    });
    next(false)
  }
})

server.post('/api/collections/:name', function (req, res, next) {
  try {

    let name = req.params.name;
    name = validator.trim(name);

    let {id, hitokoto, 'from': source, category, creator} = req.body;
    id = validator.trim(id);
    hitokoto = validator.trim(hitokoto);
    source = validator.trim(source);
    category = validator.trim(category);
    creator = validator.trim(creator);

    req.hitoAuthCheck().then(ret => {
      return mongoServer.updateHitokoto({
        from: source,
        category,
        hitokoto,
        creator
      }, id)
    }).then(hitokoto => {
      console.log(hitokoto);
      res.send({result: hitokoto});
      next()
    }).catch(e => {
      res.send({
        code: e.code,
        err: e.message || e
      });
      next()
    })
  } catch (e) {
    res.send({
      where: '执行错误',
      err: '执行错误：' + e
    });
    next(false)
  }
})

server.del('/api/collections/:name', function (req, res, next) {
  try {

    let name = req.params.name;
    let {id} = req.body;

    name = validator.trim(name);
    id = validator.trim(id);

    req.hitoAuthCheck().then(ret => mongoServer.deleteHitokoto(id)).then(result => {
      console.log(result);
      res.send({result: result});
      next()
    }).catch(e => {
      res.send({
        code: e.code,
        err: e.message || e
      });
      next()
    })
  } catch (e) {
    res.send({
      where: '执行错误',
      err: '执行错误：' + e
    });
    next(false)
  }
})
server.on('err', function () {})

server.listen(9999, function () {
  console.log('%s listening at %s', server.name, server.url);
});