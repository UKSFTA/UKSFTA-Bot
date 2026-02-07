module.exports = {
  apps: [
    {
      name: 'uksf-bot',
      script: 'index.js',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
