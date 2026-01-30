# Bearer Auth Token Automation (BAT)

## Initial setup
### Extract this repository into you project folder
```
git clone ...
```

### set the global variable `get-bearer-auth`
```sh
./scripts/install-get-bearer-auth-alias.sh
```

## Usage
### 1. Run the server (exported to http://localhost:3030/token)
Updates based on the `.env` activity
```sh
node scripts/token-server.mjs
```

### 2. Get the Bearer auth token
```sh
get-bearer-auth
```
> The token will be updated on the `.env` file as `AUTHORIZATION`.

### 3. Set the scripts to postman
In collectons or on each request set the scripts:
- pre-request.js
- post-response.js (optional)





