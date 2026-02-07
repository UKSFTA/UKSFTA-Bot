module.exports = {
  apps: [
    {
      name: 'uksf-bot',
      script: 'src/bot.js',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
