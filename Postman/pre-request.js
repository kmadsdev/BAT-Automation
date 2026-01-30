pm.sendRequest("http://localhost:3030/token", (err, res) => {
    if (err) throw err;
    pm.collectionVariables.set("AUTHORIZATION", res.json().authorization);
    pm.request.headers.add({ key: "Authorization", value: "Bearer " + pm.collectionVariables.get("AUTHORIZATION") });
});
