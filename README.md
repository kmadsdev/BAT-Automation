# Bearer Authorizaton Token - Automation
Picks the authorization token from QA, and throw at your `.env` file and to Postman, so you don't have to.

<br><br>

# Step 0. Extract this repository into you project folder
Or just `/scritps` 'cause that's all you need anyway
```
git clone https://github.com/kmadsdev/BAT-Automation.git
```

<br><br>

# Step 1. Move the `scripts/` folder to you repository's root (or on the same location as your `.env`)
I'm not repeating myself though

<br><br>

# Step 2. Set the global variable `get-bearer-auth`
```sh
./scripts/install-get-bearer-auth-alias.sh
```
> Whenever you need to update the bearer auth token you just type this: `get-bearer-auth`

<br><br>

# Step 3. Run the token server
Updates based on the `.env` activity
```sh
node scripts/token-server.mjs
```
> This server will export your Bearer token to [http://localhost:3030/token](http://localhost:3030/token)

<br><br>

# Step 4. Renew your token
```sh
get-bearer-auth
```
> Your token will be updated on the `.env` file as `AUTHORIZATION`.
> Everytime you need to get another code, just re-run the command.

<br><br>

# Step 5. Setup Postman to get the auth token automaticall
In collectons or on each request set the scripts from each file:
- [/Postman/pre-request.js](/Postman/pre-request.js) (mandatory)
- [/Postman/post-response.js](/Postman/post-response.js) (optional)
