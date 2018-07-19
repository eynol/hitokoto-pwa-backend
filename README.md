# Notice
You have to write 3 config files at the begining.
- mailpush/config.json: config email server account and token to send emails.
- middleware/auth.config.json: the secret to encrypt tokens.
- mongo/mongo.hito.secret.config.json: Config  MongoDB url, user, password, host,  port and connection.

# Run
Run following commands to start the server.
```
npm install
npm run start 
#or you can run `node app.js` 
#or node application managers such as pm2 
```


