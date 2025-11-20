module.exports = {
    apps: [{
        name: "poll-bot",
        script: "./src/index.ts",
        interpreter: "node",
        interpreter_args: "-r ts-node/register",
        env: {
            NODE_ENV: "production",
            HEADLESS: "true"
        }
    }]
}
