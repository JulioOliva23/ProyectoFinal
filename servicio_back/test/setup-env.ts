import 'dotenv/config';

// e2e suites never touch the development database.
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required for e2e tests');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
