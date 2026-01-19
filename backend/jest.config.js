module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transformIgnorePatterns: [
    'node_modules/(?!(@auth)/)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
    '^.+\\.(js|jsx)$': 'babel-jest'
  },
  moduleNameMapper: {
    '^@auth/express$': '<rootDir>/src/__mocks__/@auth/express.ts',
    '^@auth/core$': '<rootDir>/src/__mocks__/@auth/core.ts',
    '^@auth/core/providers/google$': '<rootDir>/src/__mocks__/@auth/core/providers/google.ts'
  },
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts']
};
