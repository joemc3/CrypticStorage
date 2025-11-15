# CrypticStorage Backend Tests

Comprehensive test suite for the CrypticStorage backend using Jest and Supertest.

## Test Structure

```
tests/
├── setup.ts                    # Global test configuration and utilities
├── unit/                       # Unit tests for individual modules
│   ├── crypto.test.ts         # Cryptographic utilities tests
│   ├── validation.test.ts     # Validation schemas and helpers
│   ├── auth.service.test.ts   # Authentication service tests
│   └── file.service.test.ts   # File service tests
└── integration/                # Integration tests for API endpoints
    ├── auth.test.ts           # Authentication endpoints
    ├── file.test.ts           # File management endpoints
    └── share.test.ts          # Share link endpoints
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- auth.service.test.ts

# Run specific test suite
npm test -- --testNamePattern="User Registration"
```

## Test Categories

### Unit Tests

Unit tests focus on testing individual functions and services in isolation:

- **crypto.test.ts**: Tests password hashing, JWT token generation/verification, and TOTP operations
- **validation.test.ts**: Tests Zod validation schemas and helper functions
- **auth.service.test.ts**: Tests authentication service methods including registration, login, sessions, and 2FA
- **file.service.test.ts**: Tests file service operations like upload, download, update, delete, and versioning

### Integration Tests

Integration tests verify the entire request-response cycle of API endpoints:

- **auth.test.ts**: Tests authentication endpoints (register, login, logout, 2FA)
- **file.test.ts**: Tests file endpoints (upload, download, list, update, delete)
- **share.test.ts**: Tests share endpoints (create, access, revoke, download)

## Test Utilities

The `setup.ts` file provides global test utilities:

### `testUtils.createTestUser(overrides)`
Creates a test user with default values. You can override any field:

```typescript
const user = await global.testUtils.createTestUser({
  email: 'custom@example.com',
  username: 'customuser',
});
```

### `testUtils.createTestFile(userId, overrides)`
Creates a test file for a user:

```typescript
const file = await global.testUtils.createTestFile(user.id, {
  encryptedSize: BigInt(2048),
  mimeType: 'image/png',
});
```

### `testUtils.cleanupTestData()`
Cleans up all test data from the database:

```typescript
await global.testUtils.cleanupTestData();
```

## Mocked Services

The following services are mocked in the test environment:

- **Redis**: All Redis operations return success without actual Redis connection
- **MinIO/Storage**: File storage operations are mocked to avoid actual S3/MinIO interactions
- **Logger**: Logger calls are mocked to reduce test output noise

## Environment Variables

Tests use the following environment variables (set in `setup.ts`):

- `NODE_ENV=test`
- `JWT_SECRET=test-secret-key-for-testing-only`
- `JWT_EXPIRES_IN=7d`

## Coverage Reports

Coverage reports are generated in the `coverage/` directory:

- **Text**: Displayed in terminal
- **LCOV**: For IDE integrations
- **HTML**: Open `coverage/index.html` in browser for detailed view

## Writing New Tests

### Unit Test Example

```typescript
import { myFunction } from '../../src/services/my-service';

describe('My Service', () => {
  beforeEach(async () => {
    await global.testUtils.cleanupTestData();
  });

  it('should do something', async () => {
    const result = await myFunction('input');
    expect(result).toBe('expected output');
  });
});
```

### Integration Test Example

```typescript
import request from 'supertest';
import { app } from '../../src/app';

describe('My Endpoint', () => {
  let accessToken: string;

  beforeEach(async () => {
    const user = await global.testUtils.createTestUser();
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'Test123!@#' });
    accessToken = response.body.data.accessToken;
  });

  it('should do something', async () => {
    const response = await request(app)
      .get('/api/my-endpoint')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
  });
});
```

## Best Practices

1. **Clean up after tests**: Always use `beforeEach` or `afterAll` to clean test data
2. **Use test utilities**: Leverage `testUtils` for creating test data
3. **Test error cases**: Don't just test happy paths
4. **Descriptive test names**: Use clear, descriptive test names that explain what is being tested
5. **Independent tests**: Each test should be independent and not rely on other tests
6. **Mock external services**: Always mock external services (Redis, MinIO, etc.)
7. **Test authentication**: Include authentication tests for protected endpoints
8. **Check audit logs**: Verify that audit logs are created for important operations

## Troubleshooting

### Database Connection Issues
Ensure your PostgreSQL database is running and the `DATABASE_URL` in `.env` is correct.

### Tests Hanging
This usually indicates a database connection wasn't closed. Make sure `afterAll` hooks include `await prisma.$disconnect()`.

### Mock Not Working
If a mock isn't working, ensure it's defined in `setup.ts` before the actual module is imported.

### Flaky Tests
If tests are flaky:
- Check for race conditions
- Ensure proper cleanup between tests
- Verify test independence
- Check for timing issues with async operations

## Contributing

When adding new features:
1. Write unit tests for new services/utilities
2. Write integration tests for new endpoints
3. Ensure coverage doesn't drop below 80%
4. Run all tests before committing
5. Update this README if adding new test categories
