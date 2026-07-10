module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  moduleNameMapper: {
    "^obsidian$": "<rootDir>/tests/obsidianMock.ts"
  }
};
