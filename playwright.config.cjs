module.exports = {
  testDir: './e2e',
  timeout: 60000,
  use: {
    headless: true,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
}
